import { AppointmentStatus, PaymentStatus } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { sendEmail } from "../../utils/email";
import { DEFAULT_CLINIC_TIME_ZONE, minutes } from "./appointment.constant";

const formatInZone = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_CLINIC_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

type TReminderKind = "24h" | "1h";

// Sends "starts in 24 hours" and "starts in 1 hour" emails to patient and doctor.
// Each appointment is CLAIMED first (conditional update of reminder*SentAt), so a reminder
// is sent at most once even if the job runs on several servers at the same time.
const sendReminders = async (kind: TReminderKind) => {
  const now = Date.now();
  const windowEnd = new Date(now + (kind === "24h" ? minutes(24 * 60) : minutes(60)));
  // "24h" covers appointments 1h..24h ahead; anything closer gets only the 1h reminder
  const windowStart = new Date(kind === "24h" ? now + minutes(60) : now);
  const sentField = kind === "24h" ? "reminder24hSentAt" : "reminder1hSentAt";

  const due = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.SCHEDULED,
      [sentField]: null,
      schedule: { startDateTime: { gt: windowStart, lte: windowEnd } },
    },
    include: {
      schedule: true,
      patient: { select: { name: true, email: true } },
      doctor: { select: { name: true, email: true } },
    },
    take: 100,
  });

  let sent = 0;
  for (const appointment of due) {
    const claimed = await prisma.appointment.updateMany({
      where: { id: appointment.id, [sentField]: null },
      // the 1h reminder makes a pending 24h reminder pointless
      data:
        kind === "1h"
          ? { reminder1hSentAt: new Date(), reminder24hSentAt: appointment.reminder24hSentAt ?? new Date() }
          : { reminder24hSentAt: new Date() },
    });
    if (claimed.count !== 1) continue;

    const common = {
      when: kind === "24h" ? "in about 24 hours" : "in about 1 hour",
      startTime: formatInZone(appointment.schedule.startDateTime),
      timeZone: DEFAULT_CLINIC_TIME_ZONE,
      isPaid: appointment.paymentStatus === PaymentStatus.PAID,
      paymentDeadline: appointment.paymentDeadline ? formatInZone(appointment.paymentDeadline) : "",
    };
    const emails = [
      sendEmail({
        to: appointment.patient.email,
        subject: `Reminder: your appointment with Dr. ${appointment.doctor.name}`,
        templateName: "reminder",
        templateData: { ...common, role: "PATIENT", name: appointment.patient.name, otherName: appointment.doctor.name },
      }),
      sendEmail({
        to: appointment.doctor.email,
        subject: `Reminder: appointment with ${appointment.patient.name}`,
        templateName: "reminder",
        templateData: { ...common, role: "DOCTOR", name: appointment.doctor.name, otherName: appointment.patient.name },
      }),
    ];
    const results = await Promise.allSettled(emails);
    results.forEach((result) => {
      if (result.status === "rejected") console.error("Reminder email failed:", result.reason?.message);
    });
    sent++;
  }
  return sent;
};

export const AppointmentReminder = {
  sendReminders,
};
