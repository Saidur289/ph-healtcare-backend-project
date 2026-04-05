import z from "zod";

export const createUpdateAdminValidationZodSchema = z.object({
    name: z.string().optional(),
    profilePhoto: z.string().optional(),
    contactNumber: z.string().optional(),

})
export const AdminValidation = {
    createUpdateAdminValidationZodSchema
}