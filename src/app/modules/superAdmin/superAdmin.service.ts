import { StatusCodes } from "http-status-codes"
import AppError from "../../errorHelpers/AppError"
import { prisma } from "../../lib/prisma"
import { IUpdateSuperAdmin } from "./superAdmin.interface"


const getAllSuperAdmin = async () => {
    const result = await prisma.superAdmin.findMany({
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
const getSuperAdminById = async (super_adminId: string) => {
    const superAdmin = await prisma.superAdmin.findFirst({
        where: {
            id: super_adminId,
            isDeleted: false
        },

    })
    if (!superAdmin) {
        throw new AppError(StatusCodes.NOT_FOUND, "SuperAdmin not found")
    }
    return superAdmin
}
const updateSuperAdmin = async (superAdminId: string, payload: IUpdateSuperAdmin) => {
    // check if superAdmin exists
    const superAdmin = await prisma.superAdmin.findFirst({
        where: {
            id: superAdminId,
            isDeleted: false

        },


    })
    if (!superAdmin) {
        throw new AppError(StatusCodes.NOT_FOUND, "SuperAdmin not found")
    }

    // update superAdmin data
    const updatedSuperAdmin = await prisma.superAdmin.update({
        where: {
            id: superAdminId
        },
        data: payload,

    })



    return updatedSuperAdmin
}
const deleteSuperAdmin = async (superAdminId: string) => {
    const existsSuperAdmin = await prisma.superAdmin.findUnique({
        where: {
            id: superAdminId
        }
    })
    if (!existsSuperAdmin) {
        throw new Error("superAdmin not found")
    }
    if (existsSuperAdmin.isDeleted) {
        throw new Error("superAdmin is already deleted")
    }
    const deleteSuperAdmin = await prisma.superAdmin.update({
        where: {
            id: superAdminId,
            isDeleted: false
        },
        data: {
            isDeleted: true,
            deletedAt: new Date()
        }
    })
    return deleteSuperAdmin
}
export const SuperAdminService = {
    getAllSuperAdmin,
    getSuperAdminById,
    updateSuperAdmin,
    deleteSuperAdmin
}