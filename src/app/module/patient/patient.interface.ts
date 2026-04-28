import { BloodGroup, Gender } from "../../../generated/prisma/enums";

export interface IUpdatePatientInfoPayload {
  name?: string;
  contactNumber?: string;
  profilePhoto?: string;
  address?: string;
}
export interface IUpdatePatientHealthDataPayload {
  gender: Gender;
  dateOfBirth: Date;
  bloodGroup: BloodGroup;
  hasAllergies: boolean;
  hasDiabetes: boolean;
  height: string;
  weight: string;
  smokingStatus: boolean;
  dietaryPreferences?: string;
  mentalHealthHistory?: string;
  immunizationStatus?: string;
  hasPastSurgeries: boolean;
  pregnancyStatus: boolean;
  maritalStatus?: string;
  recentAnxiety: boolean;
  recentDepression: boolean;
}
export interface IUpdatePatientMedicalReportPayload {
  reportName?: string;
  reportLink?: string;
  shouldDelete?: boolean;
  reportId?: string;
}
export interface IUpdatePatientProfilePayload {
  patientInfo?: IUpdatePatientInfoPayload;
  patientHealthData?: IUpdatePatientHealthDataPayload;
  patientMedicalReport?: IUpdatePatientMedicalReportPayload[];
}
