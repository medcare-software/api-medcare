import type { Supplier } from '@prisma/client'

import { AppError } from '../../shared/errors/index.js'
import {
  decryptField,
  encryptField,
  hashForLookup,
  maskCnpj,
  maskCpf,
  onlyDigits,
  recordSensitiveAccess,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
import { financialRepository } from './financial.repository.js'
import type {
  CreateAccountPayableInput,
  CreateSupplierInput,
  ListAccountsPayableQuery,
  ListSuppliersQuery,
  MarkPaidInput,
  UpdateAccountPayableInput,
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

export const financialService = {
  async createSupplier(input: CreateSupplierInput) {
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
    return revealSupplier(supplier)
  },

  async listSuppliers(query: ListSuppliersQuery) {
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const suppliers = await financialRepository.findManySuppliers(
      {
        ...(query.status && { status: query.status }),
        ...(query.category && { category: query.category }),
        ...(query.search && { search: query.search }),
      },
      pagination,
    )
    return suppliers.map(maskSupplier)
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

  async updateSupplier(id: string, input: UpdateSupplierInput) {
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

  async createAccountPayable(input: CreateAccountPayableInput) {
    const supplier = await financialRepository.findSupplierById(input.supplierId)
    if (!supplier || supplier.status !== 'ACTIVE') {
      throw new AppError({ code: 'NOT_FOUND', message: 'Fornecedor não encontrado ou inativo' })
    }
    return financialRepository.createAccountPayable(input)
  },

  async listAccountsPayable(query: ListAccountsPayableQuery) {
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    return financialRepository.findManyAccountsPayable(
      {
        ...(query.supplierId && { supplierId: query.supplierId }),
        ...(query.status && { status: query.status }),
        ...(query.category && { category: query.category }),
        ...(query.dueDateFrom && { dueDateFrom: query.dueDateFrom }),
        ...(query.dueDateTo && { dueDateTo: query.dueDateTo }),
      },
      pagination,
    )
  },

  async getAccountPayableById(id: string) {
    const accountPayable = await financialRepository.findAccountPayableById(id)
    if (!accountPayable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Conta a pagar não encontrada' })
    }
    return accountPayable
  },

  async updateAccountPayable(id: string, input: UpdateAccountPayableInput) {
    const accountPayable = await financialRepository.findAccountPayableById(id)
    if (!accountPayable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Conta a pagar não encontrada' })
    }
    if (OPEN_ACCOUNT_PAYABLE_STATUSES.includes(accountPayable.status)) {
      throw new AppError({ code: 'CONFLICT', message: 'Conta paga não pode ser editada' })
    }
    return financialRepository.updateAccountPayable(id, omitUndefined(input))
  },

  async payAccountPayable(id: string, input: MarkPaidInput) {
    const accountPayable = await financialRepository.findAccountPayableById(id)
    if (!accountPayable) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Conta a pagar não encontrada' })
    }
    if (OPEN_ACCOUNT_PAYABLE_STATUSES.includes(accountPayable.status)) {
      throw new AppError({ code: 'CONFLICT', message: 'Conta já está paga' })
    }

    const paidAt = new Date()
    const status = paidAt <= accountPayable.dueDate ? 'PAID' : 'PAID_LATE'

    return financialRepository.markPaid(
      id,
      omitUndefined({ status, paidAt, receiptFileId: input.receiptFileId }),
    )
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
}
