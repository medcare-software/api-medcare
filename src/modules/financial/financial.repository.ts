import type {
  AccountPayableStatus,
  AccountPayableType,
  PaymentMethod,
  Prisma,
  SubscriptionStatus,
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
  status?: SubscriptionStatus
  paymentMethod?: PaymentMethod
  planId?: string
  search?: string
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

  // "Contas a receber" não é uma tabela própria — deriva de Subscription, já que
  // não existe cobrança/fatura real no sistema (gestão manual, sem gateway de pagamento).
  findManyReceivables(filters: ReceivablesListFilters, pagination: { skip: number; take: number }) {
    return db.subscription.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
        ...(filters.planId && { planId: filters.planId }),
        ...(filters.search && {
          OR: [
            { clinic: { tradeName: { contains: filters.search, mode: 'insensitive' } } },
            { doctor: { user: { name: { contains: filters.search, mode: 'insensitive' } } } },
          ],
        }),
      },
      include: {
        plan: { select: { name: true, basePrice: true } },
        clinic: { select: { tradeName: true, cnpjEncrypted: true } },
        doctor: { select: { user: { select: { name: true, cpfEncrypted: true } } } },
      },
      orderBy: { nextDueDate: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countReceivables(filters: ReceivablesListFilters) {
    return db.subscription.count({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
        ...(filters.planId && { planId: filters.planId }),
        ...(filters.search && {
          OR: [
            { clinic: { tradeName: { contains: filters.search, mode: 'insensitive' } } },
            { doctor: { user: { name: { contains: filters.search, mode: 'insensitive' } } } },
          ],
        }),
      },
    })
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

  // Mesmo padrão de sumActiveSubscriptionRevenue do dashboard — soma em memória
  // porque o valor mensal vive em Plan.basePrice, não em Subscription.
  async summarizeReceivables() {
    const [activeCount, lateCount, cancelledCount, activeAndLate] = await Promise.all([
      db.subscription.count({ where: { status: 'ACTIVE' } }),
      db.subscription.count({ where: { status: 'LATE' } }),
      db.subscription.count({ where: { status: 'CANCELLED' } }),
      db.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'LATE'] } },
        select: { plan: { select: { basePrice: true } } },
      }),
    ])
    const totalMonthlyCents = Math.round(
      activeAndLate.reduce((sum, subscription) => sum + Number(subscription.plan.basePrice), 0) *
        100,
    )
    return { activeCount, lateCount, cancelledCount, totalMonthlyCents }
  },
}
