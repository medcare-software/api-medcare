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
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>
