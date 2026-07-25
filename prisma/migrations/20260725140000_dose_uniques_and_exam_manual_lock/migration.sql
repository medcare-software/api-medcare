-- Dedup before unique: keep earliest medication dose per (medicationId, scheduledAt)
DELETE FROM "medication_dose_records" a
USING "medication_dose_records" b
WHERE a."medicationId" = b."medicationId"
  AND a."scheduledAt" = b."scheduledAt"
  AND a."createdAt" > b."createdAt";

CREATE UNIQUE INDEX "medication_dose_records_medicationId_scheduledAt_key"
  ON "medication_dose_records"("medicationId", "scheduledAt");

-- Dedup before unique: keep earliest vaccine dose per (vaccineId, doseNumber)
DELETE FROM "vaccine_doses" a
USING "vaccine_doses" b
WHERE a."vaccineId" = b."vaccineId"
  AND a."doseNumber" = b."doseNumber"
  AND a."createdAt" > b."createdAt";

CREATE UNIQUE INDEX "vaccine_doses_vaccineId_doseNumber_key"
  ON "vaccine_doses"("vaccineId", "doseNumber");
