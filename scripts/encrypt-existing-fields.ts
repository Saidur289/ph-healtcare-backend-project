// One-off (safe to re-run): encrypts sensitive columns that were saved before encryption.
//   npx tsx scripts/encrypt-existing-fields.ts
import { encryptJson, encryptText, isEncrypted } from "../src/app/utils/fieldEncryption";
import { prisma } from "../src/app/lib/prisma";

const run = async () => {
  let count = 0;
  for (const p of await prisma.prescription.findMany({ select: { id: true, instructions: true, medicines: true } })) {
    const data: { instructions?: string; medicines?: string } = {};
    if (!isEncrypted(p.instructions)) data.instructions = encryptText(p.instructions);
    if (!isEncrypted(p.medicines)) data.medicines = encryptJson(p.medicines);
    if (Object.keys(data).length) {
      await prisma.prescription.update({ where: { id: p.id }, data });
      count++;
    }
  }
  for (const r of await prisma.medicalReport.findMany({ select: { id: true, reportName: true } })) {
    if (!isEncrypted(r.reportName)) {
      await prisma.medicalReport.update({ where: { id: r.id }, data: { reportName: encryptText(r.reportName) } });
      count++;
    }
  }
  const fields = ["dietaryPreferences", "mentalHealthHistory", "immunizationStatus"] as const;
  for (const h of await prisma.patientHealthData.findMany({ select: { id: true, dietaryPreferences: true, mentalHealthHistory: true, immunizationStatus: true } })) {
    const data: Record<string, string> = {};
    for (const f of fields) {
      const value = h[f];
      if (value && !isEncrypted(value)) data[f] = encryptText(value);
    }
    if (Object.keys(data).length) {
      await prisma.patientHealthData.update({ where: { id: h.id }, data });
      count++;
    }
  }
  console.log(`rows encrypted: ${count}`);
};

run().finally(() => prisma.$disconnect());
