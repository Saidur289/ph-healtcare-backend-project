import { StatusCodes } from "http-status-codes";
import { AppointmentStatus, PaymentStatus, Role } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";

const getDashboardStatsData = async (user: IRequestUser) => {
  let statsData;
  switch (user.role) {
    case Role.SUPER_ADMIN:
      statsData = getSuperAdminStatsData();
      break;
    case Role.ADMIN:
      statsData = getAdminStatsData();
      break;
    case Role.DOCTOR:
      statsData = getDoctorData(user);
      break;
    case Role.PATIENT:
      statsData = getPatientData(user);
      break;

    default:
      throw new AppError(StatusCodes.BAD_REQUEST, "Invalid user role");
  }
  return statsData;
};

const getSuperAdminStatsData = async () => {
  const appointmentCount = await prisma.appointment.count();
  const doctorCount = await prisma.doctor.count();
  const patientCount = await prisma.patient.count();
  const adminCount = await prisma.admin.count();
  const superAdminCount = await prisma.admin.count({
    where: {
      user: {
        role: Role.SUPER_ADMIN,
      },
    },
  });
  const paymentCount = await prisma.payment.count();
  const userCount = await prisma.user.count();
  const totalRevenue = await prisma.payment.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      status: PaymentStatus.PAID,
    },
  });
  const pieChartData = await getPieChartData();
  const barChartData = await getBarChartData();
  return {
    appointmentCount,
    doctorCount,
    patientCount,
    adminCount,
    superAdminCount,
    paymentCount,
    userCount,
    totalRevenue: totalRevenue._sum.amount || 0,
    pieChartData,
    barChartData,
  };
};
const getAdminStatsData = async () => {
  const appointmentCount = await prisma.appointment.count();
  const doctorCount = await prisma.doctor.count();
  const patientCount = await prisma.patient.count();
  const paymentCount = await prisma.payment.count();
  const adminCount = await prisma.admin.count();
  const totalRevenue = await prisma.payment.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      status: PaymentStatus.PAID,
    },
  });
  const pieChartData = await getPieChartData();
  // same key as the super admin stats ("barChartData"); the client reads this name
  const barChartData = await getBarChartData();
  return {
    appointmentCount,
    doctorCount,
    patientCount,
    paymentCount,
    totalRevenue: totalRevenue._sum.amount || 0,
    adminCount,
    pieChartData,
    barChartData,
  };
};
// "today" is counted in the clinic time zone (taka fees => Bangladesh by default), not UTC
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Dhaka";
const DAY_MS = 24 * 60 * 60 * 1000;

// start of the local day, `daysAgo` days back, as a UTC instant
const startOfLocalDay = (daysAgo = 0) => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const localMidnight = Date.UTC(get("year"), get("month") - 1, get("day"));
  return new Date(localMidnight - offset - daysAgo * DAY_MS);
};

const getDoctorData = async (user: IRequestUser) => {
  // findUniqueOrThrow: with a missing profile, "doctorId: undefined" would match
  // every row and return the whole platform's numbers
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: {
      email: user.email,
    },
    select: { id: true, averageRating: true, reviewCount: true, isAvailable: true },
  });
  const doctorId = doctorData.id;
  const today = startOfLocalDay(0);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const yesterday = startOfLocalDay(1);
  const activeStatuses = { notIn: [AppointmentStatus.CANCELED] };
  const appointmentsBetween = (from: Date, to: Date) =>
    prisma.appointment.count({
      where: { doctorId, status: activeStatuses, schedule: { startDateTime: { gte: from, lt: to } } },
    });
  const revenueBetween = (from: Date, to: Date) =>
    prisma.payment
      .aggregate({
        _sum: { amount: true },
        where: { appointment: { doctorId }, status: PaymentStatus.PAID, paidAt: { gte: from, lt: to } },
      })
      .then((r) => r._sum.amount || 0);

  // independent queries run in parallel (each Neon round trip is ~300 ms)
  const [
    appointmentCount,
    totalRevenue,
    appointmentStatusDistribution,
    patientCount,
    todayAppointmentCount,
    yesterdayAppointmentCount,
    todayRevenue,
    yesterdayRevenue,
    newPatientsToday,
  ] = await Promise.all([
    prisma.appointment.count({ where: { doctorId } }),
    prisma.payment
      .aggregate({ _sum: { amount: true }, where: { appointment: { doctorId }, status: PaymentStatus.PAID } })
      .then((r) => r._sum.amount || 0),
    prisma.appointment.groupBy({ by: ["status"], _count: { id: true }, where: { doctorId } }),
    prisma.appointment.groupBy({ by: ["patientId"], where: { doctorId } }).then((r) => r.length),
    appointmentsBetween(today, tomorrow),
    appointmentsBetween(yesterday, today),
    revenueBetween(today, tomorrow),
    revenueBetween(yesterday, today),
    // patients whose first appointment with this doctor was booked today
    prisma.appointment
      .groupBy({ by: ["patientId"], where: { doctorId }, _min: { createdAt: true } })
      .then((rows) => rows.filter((r) => r._min.createdAt && r._min.createdAt >= today).length),
  ]);

  return {
    reviewCount: doctorData.reviewCount,
    averageRating: doctorData.averageRating,
    isAvailable: doctorData.isAvailable,
    patientCount,
    newPatientsToday,
    appointmentCount,
    todayAppointmentCount,
    yesterdayAppointmentCount,
    totalRevenue,
    todayRevenue,
    yesterdayRevenue,
    appointmentStatusDistribution: appointmentStatusDistribution.map((item) => ({
      status: item.status,
      count: item._count.id,
    })),
  };
};
const getPatientData = async (user: IRequestUser) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: {
      email: user.email,
    },
    select: { id: true },
  });
  const patientId = patientData.id;

  const [appointmentCount, reviewCount, prescriptionCount, upcomingCount, totalPaid, appointmentStatusDistribution] =
    await Promise.all([
      prisma.appointment.count({ where: { patientId } }),
      prisma.review.count({ where: { patientId } }),
      prisma.prescription.count({ where: { patientId } }),
      prisma.appointment.count({
        where: {
          patientId,
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.INPROGRESS] },
          schedule: { endDateTime: { gte: new Date() } },
        },
      }),
      prisma.payment
        .aggregate({ _sum: { amount: true }, where: { appointment: { patientId }, status: PaymentStatus.PAID } })
        .then((r) => r._sum.amount || 0),
      prisma.appointment.groupBy({ by: ["status"], _count: { id: true }, where: { patientId } }),
    ]);

  return {
    appointmentCount,
    reviewCount,
    prescriptionCount,
    upcomingCount,
    totalPaid,
    appointmentStatusDistribution: appointmentStatusDistribution.map((item) => ({
      status: item.status,
      count: item._count.id,
    })),
  };
};
const getPieChartData = async () => {
  const appointmentStatusDistribution = await prisma.appointment.groupBy({
    by: ["status"],
    _count: {
      id: true,
    },
  });

  const formattedDistribution = appointmentStatusDistribution.map((item) => ({
    status: item.status,
    count: item._count.id,
  }));

  return formattedDistribution;
};
const getBarChartData = async () => {
  interface AppointmentCountByMonth {
    month: Date;
    count: bigint;
  }
  const appointmentCountByMonth: AppointmentCountByMonth[] =
    await prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "createdAt") AS month, CAST(COUNT(*) AS INTEGER) AS count
        FROM "appointments"
        GROUP BY month
        ORDER BY month ASC`;
  return appointmentCountByMonth;
};
export const StatsService = {
  getDashboardStatsData,
};
