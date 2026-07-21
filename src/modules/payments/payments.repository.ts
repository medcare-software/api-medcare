import type { AccountPayableStatus, Prisma } from '@prisma/client'

import { db } from '../../config/database.js'

type PaymentListFilters = {
  year?: number
  month?: number
  status?: AccountPayableStatus
}

function buildWhere(
  subscriptionIds: string[],
  filters: PaymentListFilters,
): Prisma.PaymentWhereInput {
  return {
    subscriptionId: { in: subscriptionIds },
    ...(filters.status && { status: filters.status }),
    ...((filters.year || filters.month) && {
      referenceMonth: {
        ...(filters.year && {
          gte: new Date(filters.year, filters.month ? filters.month - 1 : 0, 1),
          lt: filters.month
            ? new Date(filters.year, filters.month, 1)
            : new Date(filters.year + 1, 0, 1),
        }),
      },
    }),
  }
}

export const paymentsRepository = {
  findMany(
    subscriptionIds: string[],
    filters: PaymentListFilters,
    pagination: { skip: number; take: number },
  ) {
    return db.payment.findMany({
      where: buildWhere(subscriptionIds, filters),
      orderBy: { dueDate: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  count(subscriptionIds: string[], filters: PaymentListFilters) {
    return db.payment.count({ where: buildWhere(subscriptionIds, filters) })
  },

  async aggregate(subscriptionIds: string[]) {
    const [paid, pending] = await Promise.all([
      db.payment.aggregate({
        where: { subscriptionId: { in: subscriptionIds }, status: { in: ['PAID', 'PAID_LATE'] } },
        _sum: { amountCents: true },
      }),
      db.payment.aggregate({
        where: { subscriptionId: { in: subscriptionIds }, status: { in: ['PENDING', 'OVERDUE'] } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ])
    return {
      totalPaidCents: paid._sum.amountCents ?? 0,
      totalPendingCents: pending._sum.amountCents ?? 0,
      pendingCount: pending._count._all,
    }
  },

  findLatestPaid(subscriptionIds: string[]) {
    return db.payment.findFirst({
      where: { subscriptionId: { in: subscriptionIds }, status: { in: ['PAID', 'PAID_LATE'] } },
      orderBy: { paidAt: 'desc' },
    })
  },

  createManySkippingDuplicates(rows: Prisma.PaymentCreateManyInput[]) {
    return db.payment.createMany({ data: rows, skipDuplicates: true })
  },
}
