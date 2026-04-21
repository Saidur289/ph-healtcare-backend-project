import z from "zod";
import { Gender, Role } from "../../../generated/prisma/enums";

const createDoctorZodSchema = z.object({
    password: z.string().min(6, "Password must be at least 6 characters long").max(20, "Password must be at most 20 characters long"),
    doctor: z.object({
        name: z.string("Name is required").min(5, "Name must be at least 5 characters long").max(30, "Name must be less than 30 characters"),
        email: z.string("Email is required"),
        address: z.string("Address is required").min(10, "Address must be at least 10 characters long").max(100, "Address must be less than 100 characters").optional(),
        experience: z.number("Experience is must be a number").nonnegative("Experience must be a positive number").optional(),
        contactNumber: z.string("Contact number is required").min(11, "Contact number must be at least 11 characters long").max(14, "Contact number must be less than 14 characters"),
        registrationNumber: z.string("Registration number is required"),
        appointmentFee: z.number("Appointment fee must be a number").nonnegative("Appointment fee must be a positive number"),
        gender: z.enum([Gender.FEMALE, Gender.MALE], "Gender must be either"),
        qualification: z.string("Qualification is required").min(5, "Qualification must be at least 5 characters long").max(50, "Qualification must be less than 50 characters"),
        designation: z.string("Designation is required").min(5, "Designation must be at least 5 characters long").max(50, "Designation must be less than 50 characters"),
        currentWorkingPlace: z.string().min(5, "Current working place must be at least 5 characters long").max(50, "Current working place must be less than 50 characters").optional(),
    }),
    specialties: z.array(z.uuid(), "Specialties must be an array of UUIDs")
})
const createAdminValidationSchema = z.object({
    password: z.string().min(6, "Password must be at least 6 characters long").max(20, "Password must be at most 20 characters long"),
    admin: z.object({
        name: z.string("Name is required").min(5, "Name must be at least 5 characters long").max(30, "Name must be less than 30 characters"),
        email: z.email("Email is required"),
        contactNumber: z.string("Contact number is required").min(11, "Contact number must be at least 11 characters long").max(14, "Contact number must be less than 14 characters").optional(),
        profilePhoto: z.url("Profile photo is required").optional(),
    }),
    role: z.enum([Role.ADMIN, Role.SUPER_ADMIN], "ADMIN AND SUPER IS ONLY REQUIRED")

})
const createSuperAdminValidationSchema = z.object({
    password: z.string().min(6, "Password must be at least 6 characters long").max(20, "Password must be at most 20 characters long"),
    superAdmin: z.object({
        name: z.string("Name is required").min(5, "Name must be at least 5 characters long").max(30, "Name must be less than 30 characters"),
        email: z.email("Email is required"),
        contactNumber: z.string("Contact number is required").min(11, "Contact number must be at least 11 characters long").max(14, "Contact number must be less than 14 characters").optional(),
        profilePhoto: z.string("Profile photo is required").optional(),
    })
})

export const UserValidation = {
    createDoctorZodSchema,
    createAdminValidationSchema,
    createSuperAdminValidationSchema
}