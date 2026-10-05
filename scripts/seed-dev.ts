// Development data: 10 specialties, 20 doctors, slots for the next 14 days and sample patients
// with past consultations and reviews. NEVER for production (refuses NODE_ENV=production).
//
//   npm run seed:dev            add the data (safe to run again: existing seed rows are kept)
//   npm run seed:dev -- --reset delete earlier seed data first
//
// Every seed account uses an @seed.example.test email; the password is printed once at the end.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { devNull } from "node:os";
import { v7 as uuidv7 } from "uuid";

if (process.env.NODE_ENV === "production") {
  console.error("seed:dev refuses to run with NODE_ENV=production");
  process.exit(1);
}

const SEED_DOMAIN = "seed.example.test";
const PASSWORD = "Seed#Password1";
const DAYS = 14;
// clinic hours (local time) and slot length
const TIME_ZONE = process.env.CLINIC_TIME_ZONE || "Asia/Dhaka";
const DAY_START = "09:00";
const DAY_END = "17:00";
const SLOT_MINUTES = 30;

const SPECIALTIES = [
  ["Cardiology", "Heart and blood vessels"],
  ["Dermatology", "Skin, hair and nails"],
  ["Paediatrics", "Children and adolescents"],
  ["Neurology", "Brain, spine and nerves"],
  ["General Medicine", "Everyday health problems and check-ups"],
  ["Gynaecology", "Women's reproductive health"],
  ["Orthopaedics", "Bones, joints and muscles"],
  ["Psychiatry", "Mental health"],
  ["ENT", "Ear, nose and throat"],
  ["Endocrinology", "Diabetes, thyroid and hormones"],
] as const;

const FIRST = ["Nusrat", "Tanvir", "Farhana", "Rakib", "Sadia", "Imran", "Mehnaz", "Arif", "Shirin", "Kamal", "Lamia", "Fahim", "Rumana", "Sabbir", "Tahmina", "Zahid", "Nabila", "Rezaul", "Sumaiya", "Hasib"];
const LAST = ["Rahman", "Hossain", "Akter", "Islam", "Chowdhury", "Ahmed", "Karim", "Sultana", "Haque", "Uddin"];
const DESIGNATIONS = ["Consultant", "Senior Consultant", "Associate Professor", "Assistant Professor", "Medical Officer"];
const HOSPITALS = ["Dhaka Medical College Hospital", "Square Hospital", "Evercare Hospital", "BIRDEM General Hospital", "Chittagong Medical College Hospital"];
const COMMENTS = ["Listened carefully and explained everything.", "Clear advice, the prescription arrived right away.", "Very helpful consultation.", "Good, but the call started a few minutes late.", null];

// deterministic "random" so every run produces the same data
let state = 42;
const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

const main = async () => {
  // sign-up sends verification emails: drop them (the seed accounts are verified directly)
  process.env.EMAIL_OUTBOX_FILE = devNull;
  const { prisma } = await import("../src/app/lib/prisma");
  const { auth } = await import("../src/app/lib/auth");
  const { zonedTimeToUtc } = await import("../src/app/module/schedule/schedule.utils");

  if (process.argv.includes("--reset")) {
    const users = await prisma.user.findMany({ where: { email: { endsWith: `@${SEED_DOMAIN}` } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    const doctors = await prisma.doctor.findMany({ where: { userId: { in: userIds }, isDeleted: undefined }, select: { id: true } });
    const patients = await prisma.patient.findMany({ where: { userId: { in: userIds }, isDeleted: undefined }, select: { id: true } });
    const appointmentWhere = { OR: [{ doctorId: { in: doctors.map((d) => d.id) } }, { patientId: { in: patients.map((p) => p.id) } }] };
    await prisma.$transaction([
      prisma.review.deleteMany({ where: appointmentWhere }),
      prisma.prescription.deleteMany({ where: appointmentWhere }),
      prisma.payment.deleteMany({ where: { appointment: appointmentWhere } }),
      prisma.appointment.deleteMany({ where: appointmentWhere }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    // time slots and specialties are kept: they may be shared with real data (an unused slot is harmless)
    console.log(`removed ${userIds.length} seed accounts`);
  }

  // ---------------------------------------------------------------- specialties
  const specialties = [];
  for (const [title, description] of SPECIALTIES) {
    specialties.push(
      await prisma.specialty.upsert({ where: { title }, update: {}, create: { title, description } }),
    );
  }

  // ---------------------------------------------------------------- slots (next 14 days, clinic time)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
  const slots: { startDateTime: Date; endDateTime: Date }[] = [];
  for (let day = 0; day < DAYS; day++) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    const ymd = date.toISOString().slice(0, 10);
    let start = zonedTimeToUtc(ymd, DAY_START, TIME_ZONE);
    const end = zonedTimeToUtc(ymd, DAY_END, TIME_ZONE);
    while (start < end) {
      const slotEnd = new Date(start.getTime() + SLOT_MINUTES * 60_000);
      if (start.getTime() > Date.now()) slots.push({ startDateTime: start, endDateTime: slotEnd });
      start = slotEnd;
    }
  }
  // one insert + one read instead of a round trip per slot (fast against a remote database)
  await prisma.schedule.createMany({ data: slots, skipDuplicates: true });
  const schedules = await prisma.schedule.findMany({
    where: { OR: slots.map((s) => ({ startDateTime: s.startDateTime, endDateTime: s.endDateTime })) },
    select: { id: true, startDateTime: true },
    orderBy: { startDateTime: "asc" },
  });

  const createAccount = async (role: "DOCTOR" | "PATIENT", name: string, email: string) => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { userId: existing.id, created: false };
    const { user } = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
    await prisma.user.update({ where: { id: user.id }, data: { role, emailVerified: true, termsAcceptedAt: new Date(), termsVersion: "seed" } });
    return { userId: user.id, created: true };
  };

  // ---------------------------------------------------------------- doctors
  const doctors = [];
  for (let i = 0; i < 20; i++) {
    const name = `${FIRST[i]} ${pick(LAST)}`;
    const email = `doctor${String(i + 1).padStart(2, "0")}@${SEED_DOMAIN}`;
    const { userId, created } = await createAccount("DOCTOR", name, email);
    const doctor = created
      ? await prisma.doctor.create({
          data: {
            userId,
            name,
            email,
            registrationNumber: `SEED-${String(i + 1).padStart(4, "0")}`,
            experience: 2 + Math.floor(rand() * 25),
            gender: i % 2 ? "MALE" : "FEMALE",
            appointmentFee: 500 + Math.floor(rand() * 16) * 100,
            qualification: pick(["MBBS", "MBBS, FCPS", "MBBS, MD", "MBBS, MRCP"]),
            currentWorkingPlace: pick(HOSPITALS),
            designation: pick(DESIGNATIONS),
            isAvailable: rand() > 0.15,
            specialties: { create: [{ specialtyId: specialties[i % 10].id }, ...(rand() > 0.6 ? [{ specialtyId: specialties[(i + 3) % 10].id }] : [])] },
          },
        })
      : await prisma.doctor.findUniqueOrThrow({ where: { userId } });
    doctors.push(doctor);

    // each doctor offers about 40 % of the slots
    const offered = schedules.filter(() => rand() < 0.4);
    await prisma.doctorSchedules.createMany({
      data: offered.map((s) => ({ doctorId: doctor.id, scheduleId: s.id })),
      skipDuplicates: true,
    });
  }

  // ---------------------------------------------------------------- patients with past consultations
  const pastSchedule = async (daysAgo: number, hour: number) => {
    const start = new Date(Date.now() - daysAgo * 24 * 60 * 60_000);
    start.setUTCHours(hour, 0, 0, 0);
    return prisma.schedule.upsert({
      where: { startDateTime_endDateTime: { startDateTime: start, endDateTime: new Date(start.getTime() + SLOT_MINUTES * 60_000) } },
      update: {},
      create: { startDateTime: start, endDateTime: new Date(start.getTime() + SLOT_MINUTES * 60_000) },
    });
  };

  let consultations = 0;
  for (let i = 0; i < 10; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const email = `patient${String(i + 1).padStart(2, "0")}@${SEED_DOMAIN}`;
    const { userId, created } = await createAccount("PATIENT", name, email);
    if (!created) continue;
    const patient = await prisma.patient.create({ data: { userId, name, email } });

    // two finished, paid consultations each, most of them reviewed
    for (let k = 0; k < 2; k++) {
      const doctor = doctors[(i * 2 + k) % doctors.length];
      const schedule = await pastSchedule(3 + i + k * 5, 4 + k);
      const exists = await prisma.appointment.findFirst({ where: { doctorId: doctor.id, scheduleId: schedule.id } });
      if (exists) continue;
      await prisma.doctorSchedules.upsert({
        where: { doctorId_scheduleId: { doctorId: doctor.id, scheduleId: schedule.id } },
        update: { isBooked: true },
        create: { doctorId: doctor.id, scheduleId: schedule.id, isBooked: true },
      });
      const appointment = await prisma.appointment.create({
        data: {
          videoCallingId: uuidv7(),
          patientId: patient.id,
          doctorId: doctor.id,
          scheduleId: schedule.id,
          status: "COMPLETED",
          paymentStatus: "PAID",
          startedAt: schedule.startDateTime,
          completedAt: schedule.endDateTime,
        },
      });
      await prisma.payment.create({
        data: { transactionId: uuidv7(), amount: doctor.appointmentFee, appointmentId: appointment.id, status: "PAID", paidAt: schedule.startDateTime, stripePaymentIntentId: `pi_seed_${randomUUID().slice(0, 12)}` },
      });
      if (rand() < 0.8) {
        await prisma.review.create({
          data: { appointmentId: appointment.id, patientId: patient.id, doctorId: doctor.id, rating: 3 + Math.floor(rand() * 3), comment: pick(COMMENTS) },
        });
      }
      consultations++;
    }
  }

  // ratings shown on the site = the stored average of visible reviews
  for (const doctor of doctors) {
    const stats = await prisma.review.aggregate({ where: { doctorId: doctor.id, isHidden: false }, _avg: { rating: true }, _count: true });
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: { averageRating: Number((stats._avg.rating ?? 0).toFixed(2)), reviewCount: stats._count },
    });
  }

  console.log(`seeded: ${specialties.length} specialties, ${doctors.length} doctors, ${schedules.length} future slots, ${consultations} past consultations`);
  console.log(`log in as doctor01..20@${SEED_DOMAIN} or patient01..10@${SEED_DOMAIN}, password ${PASSWORD}`);
  await prisma.$disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
