import bcrypt from 'bcryptjs'

import { env } from '../../config/env.js'
import { resolveClinicId, resolveDoctorId } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { encryptField, hashForLookup, onlyDigits } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
import { doctorsRepository } from './doctors.repository.js'
import type {
  CreateDoctorInput,
  ListDoctorsQuery,
  UpdateDoctorInput,
  UpdateDoctorSelfInput,
} from './doctors.schema.js'

export const doctorsService = {
  async create(input: CreateDoctorInput) {
    const existingUser = await doctorsRepository.findUserByEmail(input.email)
    if (existingUser) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }

    const crmState = input.crmState.toUpperCase()
    const existingDoctor = await doctorsRepository.findByCrm(input.crmNumber, crmState)
    if (existingDoctor) {
      throw new AppError({ code: 'CONFLICT', message: 'CRM já cadastrado' })
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS)
    const cpfDigits = onlyDigits(input.cpf)

    return doctorsRepository.createWithUser({
      email: input.email,
      passwordHash,
      ...(input.phone !== undefined && { phone: input.phone }),
      cpfEncrypted: encryptField(cpfDigits),
      cpfHash: hashForLookup(cpfDigits),
      crmNumber: input.crmNumber,
      crmState,
      specialties: input.specialties,
      ...(input.planId !== undefined && { planId: input.planId }),
    })
  },

  async list(user: AuthUser, query: ListDoctorsQuery) {
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }

    if (user.role === 'CLINIC_ADMIN') {
      const clinicId = await resolveClinicId(user.id)
      return doctorsRepository.findManyLinkedToClinic(clinicId, pagination)
    }

    return doctorsRepository.findMany(
      {
        ...(query.status && { status: query.status }),
        ...(query.specialty && { specialty: query.specialty }),
        ...(query.search && { search: query.search }),
      },
      pagination,
    )
  },

  async getById(user: AuthUser, id: string) {
    if (user.role === 'CLINIC_ADMIN') {
      const clinicId = await resolveClinicId(user.id)
      const doctor = await doctorsRepository.findLinkedToClinic(id, clinicId)
      if (!doctor) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
      }
      return doctor
    }

    const doctor = await doctorsRepository.findById(id)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }
    return doctor
  },

  async getSelf(user: AuthUser) {
    const doctorId = await resolveDoctorId(user.id)
    const doctor = await doctorsRepository.findById(doctorId)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }
    return doctor
  },

  async update(id: string, input: UpdateDoctorInput) {
    const doctor = await doctorsRepository.findById(id)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }

    if (input.crmNumber || input.crmState) {
      const crmNumber = input.crmNumber ?? doctor.crmNumber
      const crmState = (input.crmState ?? doctor.crmState).toUpperCase()
      const existing = await doctorsRepository.findByCrm(crmNumber, crmState)
      if (existing && existing.id !== id) {
        throw new AppError({ code: 'CONFLICT', message: 'CRM já cadastrado' })
      }
    }

    const { phone, ...doctorFields } = input
    if (phone !== undefined) {
      await doctorsRepository.updateUserPhone(doctor.userId, phone)
    }

    return doctorsRepository.update(
      id,
      omitUndefined({
        ...doctorFields,
        ...(input.crmState && { crmState: input.crmState.toUpperCase() }),
      }),
    )
  },

  async updateSelf(user: AuthUser, input: UpdateDoctorSelfInput) {
    const doctorId = await resolveDoctorId(user.id)

    if (input.phone !== undefined) {
      await doctorsRepository.updateUserPhone(user.id, input.phone)
    }

    const { phone, ...doctorFields } = input
    return doctorsRepository.update(doctorId, omitUndefined(doctorFields))
  },

  async deactivate(id: string) {
    const doctor = await doctorsRepository.findById(id)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }
    await doctorsRepository.deactivateTx(doctor.id, doctor.userId)
  },
}
