import { Gender } from "../../../generated/prisma/enums";

export interface IUpdateDoctor {
    name?: string;
    profilePhoto?: string;
    designation?: string;
    currentWorkingPlace?: string;
    registrationNumber?: string;
    appointmentFee?: number;
    experience?: number;
    address?: string;
    contactNumber?: string;
    qualification?: string;
    gender?: Gender;
    specialties?: string[];
}