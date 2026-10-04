// One-off: moves medical reports, prescription PDFs and invoices that were stored as public
// Cloudinary files to "authenticated" (private) storage and saves the private reference.
// Safe to re-run: rows that already hold a private reference are skipped.
//   npx tsx scripts/make-files-private.ts
import { makeFilePrivate } from "../src/app/config/privateFiles";
import { prisma } from "../src/app/lib/prisma";

const publicLink = { startsWith: "http" };

const run = async () => {
  let moved = 0;
  let failed = 0;
  const convert = async (url: string, save: (ref: string) => Promise<unknown>) => {
    try {
      const ref = await makeFilePrivate(url);
      if (ref) {
        await save(ref);
        moved++;
      } else failed++;
    } catch (error) {
      failed++;
      console.error("could not move a file:", (error as Error).message);
    }
  };
  for (const r of await prisma.medicalReport.findMany({ where: { reportLink: publicLink }, select: { id: true, reportLink: true } })) {
    await convert(r.reportLink, (ref) => prisma.medicalReport.update({ where: { id: r.id }, data: { reportLink: ref } }));
  }
  for (const p of await prisma.prescription.findMany({ where: { pdfUrl: publicLink }, select: { id: true, pdfUrl: true } })) {
    await convert(p.pdfUrl!, (ref) => prisma.prescription.update({ where: { id: p.id }, data: { pdfUrl: ref } }));
  }
  for (const p of await prisma.payment.findMany({ where: { invoiceUrl: publicLink }, select: { id: true, invoiceUrl: true } })) {
    await convert(p.invoiceUrl!, (ref) => prisma.payment.update({ where: { id: p.id }, data: { invoiceUrl: ref } }));
  }
  console.log(`moved to private storage: ${moved}, failed: ${failed}`);
};

run().finally(() => prisma.$disconnect());
