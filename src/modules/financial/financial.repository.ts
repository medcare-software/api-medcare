import type {
  AccountPayableStatus,
  AccountPayableType,
  PaymentMethod,
  Prisma,
  SupplierCategory,
  UserStatus,
} from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

type SupplierListFilters = {
  status?: UserStatus
  category?: SupplierCategory
  search?: string
}

type CreateSupplierData = {
  name: string
  documentEncrypted: Buffer<ArrayBuffer>
  documentHash: string
  email: string
  phone: string
  category: SupplierCategory
}

type UpdateSupplierData = {
  name?: string
  documentEncrypted?: Buffer<ArrayBuffer>
  documentHash?: string
  email?: string
  phone?: string
  category?: SupplierCategory
  status?: UserStatus
}

type AccountPayableListFilters = {
  supplierId?: string
  status?: AccountPayableStatus
  category?: SupplierCategory
  dueDateFrom?: Date
  dueDateTo?: Date
  search?: string
}

type CreateAccountPayableData = {
  supplierId: string
  description: string
  category: SupplierCategory
  valueCents: number
  dueDate: Date
  paymentMethod: PaymentMethod
  type: AccountPayableType
  recurrence?: Prisma.InputJsonValue
}

type UpdateAccountPayableData = {
  description?: string
  category?: SupplierCategory
  valueCents?: number
  dueDate?: Date
  paymentMethod?: PaymentMethod
  type?: AccountPayableType
  recurrence?: Prisma.InputJsonValue
  receiptFileId?: string
}

type MarkPaidData = {
  status: AccountPayableStatus
  paidAt: Date
  receiptFileId?: string
}

type ReceivablesListFilters = {
  status?: AccountPayableStatus
  paymentMethod?: PaymentMethod
  planId?: string
  search?: string
}

// Primeiro dia do mês corrente — todo cálculo de "Contas a receber" é escopado
// ao ciclo de cobrança atual (ver comentário de summarizeReceivables).
function currentReferenceMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function receivablesWhere(filters: ReceivablesListFilters): Prisma.PaymentWhereInput {
  return {
    referenceMonth: currentReferenceMonth(),
    ...(filters.status && { status: filters.status }),
    ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
    ...((filters.planId || filters.search) && {
      subscription: {
        ...(filters.planId && { planId: filters.planId }),
        ...(filters.search && {
          OR: [
            { clinic: { tradeName: { contains: filters.search, mode: 'insensitive' } } },
            { doctor: { user: { name: { contains: filters.search, mode: 'insensitive' } } } },
          ],
        }),
      },
    }),
  }
}

export const financialRepository = {
  findSupplierByDocumentHash(documentHash: string) {
    return db.supplier.findUnique({ where: { documentHash } })
  },

  findManySuppliers(filters: SupplierListFilters, pagination: { skip: number; take: number }) {
    return db.supplier.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.category && { category: filters.category }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countSuppliers(filters: SupplierListFilters) {
    return db.supplier.count({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.category && { category: filters.category }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
    })
  },

  findSupplierById(id: string) {
    return db.supplier.findUnique({ where: { id } })
  },

  createSupplier(data: CreateSupplierData) {
    return db.supplier.create({ data: { ...data, status: 'ACTIVE' } })
  },

  updateSupplier(id: string, data: UpdateSupplierData) {
    return db.supplier.update({ where: { id }, data: omitUndefined(data) })
  },

  deactivateSupplier(id: string) {
    return db.supplier.update({ where: { id }, data: { status: 'INACTIVE' } })
  },

  countOpenPayablesForSupplier(supplierId: string) {
    return db.accountPayable.count({
      where: { supplierId, status: { in: ['PENDING', 'OVERDUE'] } },
    })
  },

  findManyAccountsPayable(
    filters: AccountPayableListFilters,
    pagination: { skip: number; take: number },
  ) {
    return db.accountPayable.findMany({
      where: {
        ...(filters.supplierId && { supplierId: filters.supplierId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.category && { category: filters.category }),
        ...((filters.dueDateFrom || filters.dueDateTo) && {
          dueDate: {
            ...(filters.dueDateFrom && { gte: filters.dueDateFrom }),
            ...(filters.dueDateTo && { lte: filters.dueDateTo }),
          },
        }),
        ...(filters.search && {
          OR: [
            { description: { contains: filters.search, mode: 'insensitive' } },
            { supplier: { name: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }),
      },
      orderBy: { dueDate: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countAccountsPayable(filters: AccountPayableListFilters) {
    return db.accountPayable.count({
      where: {
        ...(filters.supplierId && { supplierId: filters.supplierId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.category && { category: filters.category }),
        ...((filters.dueDateFrom || filters.dueDateTo) && {
          dueDate: {
            ...(filters.dueDateFrom && { gte: filters.dueDateFrom }),
            ...(filters.dueDateTo && { lte: filters.dueDateTo }),
          },
        }),
        ...(filters.search && {
          OR: [
            { description: { contains: filters.search, mode: 'insensitive' } },
            { supplier: { name: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }),
      },
    })
  },

  findAccountPayableById(id: string) {
    return db.accountPayable.findUnique({ where: { id } })
  },

  createAccountPayable(data: CreateAccountPayableData) {
    return db.accountPayable.create({ data: omitUndefined({ ...data, status: 'PENDING' }) })
  },

  updateAccountPayable(id: string, data: UpdateAccountPayableData) {
    return db.accountPayable.update({ where: { id }, data: omitUndefined(data) })
  },

  markPaid(id: string, data: MarkPaidData) {
    return db.accountPayable.update({ where: { id }, data: omitUndefined(data) })
  },

  deleteAccountPayable(id: string) {
    return db.accountPayable.delete({ where: { id } })
  },

  // "Contas a receber" deriva de Payment (cobrança individual por ciclo, ver
  // schema.prisma), escopada ao mês de referência corrente — quem garante que
  // o Payment do ciclo atual existe antes desta query é financialService
  // (ensureCurrentMonthReceivables), não o repository.
  findManyReceivables(filters: ReceivablesListFilters, pagination: { skip: number; take: number }) {
    return db.payment.findMany({
      where: receivablesWhere(filters),
      include: {
        subscription: {
          include: {
            plan: { select: { name: true } },
            clinic: { select: { tradeName: true, cnpjEncrypted: true } },
            doctor: { select: { user: { select: { name: true, cpfEncrypted: true } } } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countReceivables(filters: ReceivablesListFilters) {
    return db.payment.count({ where: receivablesWhere(filters) })
  },

  async summarizeAccountsPayable() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [pending, overdue, paidThisMonth] = await Promise.all([
      db.accountPayable.aggregate({
        where: { status: 'PENDING' },
        _sum: { valueCents: true },
        _count: { _all: true },
      }),
      db.accountPayable.aggregate({
        where: { status: 'OVERDUE' },
        _sum: { valueCents: true },
        _count: { _all: true },
      }),
      db.accountPayable.aggregate({
        where: {
          status: { in: ['PAID', 'PAID_LATE'] },
          paidAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
        _sum: { valueCents: true },
        _count: { _all: true },
      }),
    ])

    return {
      pendingCents: pending._sum.valueCents ?? 0,
      pendingCount: pending._count._all,
      overdueCents: overdue._sum.valueCents ?? 0,
      overdueCount: overdue._count._all,
      paidThisMonthCents: paidThisMonth._sum.valueCents ?? 0,
      paidThisMonthCount: paidThisMonth._count._all,
    }
  },

  // Baseado nos Payment (cobrança por ciclo) do mês de referência corrente —
  // financialService.getReceivablesSummary() garante que esses registros
  // existem (ensureCurrentMonthReceivables) antes de chamar esta função.
  // Recebido = PAID/PAID_LATE, Pendente = PENDING (vence este mês, não pago),
  // Inadimplentes = OVERDUE (já passou do vencimento). Total = soma dos três.
  async summarizeReceivables() {
    const rows = await db.payment.groupBy({
      by: ['status'],
      where: { referenceMonth: currentReferenceMonth() },
      _sum: { amountCents: true },
      _count: { _all: true },
    })

    const byStatus = Object.fromEntries(rows.map((row) => [row.status, row])) as Partial<
      Record<AccountPayableStatus, (typeof rows)[number]>
    >

    const receivedCents =
      (byStatus.PAID?._sum.amountCents ?? 0) + (byStatus.PAID_LATE?._sum.amountCents ?? 0)
    const receivedCount = (byStatus.PAID?._count._all ?? 0) + (byStatus.PAID_LATE?._count._all ?? 0)
    const pendingCents = byStatus.PENDING?._sum.amountCents ?? 0
    const pendingCount = byStatus.PENDING?._count._all ?? 0
    const overdueCents = byStatus.OVERDUE?._sum.amountCents ?? 0
    const overdueCount = byStatus.OVERDUE?._count._all ?? 0

    return {
      totalMonthlyCents: receivedCents + pendingCents + overdueCents,
      totalCount: receivedCount + pendingCount + overdueCount,
      receivedCents,
      receivedCount,
      pendingCents,
      pendingCount,
      overdueCents,
      overdueCount,
    }
  },

  countSuppliersCreatedSince(since: Date) {
    return db.supplier.count({ where: { createdAt: { gte: since } } })
  },
}
