import z from "zod";

const text = (label: string, min: number, max: number) =>
  z
    .string(`${label} must be text`)
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

// fields any user may change on their own profile; the service rejects fields that
// don't belong to the caller's role (e.g. an admin sending "designation")
export const updateMyProfileZodSchema = z.strictObject({
  name: text("Name", 2, 60).optional(),
  contactNumber: z
    .string("Contact number must be text")
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, "Contact number must be 7 to 15 digits, optionally starting with +")
    .optional(),
  address: text("Address", 3, 200).optional(),
  // doctor only (fee and registration number stay admin-only: PATCH /doctors/:id)
  designation: text("Designation", 2, 50).optional(),
  qualification: text("Qualification", 2, 50).optional(),
  currentWorkingPlace: text("Current working place", 2, 50).optional(),
  experience: z.int("Experience must be a whole number").min(0).max(70).optional(),
});

export type TUpdateMyProfilePayload = z.infer<typeof updateMyProfileZodSchema>;
