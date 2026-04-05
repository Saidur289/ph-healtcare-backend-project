import { StatusCodes } from "http-status-codes"
import AppError from "../../errorHelpers/AppError"
import { prisma } from "../../lib/prisma"
import { IUpdateAdmin } from "./admin.interface"

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
const updateAdmin = async (adminId: string, payload: IUpdateAdmin) => {
    // check if admin exists
    const admin = await prisma.admin.findFirst({
        where: {
            id: adminId,
            isDeleted: false

        },


    })
    if (!admin) {
        throw new AppError(StatusCodes.NOT_FOUND, "admin not found")
    }

    // update admin data
    const updatedAdmin = await prisma.admin.update({
        where: {
            id: adminId
        },
        data: payload,

    })



    return updatedAdmin
}
const deleteAdmin = async (adminId: string) => {
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
    const deleteAdmin = await prisma.admin.update({
        where: {
            id: adminId,
            isDeleted: false
        },
        data: {
            isDeleted: true,
            deletedAt: new Date()
        }
    })
    return deleteAdmin
}
export const AdminService = {
    getAllAdmin,
    getAdminById,
    deleteAdmin,
    updateAdmin
}