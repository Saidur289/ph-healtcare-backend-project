import z from "zod";
import { Gender } from "../../../generated/prisma/enums";
export const doctorAvailabilityZodSchema = z.strictObject({
  isAvailable: z.boolean("isAvailable must be true or false"),
});
export const updateDoctorZodSchema = z.strictObject({
  doctor: z
    .strictObject({
      name: z
        .string("Name must be string")
        .min(5, "Name must be at least 5 characters")
        .max(30, "Name must be at most 30 characters")
        .optional(),
      profilePhoto: z.url("Profile photo must be a valid URL").optional(),
      contactNumber: z
        .string("Contact number must be string")
        .min(11, "Contact number must be at least 11 characters")
        .max(14, "Contact number must be at most 15 characters")
        .optional(),
      address: z
        .string("Address must be string")
        .min(10, "Address must be at least 10 characters")
        .max(100, "Address must be at most 100 characters")
        .optional(),
      registrationNumber: z
        .string("Registration number must be string")
        .optional(),
      experience: z
        .int("Experience must be an integer")
        .nonnegative("Experience cannot be negative")
        .optional(),
      gender: z
        .enum(
          [Gender.MALE, Gender.FEMALE],
          "Gender must be either MALE or FEMALE",
        )
        .optional(),
      // whole taka; Stripe needs at least ~50 BDT for a card payment
      appointmentFee: z
        .int("Appointment fee must be a whole number of taka")
        .min(50, "Appointment fee must be at least 50")
        .max(1_000_000, "Appointment fee is too high")
        .optional(),
      qualification: z
        .string("Qualification must be string")
        .min(2, "Qualification must be at least 2 characters")
        .max(50, "Qualification must be at most 50 characters")
        .optional(),
      currentWorkingPlace: z
        .string("Current working place must be string")
        .min(2, "Current working place must be at least 2 characters")
        .max(50, "Current working place must be at most 50 characters")
        .optional(),
      designation: z
        .string("Designation must be string")
        .min(2, "Designation must be at least 2 characters")
        .max(50, "Designation must be at most 50 characters")
        .optional(),
    })
    .optional(),
  specialties: z
    .array(
      z.strictObject({
        specialtyId: z.uuid("Specialty ID must be a valid UUID"),
        shouldDelete: z.boolean("shouldDelete must be a boolean").optional(),
      }),
    )
    .optional(),
});
