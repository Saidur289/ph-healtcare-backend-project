import z from "zod";

const CreateReviewZodSchema = z.object({
  appointmentId: z.uuid("A valid appointment id is required"),
  rating: z
    .number()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  comment: z
    .string("Comment is required")
    .trim()
    .min(5, "Comment must be at least 5 characters long")
    .max(1000, "Comment must be at most 1000 characters"),
});
const UpdateReviewZodSchema = z.object({
  rating: z
    .number()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5")
    .optional(),
  comment: z
    .string("Comment is required")
    .trim()
    .min(5, "Comment must be at least 5 characters long")
    .max(1000, "Comment must be at most 1000 characters")
    .optional(),
});
export const ReviewValidation = {
  CreateReviewZodSchema,
  UpdateReviewZodSchema,
};
