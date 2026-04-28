import z from "zod";

const CreateReviewZodSchema = z.object({
  rating: z
    .number()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  comment: z
    .string("Comment is required")
    .min(5, "Comment must be at least 5 characters long")
    .max(100, "Comment must be less than 100 characters"),
});
const UpdateReviewZodSchema = z.object({
  rating: z
    .number()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5")
    .optional(),
  comment: z
    .string("Comment is required")
    .min(5, "Comment must be at least 5 characters long")
    .max(100, "Comment must be less than 100 characters")
    .optional(),
});
export const ReviewValidation = {
  CreateReviewZodSchema,
  UpdateReviewZodSchema,
};
