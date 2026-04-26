import { StatusCodes } from "http-status-codes";
import { v7 as uuidv7 } from "uuid";
import { envVars } from "../../config/env";
import { stripe } from "../../config/stripe.config";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { ICreateBookAppointmentPayload } from "./appointment.interface";
import {
  AppointmentStatus,
  PaymentStatus,
  Role,
} from "../../../generated/prisma/enums";
//book now
const bookAppointment = async (
  user: IRequestUser,
  payload: ICreateBookAppointmentPayload,
) => {
  console.log("payload Received: ", payload);
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
  });
  console.log("patientData: ", { patientData });
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: { id: payload.doctorId, isDeleted: false },
  });
  console.log("doctorData: ", doctorData);
  const scheduleData = await prisma.schedule.findUniqueOrThrow({
    where: { id: payload.scheduleId },
  });
  const doctorScheduleData = await prisma.doctorSchedules.findUniqueOrThrow({
    where: {
      doctorId_scheduleId: {
        doctorId: doctorData.id,
        scheduleId: scheduleData.id,
      },
    },
  });
  if (doctorScheduleData.isBooked) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Schedule is already booked");
  }

  const videoCallingId = String(uuidv7());
  const result = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        videoCallingId,
        scheduleId: doctorScheduleData.scheduleId,
        patientId: patientData.id,
        doctorId: doctorData.id,
      },
    });
    //update doctor schedule status
    await tx.doctorSchedules.update({
      where: {
        doctorId_scheduleId: {
          doctorId: payload.doctorId,
          scheduleId: payload.scheduleId,
        },
      },
      data: {
        isBooked: true,
      },
    });
    //payment to do here
    const transactionId = String(uuidv7());
    const payment = await tx.payment.create({
      data: {
        transactionId,
        amount: doctorData.appointmentFee,
        appointmentId: appointment.id,
      },
    });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: `Appointment with ${doctorData.name}`,
            },
            unit_amount: doctorData.appointmentFee * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        appointmentId: appointment.id,
        paymentId: payment.id,
      },
      mode: "payment",
      success_url: `${envVars.FRONTEND_URL}/dashboard/payment/success`,
      cancel_url: `${envVars.FRONTEND_URL}/dashboard/appointments`,
    });
    return {
      appointment,
      payment,
      paymentUrl: session.url,
    };
  });
  return {
    appointment: result.appointment,
    payment: result.payment,
    paymentUrl: result.paymentUrl,
  };
};
const getMyAppointments = async (user: IRequestUser) => {
  //user can be patient or doctor, so we need to check both
  const patientData = await prisma.patient.findUnique({
    where: {
      email: user?.email,
    },
  });

  const doctorData = await prisma.doctor.findUnique({
    where: {
      email: user?.email,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appointments: any[];

  if (patientData) {
    appointments = await prisma.appointment.findMany({
      where: {
        patientId: patientData.id,
      },
      include: {
        doctor: true,
        schedule: true,
      },
    });
  } else if (doctorData) {
    appointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctorData.id,
      },
      include: {
        patient: true,
        schedule: true,
      },
    });
  } else {
    throw new Error("User not found");
  }

  return appointments;
};
const getMySingleAppointment = async (
  user: IRequestUser,
  appointmentId: string,
) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
  });
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: { email: user.email },
  });
  let appointment;
  if (patientData) {
    appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId, patientId: patientData.id },
      include: { doctor: true, schedule: true },
    });
  } else if (doctorData) {
    appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId, doctorId: doctorData.id },
      include: { patient: true, schedule: true },
    });
  }
  if (!appointment)
    throw new AppError(StatusCodes.BAD_REQUEST, "Appointment not found");
  return appointment;
};
const changeAppointmentStatus = async (
  appointmentId: string,
  status: AppointmentStatus,
  user: IRequestUser,
) => {
  const appointmentData = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { doctor: true, patient: true },
  });
  if (status === appointmentData.status) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Status already changed");
  }
  if (user?.role === Role.DOCTOR) {
    if (
      user?.email === appointmentData?.doctor?.email &&
      status !== AppointmentStatus.COMPLETED &&
      status !== AppointmentStatus.CANCELED
    ) {
      return await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status,
        },
      });
    } else {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "You are not authorized to change this appointment",
      );
    }
  } else if (user?.role === Role.PATIENT) {
    if (
      user?.email === appointmentData?.patient?.email &&
      status !== AppointmentStatus.COMPLETED &&
      status !== AppointmentStatus.CANCELED &&
      appointmentData.status === AppointmentStatus.SCHEDULED
    ) {
      return await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status,
        },
      });
    } else {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "You are not authorized to change this appointment",
      );
    }
  }
};
const bookAppointmentWithPayLater = async (
  payload: ICreateBookAppointmentPayload,
  user: IRequestUser,
) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
  });
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: { id: payload.doctorId },
  });
  const schedules = await prisma.schedule.findUniqueOrThrow({
    where: { id: payload.scheduleId },
  });
  const doctorSchedules = await prisma.doctorSchedules.findUniqueOrThrow({
    where: {
      doctorId_scheduleId: {
        doctorId: doctorData.id,
        scheduleId: schedules.id,
      },
    },
  });
  const videoCallingId = String(uuidv7());

  const result = await prisma.$transaction(async (tx) => {
    const appointmentData = await tx.appointment.create({
      data: {
        patientId: patientData.id,
        doctorId: doctorData.id,
        scheduleId: doctorSchedules.scheduleId,
        videoCallingId,
      },
    });
    await tx.doctorSchedules.update({
      where: {
        doctorId_scheduleId: {
          doctorId: payload.doctorId,
          scheduleId: payload.scheduleId,
        },
      },
      data: {
        isBooked: true,
      },
    });

    const transactionId = String(uuidv7());
    const paymentData = await tx.payment.create({
      data: {
        appointmentId: appointmentData.id,
        amount: doctorData.appointmentFee,
        transactionId,
      },
    });
    return { appointmentData, paymentData };
  });
  return {
    appointmentData: result.appointmentData,
    paymentData: result.paymentData,
  };
};
const initiatePayment = async (appointmentId: string, user: IRequestUser) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
  });

  const appointmentData = await prisma.appointment.findUniqueOrThrow({
    where: {
      id: appointmentId,
      patientId: patientData.id,
    },
    include: {
      doctor: true,
      payment: true,
    },
  });
  if (!appointmentData) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Appointment not found");
  }
  if (!appointmentData.payment) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Payment data not found");
  }
  if (appointmentData.status === AppointmentStatus.CANCELED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Appointment is already canceled",
    );
  }
  if (appointmentData.payment.status === PaymentStatus.PAID) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Payment is already done");
  }
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "bdt",
          product_data: {
            name: "Appointment Fee",
            description: "Appointment Fee",
          },
          unit_amount: appointmentData.doctor.appointmentFee * 100,
        },
        quantity: 1,
      },
    ],
    metadata: {
      appointmentId: appointmentData.id,
      paymentId: appointmentData.payment.id,
    },

    success_url: `${envVars.FRONTEND_URL}/dashboard/payment/payment-success?appointment_id=${appointmentData.id}&payment_id=${appointmentData.payment.id}`,

    // cancel_url: `${envVars.FRONTEND_URL}/dashboard/payment/payment-failed`,
    cancel_url: `${envVars.FRONTEND_URL}/dashboard/appointments?error=payment_cancelled`,
  });
  return {
    paymentUrl: session.url,
  };
};
const cancelUnpaidAppointment = async () => {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  //find unpaid appointments created in last 30 minutes
  const unpaidAppointments = await prisma.appointment.findMany({
    where: {
      createdAt: {
        lte: thirtyMinutesAgo,
      },
      paymentStatus: PaymentStatus.UNPAID,
    },
  });
  const appointmentsIds = unpaidAppointments.map(
    (appointment) => appointment.id,
  );
  const result = await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: {
        id: {
          in: appointmentsIds,
        },
      },
      data: {
        status: AppointmentStatus.CANCELED,
      },
    });
    await tx.payment.deleteMany({
      where: {
        appointmentId: {
          in: appointmentsIds,
        },
      },
    });
    //every unpaid appointment will be canceled now i have to update doctor schedules status
    for (const unpaidAppointment of unpaidAppointments) {
      await prisma.doctorSchedules.update({
        where: {
          doctorId_scheduleId: {
            doctorId: unpaidAppointment.doctorId,
            scheduleId: unpaidAppointment.scheduleId,
          },
        },
        data: {
          isBooked: false,
        },
      });
    }
  });
  return result;
};

export const AppointmentService = {
  bookAppointment,
  getMyAppointments,
  getMySingleAppointment,
  changeAppointmentStatus,
  bookAppointmentWithPayLater,
  initiatePayment,
  cancelUnpaidAppointment,
};
