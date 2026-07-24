import type { Prisma, Supplier } from '@prisma/client'

import { AppError } from '../../shared/errors/index.js'
import {
  decryptField,
  encryptField,
  hashForLookup,
  maskCnpj,
  maskCpf,
  onlyDigits,
  recordAuditEvent,
  recordSensitiveAccess,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
import { ensurePaymentsGenerated } from '../payments/payments.service.js'
import { plansRepository } from '../plans/plans.repository.js'
import { financialRepository } from './financial.repository.js'
import type {
  CancelReceivableInput,
  CreateAccountPayableInput,
  CreateSupplierInput,
  ListAccountsPayableQuery,
  ListReceivablesQuery,
  ListSuppliersQuery,
  MarkPaidInput,
  PayReceivableInput,
  UpdateAccountPayableInput,
  UpdateReceivableInput,
  UpdateSupplierInput,
} from './financial.schema.js'

// CPF tem 11 dígitos, CNPJ tem 14 — usado para escolher a máscara certa do documento
// de um fornecedor, que pode ser pessoa física ou jurídica.
function pickDocumentMask(digits: string) {
  return digits.length === 11 ? maskCpf(digits) : maskCnpj(digits)
}

function maskSupplier(supplier: Supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    document: pickDocumentMask(decryptField(supplier.documentEncrypted)),
    email: supplier.email,
    phone: supplier.phone,
    category: supplier.category,
    status: supplier.status,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  }
}

function revealSupplier(supplier: Supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    document: decryptField(supplier.documentEncrypted),
    email: supplier.email,
    phone: supplier.phone,
    category: supplier.category,
    status: supplier.status,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  }
}

const OPEN_ACCOUNT_PAYABLE_STATUSES = ['PAID', 'PAID_LATE']

// Garante que o Payment do ciclo atual existe pra toda assinatura em dia/atrasada
// antes de calcular "Contas a receber" — sem isso, assinaturas cujo histórico
// nunca foi consultado (ninguém abriu "Ver histórico de pagamentos") ficariam de
// fora do cálculo, já que a geração de Payment é preguiçosa (ver payments.service.ts).
async function ensureCurrentMonthReceivables() {
  const subscriptions = await plansRepository.findActiveOrLateSubscriptions()
  await Promise.all(subscriptions.map((subscription) => ensurePaymentsGenerated(subscription)))
  await financialRepository.markOverdueReceivables()
}

export const financialService = {
  async createSupplier(user: AuthUser, input: CreateSupplierInput) {
    const digits = onlyDigits(input.document)
    const documentHash = hashForLookup(digits)
    const existing = await financialRepository.findSupplierByDocumentHash(documentHash)
    if (existing) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Fornecedor já cadastrado com este documento',
      })
    }

    const supplier = await financialRepository.createSupplier({
      name: input.name,
      documentEncrypted: encryptField(digits),
      documentHash,
      email: input.email,
      phone: input.phone,
      category: input.category,
    })
    await recordAuditEvent({
      actorId: user.id,
      action: 'CREATE_SUPPLIER',
      targetType: 'Supplier',
      targetId: supplier.id,
    })
    return revealSupplier(supplier)
  },

  async listSuppliers(query: ListSuppliersQuery) {
    const filters = {
      ...(query.status && { status: query.status }),
      ...(query.category && { category: query.category }),
      ...(query.search && { search: query.search }),
      ...(query.createdFrom && { createdFrom: query.createdFrom }),
      ...(query.createdTo && { createdTo: query.createdTo }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [suppliers, total] = await Promise.all([
      financialRepository.findManySuppliers(filters, pagination),
      financialRepository.countSuppliers(filters),
    ])
    return { items: suppliers.map(maskSupplier), total }
  },

  async getSupplierById(user: AuthUser, id: string) {
    const supplier = await financialRepository.findSupplierById(id)
    if (!supplier) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
    }

    // PLATFORM_ADMIN nunca é o "dono" do documento do fornecedor — audita a decriptação
    await recordSensitiveAccess({
      actorId: user.id,
      action: 'DECRYPT_SUPPLIER_DOCUMENT',
      targetType: 'Supplier',
      targetId: supplier.id,
    })
    return revealSupplier(supplier)
  },

  async updateSupplier(user: AuthUser, id: string, input: UpdateSupplierInput) {
    const supplier = await financialRepository.findSupplierById(id)
    if (!supplier) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
    }

    let documentFields: { documentEncrypted: Buffer<ArrayBuffer>; documentHash: string } | undefined
    if (input.document) {
      const digits = onlyDigits(input.document)
      const documentHash = hashForLookup(digits)
      const existing = await financialRepository.findSupplierByDocumentHash(documentHash)
      if (existing && existing.id !== id) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Fornecedor já cadastrado com este documento',
        })
      }
      documentFields = { documentEncrypted: encryptField(digits), documentHash }
    }

    const updated = await financialRepository.updateSupplier(
      id,
      omitUndefined({
        name: input.name,
        email: input.email,
        phone: input.phone,
        category: input.category,
        status: input.status,
        ...documentFields,
      }),
    )
    await recordAuditEvent({
      actorId: user.id,
      action: 'UPDATE_SUPPLIER',
      targetType: 'Supplier',
      targetId: id,
    })
    return revealSupplier(updated)
  },

  async deactivateSupplier(id: string) {
    const supplier = await financialRepository.findSupplierById(id)
    if (!supplier) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Fornecedor não encontrado' })
    }
    const openCount = await financialRepository.countOpenPayablesForSupplier(id)
    if (openCount > 0) {
      throw new AppError({ code: 'CONFLICT', message: 'Fornecedor possui contas em aberto' })
    }
    await financialRepository.deactivateSupplier(id)
  },

  async createAccountPayable(user: AuthUser, input: CreateAccountPayableInput) {
    const supplier = await financialRepository.findSupplierById(input.supplierId)
    if (!supplier || supplier.status !== 'ACTIVE') {
      throw new AppError({ code: 'NOT_FOUND', message: 'Fornecedor não encontrado ou inativo' })
    }
    const accountPayable = await financialRepository.createAccountPayable(
      omitUndefined({
        ...input,
        recurrence: input.recurrence as Prisma.InputJsonValue | undefined,
      }),
    )
    await recordAuditEvent({
      actorId: user.id,
      action: 'CREATE_ACCOUNT_PAYABLE',
      targetType: 'AccountPayable',
      targetId: accountPayable.id,
    })
    return accountPayable
  },

  async listAccountsPayable(query: ListAccountsPayableQuery) {
    await financialRepository.markOverdueAccountsPayable()
    const filters = {
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.status && { status: query.status }),
      ...(query.category && { category: query.category }),
      ...(query.dueDateFrom && { dueDateFrom: query.dueDateFrom }),
      ...(query.dueDateTo && { dueDateTo: query.dueDateTo }),
      ...(query.search && { search: query.search }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [items, total] = await Promise.all([
      financialRepository.findManyAccountsPayable(filters, pagination),
      financialRepository.countAccountsPayable(filters),
    ])
    return { items, total }
  },

  async getAccountPayableById(id: string) {
    const accountPayable = await financialRepository.findAccountPayableById(id)
    if (!accountPayable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Conta a pagar não encontrada' })
    }
    return accountPayable
  },

  async updateAccountPayable(user: AuthUser, id: string, input: UpdateAccountPayableInput) {
    const accountPayable = await financialRepository.findAccountPayableById(id)
    if (!accountPayable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Conta a pagar não encontrada' })
    }
    if (OPEN_ACCOUNT_PAYABLE_STATUSES.includes(accountPayable.status)) {
      throw new AppError({ code: 'CONFLICT', message: 'Conta paga não pode ser editada' })
    }
    const updated = await financialRepository.updateAccountPayable(
      id,
      omitUndefined({
        ...input,
        recurrence: input.recurrence as Prisma.InputJsonValue | undefined,
      }),
    )
    await recordAuditEvent({
      actorId: user.id,
      action: 'UPDATE_ACCOUNT_PAYABLE',
      targetType: 'AccountPayable',
      targetId: id,
    })
    return updated
  },

  async payAccountPayable(user: AuthUser, id: string, input: MarkPaidInput) {
    const accountPayable = await financialRepository.findAccountPayableById(id)
    if (!accountPayable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Conta a pagar não encontrada' })
    }
    if (OPEN_ACCOUNT_PAYABLE_STATUSES.includes(accountPayable.status)) {
      throw new AppError({ code: 'CONFLICT', message: 'Conta já está paga' })
    }

    const paidAt = input.paidAt ?? new Date()
    const status = paidAt <= accountPayable.dueDate ? 'PAID' : 'PAID_LATE'

    const updated = await financialRepository.markPaid(
      id,
      omitUndefined({
        status,
        paidAt,
        paymentMethod: input.paymentMethod,
        valueCents: input.valueCents,
        receiptFileId: input.receiptFileId,
        notes: input.notes,
      }),
    )
    await recordAuditEvent({
      actorId: user.id,
      action: 'PAY_ACCOUNT_PAYABLE',
      targetType: 'AccountPayable',
      targetId: id,
    })
    return updated
  },

  async deleteAccountPayable(id: string) {
    const accountPayable = await financialRepository.findAccountPayableById(id)
    if (!accountPayable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Conta a pagar não encontrada' })
    }
    if (OPEN_ACCOUNT_PAYABLE_STATUSES.includes(accountPayable.status)) {
      throw new AppError({ code: 'CONFLICT', message: 'Conta paga não pode ser excluída' })
    }
    await financialRepository.deleteAccountPayable(id)
  },

  // "Contas a receber" deriva de Payment (cobrança por ciclo, ver Subscription/
  // Payment no schema) — mesmo padrão de maskCnpj/maskCpf usado em clinics/doctors:
  // mascara pra exibição, sem gravar AuditLog (não é reveal completo).
  async listReceivables(query: ListReceivablesQuery) {
    await ensureCurrentMonthReceivables()

    const filters = {
      ...(query.status && { status: query.status }),
      ...(query.paymentMethod && { paymentMethod: query.paymentMethod }),
      ...(query.planId && { planId: query.planId }),
      ...(query.search && { search: query.search }),
      ...(query.dueDateFrom && { dueDateFrom: query.dueDateFrom }),
      ...(query.dueDateTo && { dueDateTo: query.dueDateTo }),
      ...(query.referenceMonth && { referenceMonth: query.referenceMonth }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [payments, total] = await Promise.all([
      financialRepository.findManyReceivables(filters, pagination),
      financialRepository.countReceivables(filters),
    ])

    const items = payments.map((payment) => {
      const { subscription } = payment
      const clientName = subscription.clinic?.tradeName ?? subscription.doctor?.user.name ?? '—'
      const clientDocument = subscription.clinic
        ? maskCnpj(decryptField(subscription.clinic.cnpjEncrypted))
        : subscription.doctor?.user.cpfEncrypted
          ? maskCpf(decryptField(subscription.doctor.user.cpfEncrypted))
          : null

      return {
        id: payment.id,
        clientName,
        clientDocument,
        clinicId: subscription.clinic?.id ?? null,
        doctorId: subscription.doctor?.id ?? null,
        planName: subscription.plan.name,
        valueCents: payment.amountCents,
        dueDate: payment.dueDate,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      }
    })

    return { items, total }
  },

  async getReceivablesSummary(referenceMonth?: Date) {
    await ensureCurrentMonthReceivables()
    return financialRepository.summarizeReceivables(referenceMonth)
  },

  // Edição manual de uma cobrança já gerada (dueDate/forma/valor) — diferente de
  // payReceivable, que marca como paga. Só cobranças em aberto podem ser editadas.
  async updateReceivable(user: AuthUser, id: string, input: UpdateReceivableInput) {
    const receivable = await financialRepository.findReceivableById(id)
    if (!receivable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' })
    }
    if (['PAID', 'PAID_LATE', 'CANCELLED'].includes(receivable.status)) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Cobrança paga ou cancelada não pode ser editada',
      })
    }

    const updated = await financialRepository.updateReceivable(
      id,
      omitUndefined({
        dueDate: input.dueDate,
        paymentMethod: input.paymentMethod,
        amountCents: input.valueCents,
      }),
    )
    await recordAuditEvent({
      actorId: user.id,
      action: 'UPDATE_RECEIVABLE',
      targetType: 'Payment',
      targetId: id,
    })
    return updated
  },

  async payReceivable(user: AuthUser, id: string, input: PayReceivableInput) {
    const receivable = await financialRepository.findReceivableById(id)
    if (!receivable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' })
    }
    if (['PAID', 'PAID_LATE', 'CANCELLED'].includes(receivable.status)) {
      throw new AppError({ code: 'CONFLICT', message: 'Cobrança já está paga ou cancelada' })
    }

    const paidAt = input.paidAt ?? new Date()
    const status = paidAt <= receivable.dueDate ? 'PAID' : 'PAID_LATE'

    const updated = await financialRepository.updateReceivable(
      id,
      omitUndefined({
        status,
        paidAt,
        paymentMethod: input.paymentMethod,
        amountCents: input.valueCents,
      }),
    )
    await recordAuditEvent({
      actorId: user.id,
      action: 'PAY_RECEIVABLE',
      targetType: 'Payment',
      targetId: id,
    })
    return updated
  },

  async cancelReceivable(user: AuthUser, id: string, input: CancelReceivableInput) {
    const receivable = await financialRepository.findReceivableById(id)
    if (!receivable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' })
    }
    if (['PAID', 'PAID_LATE', 'CANCELLED'].includes(receivable.status)) {
      throw new AppError({ code: 'CONFLICT', message: 'Cobrança já está paga ou cancelada' })
    }

    const updated = await financialRepository.cancelReceivable(id, input.reason)
    await recordAuditEvent({
      actorId: user.id,
      action: 'CANCEL_RECEIVABLE',
      targetType: 'Payment',
      targetId: id,
    })
    return updated
  },

  async getAccountsPayableSummary() {
    await financialRepository.markOverdueAccountsPayable()
    const summary = await financialRepository.summarizeAccountsPayable()
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const suppliersCreatedThisMonth =
      await financialRepository.countSuppliersCreatedSince(monthStart)
    return { ...summary, suppliersCreatedThisMonth }
  },
}
