import z from "zod";

export const createUpdateAdminValidationZodSchema = z.object({
    name: z.string().optional(),
    profilePhoto: z.url().optional(),
    contactNumber: z.string().optional(),

})
export const AdminValidation = {
    createUpdateAdminValidationZodSchema
}