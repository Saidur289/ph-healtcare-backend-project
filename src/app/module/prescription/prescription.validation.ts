import z from "zod";

const createPrescriptionZodSchema = z.object({
  appointmentId: z.string("Appointment ID must be a string"),
  followUpDate: z
    .string("Follow-up date must be a string")
    .min(1, "Follow-up date is required"),
  instructions: z.string("Instructions must be a string").optional(),
});
const updatePrescriptionZodSchema = z.object({
  followUpDate: z
    .string("Follow-up date must be a string")
    .min(1, "Follow-up date is required")
    .optional(),
  instructions: z.string("Instructions must be a string").optional(),
});

export const PrescriptionValidation = {
  createPrescriptionZodSchema,
  updatePrescriptionZodSchema,
};
