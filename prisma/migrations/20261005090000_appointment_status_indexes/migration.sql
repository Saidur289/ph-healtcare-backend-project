-- Composite indexes for the real query patterns (plan.md 12.1). The (patientId) and (doctorId)
-- indexes are replaced: a composite index also serves queries on its first column alone.
DROP INDEX IF EXISTS "appointments_patientId_idx";
DROP INDEX IF EXISTS "appointments_doctorId_idx";
CREATE INDEX "appointments_patientId_status_idx" ON "appointments"("patientId", "status");
CREATE INDEX "appointments_doctorId_status_idx" ON "appointments"("doctorId", "status");
