import z from "zod";

// "YYYY-MM-DD" or a full ISO date string that JavaScript can parse
const dateString = z
  .string("Follow-up date must be a string")
  .min(1, "Follow-up date is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Follow-up date must be a valid date",
  });

const text = (label: string, max: number) =>
  z.string(`${label} is required`).trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const medicineSchema = z.strictObject({
  name: text("Medicine name", 120),
  dose: text("Dose", 60), // e.g. "500 mg"
  frequency: text("Frequency", 60), // e.g. "1+0+1 after meals"
  duration: text("Duration", 60), // e.g. "7 days"
  notes: z.string().trim().max(300, "Notes are too long").optional(),
});

const medicinesSchema = z
  .array(medicineSchema)
  .min(1, "Add at least one medicine")
  .max(30, "At most 30 medicines");

const createPrescriptionZodSchema = z.strictObject({
  appointmentId: z.uuid("A valid appointment id is required"),
  followUpDate: dateString,
  instructions: text("Instructions", 5000),
  medicines: medicinesSchema,
});
const updatePrescriptionZodSchema = z.strictObject({
  followUpDate: dateString.optional(),
  instructions: text("Instructions", 5000).optional(),
  medicines: medicinesSchema.optional(),
});

export type TMedicine = z.infer<typeof medicineSchema>;

export const PrescriptionValidation = {
  createPrescriptionZodSchema,
  updatePrescriptionZodSchema,
};
