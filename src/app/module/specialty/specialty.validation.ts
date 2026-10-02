import z from "zod";

const title = z
    .string("Title is required")
    .trim()
    .min(2, "Title must be at least 2 characters long")
    .max(60, "Title must be at most 60 characters");
const description = z.string("Description must be text").trim().max(300, "Description must be at most 300 characters");

const createSpecialtyZodSchema = z.strictObject({
    title,
    description: description.optional(),
})

const updateSpecialtyZodSchema = z.strictObject({
    title: title.optional(),
    description: description.optional(),
})

export const SpecialtyValidation = {
    createSpecialtyZodSchema,
    updateSpecialtyZodSchema,
}
