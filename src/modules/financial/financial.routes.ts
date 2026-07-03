import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateAccountPayableSchema,
  CreateSupplierSchema,
  ListAccountsPayableQuerySchema,
  ListSuppliersQuerySchema,
  MarkPaidSchema,
  UpdateAccountPayableSchema,
  UpdateSupplierSchema,
} from './financial.schema.js'
import { financialService } from './financial.service.js'

// Fornecedores/contas a pagar são operação interna da plataforma — sem escopo de
// clínica/médico, então só PLATFORM_ADMIN acessa qualquer rota deste módulo.
export default async function financialRoutes(fastify: FastifyInstance) {
  // POST /suppliers
  fastify.post(
    '/suppliers',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const body = CreateSupplierSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const supplier = await financialService.createSupplier(body.data)
      return reply.status(201).send({ data: supplier })
    },
  )

  // GET /suppliers?status=&category=&search=&page=&pageSize=
  fastify.get(
    '/suppliers',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListSuppliersQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const suppliers = await financialService.listSuppliers(query.data)
      return reply.status(200).send({ data: suppliers })
    },
  )

  // GET /suppliers/:id — retorna document decriptado (gera AuditLog)
  fastify.get(
    '/suppliers/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const supplier = await financialService.getSupplierById(req.user, id)
      return reply.status(200).send({ data: supplier })
    },
  )

  // PATCH /suppliers/:id
  fastify.patch(
    '/suppliers/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateSupplierSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const supplier = await financialService.updateSupplier(id, body.data)
      return reply.status(200).send({ data: supplier })
    },
  )

  // DELETE /suppliers/:id — status: INACTIVE (bloqueado se houver conta em aberto)
  fastify.delete(
    '/suppliers/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await financialService.deactivateSupplier(id)
      return reply.status(204).send()
    },
  )

  // POST /accounts-payable
  fastify.post(
    '/accounts-payable',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const body = CreateAccountPayableSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const accountPayable = await financialService.createAccountPayable(body.data)
      return reply.status(201).send({ data: accountPayable })
    },
  )

  // GET /accounts-payable?supplierId=&status=&category=&dueDateFrom=&dueDateTo=
  fastify.get(
    '/accounts-payable',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListAccountsPayableQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const accountsPayable = await financialService.listAccountsPayable(query.data)
      return reply.status(200).send({ data: accountsPayable })
    },
  )

  // GET /accounts-payable/:id
  fastify.get(
    '/accounts-payable/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const accountPayable = await financialService.getAccountPayableById(id)
      return reply.status(200).send({ data: accountPayable })
    },
  )

  // PATCH /accounts-payable/:id — bloqueado se já paga
  fastify.patch(
    '/accounts-payable/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateAccountPayableSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const accountPayable = await financialService.updateAccountPayable(id, body.data)
      return reply.status(200).send({ data: accountPayable })
    },
  )

  // POST /accounts-payable/:id/pay
  fastify.post(
    '/accounts-payable/:id/pay',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = MarkPaidSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const accountPayable = await financialService.payAccountPayable(id, body.data)
      return reply.status(200).send({ data: accountPayable })
    },
  )

  // DELETE /accounts-payable/:id — bloqueado se já paga (preserva histórico financeiro)
  fastify.delete(
    '/accounts-payable/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await financialService.deleteAccountPayable(id)
      return reply.status(204).send()
    },
  )
}
