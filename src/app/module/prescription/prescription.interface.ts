export interface ICreatePrescriptionPayload {
  appointmentId: string;
  followUpDate: string;
  instructions: string;
}

export interface IUpdatePrescriptionPayload {
  followUpDate?: string;
  instructions?: string;
}
