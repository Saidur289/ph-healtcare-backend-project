import z from "zod";

// "YYYY-MM-DD" or a full ISO date string that JavaScript can parse
const dateString = z
  .string("Follow-up date must be a string")
  .min(1, "Follow-up date is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Follow-up date must be a valid date",
  });

const createPrescriptionZodSchema = z.strictObject({
  appointmentId: z.uuid("A valid appointment id is required"),
  followUpDate: dateString,
  instructions: z
    .string("Instructions must be a string")
    .trim()
    .min(1, "Instructions are required")
    .max(5000, "Instructions must be at most 5000 characters"),
});
const updatePrescriptionZodSchema = z.strictObject({
  followUpDate: dateString.optional(),
  instructions: z
    .string("Instructions must be a string")
    .trim()
    .min(1, "Instructions are required")
    .max(5000, "Instructions must be at most 5000 characters")
    .optional(),
});

export const PrescriptionValidation = {
  createPrescriptionZodSchema,
  updatePrescriptionZodSchema,
};
