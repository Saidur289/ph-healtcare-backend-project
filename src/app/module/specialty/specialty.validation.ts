import z from "zod";

const createSpecialtyZodSchema = z.object({
    title: z.string("Title is required").min(5, "Title must be at least 5 characters long").max(30, "Title must be less than 30 characters"),
    description: z.string("Description is required").min(5, "Description must be at least 5 characters long").max(50, "Description must be less than 50 characters").optional()
})

export const SpecialtyValidation = {
    createSpecialtyZodSchema
}