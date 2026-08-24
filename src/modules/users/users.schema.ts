import { z } from 'zod'

const RoleEnum = z.enum(['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'])
const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])

export const ListUsersQuerySchema = z.object({
  role: RoleEnum.optional(),
  status: StatusEnum.optional(),
  search: z.string().min(1).optional(),
  // Filtro de "perfil" da tela de Usuários: admin familiar (isAdmin=true) vs.
  // demais membros — independente de `role` (FAMILY_MEMBER/CAREGIVER caem no
  // mesmo balde de "membro").
  isFamilyAdmin: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  registeredFrom: z.coerce.date().optional(),
  registeredTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>

export const UpdateUserAiEnabledSchema = z
  .object({
    aiEnabled: z.boolean(),
    /** YYYY-MM-DD — início da janela. Null remove o início (vale imediatamente). */
    aiStartsAt: z.string().date().nullable().optional(),
    /** YYYY-MM-DD — último dia com IA. Null remove o prazo. */
    aiEndsAt: z.string().date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.aiStartsAt && value.aiEndsAt && value.aiStartsAt > value.aiEndsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A data de desligamento deve ser igual ou posterior à data de início',
        path: ['aiEndsAt'],
      })
    }
  })

export type UpdateUserAiEnabledInput = z.infer<typeof UpdateUserAiEnabledSchema>
