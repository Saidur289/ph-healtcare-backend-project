import z from "zod";
import { Gender, Role } from "../../../generated/prisma/enums";
import { passwordSchema } from "../auth/auth.validation";

const createDoctorZodSchema = z.object({
  // temporary password; the doctor must change it after the first login
  password: passwordSchema,
  doctor: z.object({
    name: z
      .string("Name is required")
      .min(5, "Name must be at least 5 characters long")
      .max(30, "Name must be less than 30 characters"),
    email: z.email("A valid email is required"),
    address: z
      .string("Address is required")
      .min(10, "Address must be at least 10 characters long")
      .max(100, "Address must be less than 100 characters")
      .optional(),
    experience: z
      .number("Experience is must be a number")
      .nonnegative("Experience must be a positive number")
      .optional(),
    contactNumber: z
      .string("Contact number is required")
      .min(11, "Contact number must be at least 11 characters long")
      .max(14, "Contact number must be less than 14 characters"),
    registrationNumber: z.string("Registration number is required"),
    appointmentFee: z
      .number("Appointment fee must be a number")
      .nonnegative("Appointment fee must be a positive number"),
    gender: z.enum([Gender.FEMALE, Gender.MALE], "Gender must be either"),
    qualification: z
      .string("Qualification is required")
      .min(5, "Qualification must be at least 5 characters long")
      .max(50, "Qualification must be less than 50 characters"),
    designation: z
      .string("Designation is required")
      .min(5, "Designation must be at least 5 characters long")
      .max(50, "Designation must be less than 50 characters"),
    currentWorkingPlace: z
      .string()
      .min(5, "Current working place must be at least 5 characters long")
      .max(50, "Current working place must be less than 50 characters")
      .optional(),
  }),
  specialties: z.array(z.uuid(), "Specialties must be an array of UUIDs"),
});
const createAdminValidationSchema = z.object({
  password: passwordSchema,
  admin: z.object({
    name: z
      .string("Name is required")
      .min(5, "Name must be at least 5 characters long")
      .max(30, "Name must be less than 30 characters"),
    email: z.email("Email is required"),
    contactNumber: z
      .string("Contact number is required")
      .min(11, "Contact number must be at least 11 characters long")
      .max(14, "Contact number must be less than 14 characters")
      .optional(),
    profilePhoto: z.url("Profile photo is required").optional(),
  }),
  // SUPER_ADMIN can never be created through the API (only by the seed)
  role: z.literal(Role.ADMIN, "Only ADMIN role can be created").optional(),
});

export const UserValidation = {
  createDoctorZodSchema,
  createAdminValidationSchema,
};
