import { StatusCodes } from "http-status-codes"
import AppError from "../../errorHelpers/AppError"
import { prisma } from "../../lib/prisma"
import { IUpdateAdminPayload } from "./admin.interface"
import { IRequestUser } from "../../interface/requestUser.interface"
import { UserStatus } from "../../../generated/prisma/enums"

const getAllAdmin = async () => {
    const result = await prisma.admin.findMany({
        where: {
            isDeleted: false
        },
        orderBy: {
            createdAt: "desc"
        },
        select: {
            id: true,
            name: true,
            email: true,
            profilePhoto: true,
            user: {
                select: {
                    role: true,
                    status: true
                }
            }

        }
    })



    return result


}
const getAdminById = async (adminId: string) => {
    const admin = await prisma.admin.findFirst({
        where: {
            id: adminId,
            isDeleted: false
        },

    })
    if (!admin) {
        throw new AppError(StatusCodes.NOT_FOUND, "Admin not found")
    }
    return admin
}
const updateAdmin = async (adminId: string, payload: IUpdateAdminPayload) => {
    // check if admin exists
    const isAdminExists = await prisma.admin.findFirst({
        where: {
            id: adminId,
            isDeleted: false

        },


    })
    if (!isAdminExists) {
        throw new AppError(StatusCodes.NOT_FOUND, "admin not found")
    }
    const { admin } = payload
    // update admin data
    const updatedAdmin = await prisma.admin.update({
        where: {
            id: adminId
        },
        data: { ...admin },

    })



    return updatedAdmin
}
const deleteAdmin = async (adminId: string, user: IRequestUser) => {
    const existsAdmin = await prisma.admin.findUnique({
        where: {
            id: adminId
        }
    })
    if (!existsAdmin) {
        throw new Error("admin not found")
    }
    if (existsAdmin.isDeleted) {
        throw new Error("admin is already deleted")
    }
    if (existsAdmin.id === user.userId) {
        throw new AppError(StatusCodes.BAD_REQUEST, "You cannot delete yourself")
    }
    const result = await prisma.$transaction(async (tx) => {
        await tx.admin.update({
            where: {
                id: adminId
            },
            data: {
                isDeleted: true,
                deletedAt: new Date()
            }
        })
        await tx.user.update({
            where: { id: existsAdmin.id },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                status: UserStatus.DELETED
            }
        })
        await tx.session.deleteMany({
            where: { userId: existsAdmin.userId }
        })
        const admin = await getAdminById(adminId)
        return admin

    })
    return result
}
export const AdminService = {
    getAllAdmin,
    getAdminById,
    deleteAdmin,
    updateAdmin
}