// All booking / lifecycle timing rules in one place (minutes unless noted).

// pay now: the patient has this long to finish Stripe Checkout (Stripe's minimum session life is 30 min)
export const PAY_NOW_WINDOW_MIN = 31;
// pay later: payment is due this long before the appointment starts
export const PAY_LATER_DUE_BEFORE_START_MIN = 120;
// pay later is only offered when the appointment starts at least this far in the future
export const PAY_LATER_MIN_LEAD_MIN = 180;
// a patient can hold at most this many unpaid upcoming appointments
export const MAX_ACTIVE_UNPAID_PER_PATIENT = 3;
// a patient can cancel or reschedule until this long before the start
export const PATIENT_CHANGE_UNTIL_BEFORE_START_MIN = 120;
// a doctor can start a consultation this long before the slot begins
export const START_ALLOWED_BEFORE_MIN = 10;
// a doctor can mark NO_SHOW this long after the slot began
export const NO_SHOW_AFTER_START_MIN = 15;
// length of one schedule slot
export const SLOT_MINUTES = 30;
// how far ahead admins may create schedules in one request
export const MAX_SCHEDULE_RANGE_DAYS = 60;
// default time zone for schedule times typed by an admin (all times are STORED in UTC)
export const DEFAULT_CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE || "Asia/Dhaka";

// statuses that hold a slot
export const ACTIVE_APPOINTMENT_STATUSES = ["SCHEDULED", "INPROGRESS"] as const;
// a doctor may read a patient's medical history through these of their own appointments
export const MEDICAL_HISTORY_STATUSES = ["SCHEDULED", "INPROGRESS", "COMPLETED"] as const;

export const minutes = (value: number) => value * 60 * 1000;
