import { Role } from "../../generated/prisma/enums";

export interface IRequestUser {
    userId: string,
    email: string,
    role: Role
}