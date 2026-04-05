import z from "zod";
import { Gender } from "../../../generated/prisma/enums";

export const createUpdateDoctorValidationZodSchema = z.object({
    name: z.string().optional(),
    profilePhoto: z.string().optional(),
    contactNumber: z.string().optional(),
    registrationNumber: z.string().optional(),
    experience: z.int().optional(),
    gender: z.enum([Gender.FEMALE, Gender.MALE]).optional(),
    appointmentFee: z.number().nonnegative().optional(),
    qualification: z.string().optional(),
    currentWorkPlace: z.string().optional(),
    designation: z.string().optional(),
    specialties: z.array(z.uuid("Each id must be a valid uuid")).optional()
})
export const DoctorValidation = {
    createUpdateDoctorValidationZodSchema
}