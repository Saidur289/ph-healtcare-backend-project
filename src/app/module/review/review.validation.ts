import z from "zod";

// Plain text only: tags are removed, so a comment can never inject HTML into a page or email.
const stripHtml = (value: string) =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const ratingSchema = z
  .int("Rating must be a whole number")
  .min(1, "Rating must be at least 1")
  .max(5, "Rating must be at most 5");

const commentSchema = z
  .string("Comment is required")
  .transform(stripHtml)
  .pipe(
    z
      .string()
      .min(5, "Comment must be at least 5 characters long")
      .max(1000, "Comment must be at most 1000 characters"),
  );

const CreateReviewZodSchema = z.strictObject({
  appointmentId: z.uuid("A valid appointment id is required"),
  rating: ratingSchema,
  comment: commentSchema,
});
const UpdateReviewZodSchema = z.strictObject({
  rating: ratingSchema.optional(),
  comment: commentSchema.optional(),
});
// admin moderation
const ReviewVisibilityZodSchema = z.strictObject({
  isHidden: z.boolean("isHidden must be true or false"),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(300, "Reason must be at most 300 characters").optional(),
});
export const ReviewValidation = {
  ReviewVisibilityZodSchema,
  CreateReviewZodSchema,
  UpdateReviewZodSchema,
};
