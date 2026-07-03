import type { Clinic, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { env } from '../../config/env.js'
import { resolveClinicId } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import {
  decryptField,
  encryptField,
  hashForLookup,
  maskCnpj,
  onlyDigits,
  recordSensitiveAccess,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
import { clinicsRepository } from './clinics.repository.js'
import type {
  CreateClinicInput,
  LinkDoctorInput,
  ListClinicDoctorsQuery,
  ListClinicsQuery,
  ToggleLinkInput,
  UpdateClinicInput,
  UpdateClinicSelfInput,
} from './clinics.schema.js'

function maskClinic(clinic: Clinic) {
  return {
    id: clinic.id,
    tradeName: clinic.tradeName,
    cnpj: maskCnpj(decryptField(clinic.cnpjEncrypted)),
    email: clinic.email,
    phone: clinic.phone,
    address: clinic.address,
    planId: clinic.planId,
    status: clinic.status,
    createdAt: clinic.createdAt,
    updatedAt: clinic.updatedAt,
  }
}

function revealClinic(clinic: Clinic) {
  return {
    id: clinic.id,
    legalName: decryptField(clinic.legalNameEncrypted),
    tradeName: clinic.tradeName,
    cnpj: decryptField(clinic.cnpjEncrypted),
    email: clinic.email,
    phone: clinic.phone,
    address: clinic.address,
    planId: clinic.planId,
    status: clinic.status,
    createdAt: clinic.createdAt,
    updatedAt: clinic.updatedAt,
  }
}

async function resolveScopedClinicId(user: AuthUser, clinicId: string): Promise<string> {
  if (user.role === 'CLINIC_ADMIN') {
    const ownClinicId = await resolveClinicId(user.id)
    if (ownClinicId !== clinicId) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }
  }
  return clinicId
}

export const clinicsService = {
  async create(input: CreateClinicInput) {
    const existingAdmin = await clinicsRepository.findUserByEmail(input.adminEmail)
    if (existingAdmin) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail do administrador já cadastrado' })
    }

    const cnpjDigits = onlyDigits(input.cnpj)
    const cnpjHash = hashForLookup(cnpjDigits)
    const existingClinic = await clinicsRepository.findByCnpjHash(cnpjHash)
    if (existingClinic) {
      throw new AppError({ code: 'CONFLICT', message: 'CNPJ já cadastrado' })
    }

    const adminPasswordHash = await bcrypt.hash(input.adminPassword, env.BCRYPT_ROUNDS)

    const clinic = await clinicsRepository.createWithAdmin({
      legalNameEncrypted: encryptField(input.legalName),
      tradeName: input.tradeName,
      cnpjEncrypted: encryptField(cnpjDigits),
      cnpjHash,
      email: input.email,
      phone: input.phone,
      address: input.address as Prisma.InputJsonValue,
      ...(input.planId !== undefined && { planId: input.planId }),
      adminEmail: input.adminEmail,
      adminPasswordHash,
      ...(input.adminPhone !== undefined && { adminPhone: input.adminPhone }),
    })

    return revealClinic(clinic)
  },

  async list(query: ListClinicsQuery) {
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const clinics = await clinicsRepository.findMany(
      {
        ...(query.status && { status: query.status }),
        ...(query.search && { search: query.search }),
      },
      pagination,
    )
    return clinics.map(maskClinic)
  },

  async getById(user: AuthUser, id: string) {
    const clinic = await clinicsRepository.findById(id)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }

    if (user.role === 'CLINIC_ADMIN') {
      const ownClinicId = await resolveClinicId(user.id)
      if (ownClinicId !== id) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
      }
      return revealClinic(clinic)
    }

    // PLATFORM_ADMIN decriptando dado de uma clínica que não é a sua — nunca é o
    // dono do dado, então toda decriptação aqui precisa ficar registrada.
    await recordSensitiveAccess({
      actorId: user.id,
      action: 'DECRYPT_CLINIC_CNPJ',
      targetType: 'Clinic',
      targetId: clinic.id,
    })
    return revealClinic(clinic)
  },

  async getSelf(user: AuthUser) {
    const clinicId = await resolveClinicId(user.id)
    const clinic = await clinicsRepository.findById(clinicId)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }
    return revealClinic(clinic)
  },

  async update(id: string, input: UpdateClinicInput) {
    const clinic = await clinicsRepository.findById(id)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }

    let cnpjFields: { cnpjEncrypted: Buffer<ArrayBuffer>; cnpjHash: string } | undefined
    if (input.cnpj) {
      const digits = onlyDigits(input.cnpj)
      const cnpjHash = hashForLookup(digits)
      const existing = await clinicsRepository.findByCnpjHash(cnpjHash)
      if (existing && existing.id !== id) {
        throw new AppError({ code: 'CONFLICT', message: 'CNPJ já cadastrado' })
      }
      cnpjFields = { cnpjEncrypted: encryptField(digits), cnpjHash }
    }

    const updated = await clinicsRepository.update(
      id,
      omitUndefined({
        ...(input.legalName !== undefined && { legalNameEncrypted: encryptField(input.legalName) }),
        tradeName: input.tradeName,
        email: input.email,
        phone: input.phone,
        address: input.address as Prisma.InputJsonValue | undefined,
        planId: input.planId,
        status: input.status,
        ...cnpjFields,
      }),
    )
    return revealClinic(updated)
  },

  async updateSelf(user: AuthUser, input: UpdateClinicSelfInput) {
    const clinicId = await resolveClinicId(user.id)
    const updated = await clinicsRepository.update(
      clinicId,
      omitUndefined({
        tradeName: input.tradeName,
        email: input.email,
        phone: input.phone,
        address: input.address as Prisma.InputJsonValue | undefined,
      }),
    )
    return revealClinic(updated)
  },

  async deactivate(id: string) {
    const clinic = await clinicsRepository.findById(id)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }
    await clinicsRepository.deactivateTx(id)
  },

  async listDoctors(user: AuthUser, clinicId: string, query: ListClinicDoctorsQuery) {
    const scopedClinicId = await resolveScopedClinicId(user, clinicId)
    return clinicsRepository.findDoctorLinks(scopedClinicId, query.includeInactive ?? false)
  },

  async linkDoctor(user: AuthUser, clinicId: string, input: LinkDoctorInput) {
    const scopedClinicId = await resolveScopedClinicId(user, clinicId)

    const doctor = await clinicsRepository.findDoctorById(input.doctorId)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }

    const existingLink = await clinicsRepository.findLink(scopedClinicId, input.doctorId)
    if (existingLink?.active) {
      throw new AppError({ code: 'CONFLICT', message: 'Médico já vinculado a esta clínica' })
    }

    return clinicsRepository.upsertLink(scopedClinicId, input.doctorId)
  },

  async toggleDoctorLink(
    user: AuthUser,
    clinicId: string,
    doctorId: string,
    input: ToggleLinkInput,
  ) {
    const scopedClinicId = await resolveScopedClinicId(user, clinicId)

    const link = await clinicsRepository.findLink(scopedClinicId, doctorId)
    if (!link) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado' })
    }

    return clinicsRepository.toggleLink(scopedClinicId, doctorId, input.active)
  },
}
