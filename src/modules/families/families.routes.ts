import type { FastifyInstance } from 'fastify'

import { issueTokens } from '../../shared/auth/issue-tokens.js'
import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateFamilyMemberSchema,
  RegisterSchema,
  UpdateFamilyMemberSchema,
  UpsertHealthProfileSchema,
} from './families.schema.js'
import { familiesService } from './families.service.js'

// Roster inteiro da família — FAMILY_MEMBER fica de fora (o service não restringe
// por member nessa listagem, incluí-lo aqui vazaria dados de outros membros).
const FAMILY_READERS = ['PATIENT_ADMIN', 'CAREGIVER'] as const
// Um único membro — FAMILY_MEMBER pode buscar (o service restringe ao próprio via
// getScopedOrThrow), necessário para ele conseguir carregar o próprio perfil.
const FAMILY_MEMBER_READERS = ['PATIENT_ADMIN', 'CAREGIVER', 'FAMILY_MEMBER'] as const
// PATIENT_ADMIN gerencia (cria/exclui) qualquer membro da família — CAREGIVER só lê.
const FAMILY_WRITERS = ['PATIENT_ADMIN'] as const
// Editar perfil (nome/nascimento/saúde) — FAMILY_MEMBER pode, restrito ao próprio
// registro (o service restringe via getScopedOrThrow).
const FAMILY_PROFILE_WRITERS = ['PATIENT_ADMIN', 'FAMILY_MEMBER'] as const

export default async function familiesRoutes(fastify: FastifyInstance) {
  // POST /auth/register — admin familiar cria a própria conta + a família
  fastify.post('/auth/register', async (req, reply) => {
    const body = RegisterSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }

    const user = await familiesService.registerAdmin(body.data)
    const tokens = await issueTokens(fastify, { id: user.id, role: user.role })

    return reply.status(201).send({
      data: {
        ...tokens,
        user: { id: user.id, email: user.email, role: user.role },
      },
    })
  })

  // POST /families/:familyId/members — cadastra morador; com email, cria login
  // (User FAMILY_MEMBER) e dispara e-mail de ativação — ver families.service.ts
  fastify.post(
    '/families/:familyId/members',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const { familyId } = req.params as { familyId: string }
      const body = CreateFamilyMemberSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const member = await familiesService.createMember(fastify, req.user, familyId, body.data)
      return reply.status(201).send({ data: member })
    },
  )

  // GET /families/:familyId/members
  fastify.get(
    '/families/:familyId/members',
    { preHandler: [authenticate, authorize(...FAMILY_READERS)] },
    async (req, reply) => {
      const { familyId } = req.params as { familyId: string }
      const members = await familiesService.listMembers(req.user, familyId)
      return reply.status(200).send({ data: members })
    },
  )

  // GET /family-members/:id
  fastify.get(
    '/family-members/:id',
    { preHandler: [authenticate, authorize(...FAMILY_MEMBER_READERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const member = await familiesService.getMember(req.user, id)
      return reply.status(200).send({ data: member })
    },
  )

  // PATCH /family-members/:id — PATIENT_ADMIN edita qualquer membro; FAMILY_MEMBER só o próprio
  fastify.patch(
    '/family-members/:id',
    { preHandler: [authenticate, authorize(...FAMILY_PROFILE_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateFamilyMemberSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const member = await familiesService.updateMember(req.user, id, body.data)
      return reply.status(200).send({ data: member })
    },
  )

  // PUT /family-members/:id/health-profile — PATIENT_ADMIN qualquer membro; FAMILY_MEMBER só o próprio
  fastify.put(
    '/family-members/:id/health-profile',
    { preHandler: [authenticate, authorize(...FAMILY_PROFILE_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpsertHealthProfileSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const healthProfile = await familiesService.upsertHealthProfile(req.user, id, body.data)
      return reply.status(200).send({ data: healthProfile })
    },
  )

  // DELETE /family-members/:id — só PATIENT_ADMIN, soft delete (bloqueado para o próprio admin)
  fastify.delete(
    '/family-members/:id',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await familiesService.deleteMember(req.user, id)
      return reply.status(204).send()
    },
  )
}
