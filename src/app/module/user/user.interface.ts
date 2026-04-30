import { Gender } from "../../../generated/prisma/enums";

export interface ICreateDoctorPayload {
  password: string;
  doctor: {
    name: string;
    email: string;
    experience: number;
    address?: string;
    profilePhoto?: string;
    designation: string;
    qualification: string;
    contactNumber?: string;
    currentWorkingPlace: string;
    registrationNumber: string;
    appointmentFee: number;
    gender: Gender;
  };
  specialties: string[];
}
export interface ICreateAdmin {
  password: string;
  admin: {
    name: string;
    email: string;
    contactNumber?: string;
    profilePhoto?: string;
  };
  role: "ADMIN" | "SUPER_ADMIN";
}
export interface ICreateSuperAdmin {
  password: string;
  superAdmin: {
    name: string;
    email: string;
    contactNumber?: string;
    profilePhoto?: string;
  };
}
