import { AppointmentStatus } from "../../../generated/prisma/enums";

export interface ICreateBookAppointmentPayload {
    scheduleId: string;
    doctorId: string;
}
export interface IUpdateBookAppointmentPayload {
    scheduleId?: string;
    doctorId?: string;
    status?: AppointmentStatus
}