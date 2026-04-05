import z from "zod";

export const createUpdateSuperAdminValidationZodSchema = z.object({
    name: z.string().optional(),
    profilePhoto: z.string().optional(),
    contactNumber: z.string().optional(),

})
export const SuperAdminValidation = {
    createUpdateSuperAdminValidationZodSchema
}