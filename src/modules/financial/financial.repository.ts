import type {
  AccountPayableStatus,
  AccountPayableType,
  PaymentMethod,
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
}

type CreateAccountPayableData = {
  supplierId: string
  description: string
  category: SupplierCategory
  valueCents: number
  dueDate: Date
  paymentMethod: PaymentMethod
  type: AccountPayableType
}

type UpdateAccountPayableData = {
  description?: string
  category?: SupplierCategory
  valueCents?: number
  dueDate?: Date
  paymentMethod?: PaymentMethod
  type?: AccountPayableType
  receiptFileId?: string
}

type MarkPaidData = {
  status: AccountPayableStatus
  paidAt: Date
  receiptFileId?: string
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
      },
      orderBy: { dueDate: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  findAccountPayableById(id: string) {
    return db.accountPayable.findUnique({ where: { id } })
  },

  createAccountPayable(data: CreateAccountPayableData) {
    return db.accountPayable.create({ data: { ...data, status: 'PENDING' } })
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
}
