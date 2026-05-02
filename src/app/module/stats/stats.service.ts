import { StatusCodes } from "http-status-codes";
import { PaymentStatus, Role } from "../../../generated/prisma/enums";
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
  const barCharData = await getBarChartData();
  return {
    appointmentCount,
    doctorCount,
    patientCount,
    paymentCount,
    totalRevenue: totalRevenue._sum.amount || 0,
    adminCount,
    pieChartData,
    barCharData,
  };
};
const getDoctorData = async (user: IRequestUser) => {
  const doctorData = await prisma.doctor.findUnique({
    where: {
      email: user.email,
    },
  });
  const reviewCount = await prisma.review.count({
    where: {
      doctorId: doctorData?.id,
    },
  });
  const appointmentCount = await prisma.appointment.count({
    where: {
      doctorId: doctorData?.id,
    },
  });
  const totalRevenue = await prisma.payment.aggregate({
    _sum: {
      amount: true,
    },

    where: {
      appointment: {
        doctorId: doctorData?.id,
      },
      status: PaymentStatus.PAID,
    },
  });
  const appointmentStatusDistribution = await prisma.appointment.groupBy({
    by: ["status"],
    _count: {
      id: true,
    },
    where: {
      doctorId: doctorData?.id,
    },
  });
  const patientCount = await prisma.appointment
    .groupBy({
      by: ["patientId"],
      _count: {
        id: true,
      },
      where: {
        doctorId: doctorData?.id,
      },
    })
    .then((results) => results.length);
  const formattedDistribution = appointmentStatusDistribution.map(
    (_count, status) => ({ status, count: _count._count.id }),
  );

  return {
    reviewCount,
    patientCount,
    appointmentCount,
    totalRevenue: totalRevenue._sum.amount || 0,
    appointmentStatusDistribution: formattedDistribution,
  };
};
const getPatientData = async (user: IRequestUser) => {
  const patientData = await prisma.patient.findUnique({
    where: {
      email: user.email,
    },
  });
  const appointmentCount = await prisma.appointment.count({
    where: {
      patientId: patientData?.id,
    },
  });
  const reviewCount = await prisma.review.count({
    where: {
      patientId: patientData?.id,
    },
  });
  const appointmentStatusDistribution = await prisma.appointment.groupBy({
    by: ["status"],
    _count: {
      id: true,
    },
    where: {
      patientId: patientData?.id,
    },
  });
  const formattedDistribution = appointmentStatusDistribution.map(
    (_count, status) => ({ status, count: _count._count.id }),
  );
  return {
    appointmentCount,
    reviewCount,
    appointmentStatusDistribution: formattedDistribution,
  };
};
const getPieChartData = async () => {
  const appointmentStatusDistribution = await prisma.appointment.groupBy({
    by: ["status"],
    _count: {
      id: true,
    },
  });
  const formattedDistribution = appointmentStatusDistribution.map(
    (_count, status) => ({ status, count: _count._count.id }),
  );
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
