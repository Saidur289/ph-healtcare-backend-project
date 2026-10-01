import { TMedicine } from "./prescription.validation";

export interface ICreatePrescriptionPayload {
  appointmentId: string;
  followUpDate: string;
  instructions: string;
  medicines: TMedicine[];
}

export interface IUpdatePrescriptionPayload {
  followUpDate?: string;
  instructions?: string;
  medicines?: TMedicine[];
}
