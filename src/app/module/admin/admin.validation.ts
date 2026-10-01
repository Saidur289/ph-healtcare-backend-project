import z from "zod";
import { Role, UserStatus } from "../../../generated/prisma/enums";

export const createUpdateAdminValidationZodSchema = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    profilePhoto: z.url().optional(),
    contactNumber: z.string().trim().min(11).max(14).optional(),
})

export const changeUserStatusZodSchema = z.object({
    userId: z.string("User id is required").min(1, "User id is required"),
    // DELETED is set only by the delete endpoints
    userStatus: z.enum([UserStatus.ACTIVE, UserStatus.BLOCKED], "Status must be ACTIVE or BLOCKED"),
})

export const changeUserRoleZodSchema = z.object({
    userId: z.string("User id is required").min(1, "User id is required"),
    role: z.enum([Role.ADMIN, Role.SUPER_ADMIN], "Role must be ADMIN or SUPER_ADMIN"),
})

export const AdminValidation = {
    createUpdateAdminValidationZodSchema,
    changeUserStatusZodSchema,
    changeUserRoleZodSchema,
}
