import { StatusCodes } from "http-status-codes"
import { UserStatus } from "../../../generated/prisma/enums"
import AppError from "../../errorHelpers/AppError"
import { auth } from "../../lib/auth"
import { prisma } from "../../lib/prisma"
import TokenUtils from "../../utils/token"

interface IRegisterPatientPayload {
    email: string,
    name: string,
    password: string
}
const registerPatient = async (payload: IRegisterPatientPayload) => {
    const { name, email, password } = payload
    const data = await auth.api.signUpEmail({
        body: {
            name,
            email,
            password
        }
    })
    if (!data.user) {
        throw new AppError(StatusCodes.BAD_REQUEST, "Failed to register patient")
    }
    // register patient in the database
    try {
        const patient = await prisma.$transaction(async (tx) => {
            const patientTx = await tx.patient.create({
                data: {
                    userId: data.user.id,
                    name: data.user.name,
                    email: data.user.email,
                }
            })
            return patientTx
        })
        const accessToken = TokenUtils.getAccessToken({
            userId: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            status: data.user.status,
            isDeleted: data.user.isDeleted,
            emailVerified: data.user.emailVerified
        })
        const refreshToken = TokenUtils.getRefreshToken({
            userId: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            status: data.user.status,
            isDeleted: data.user.isDeleted,
            emailVerified: data.user.emailVerified
        })
        return { ...data, patient, accessToken, refreshToken }
    } catch (error) {
        console.log("Error occurred while registering patient:", error);
        await prisma.user.delete({
            where: {
                id: data.user.id
            }
        })
        throw error
    }



}
interface ILoginUserPayload {
    email: string,
    password: string
}
const loginUser = async (payload: ILoginUserPayload) => {
    const { email, password } = payload
    const data = await auth.api.signInEmail({
        body: {
            email,
            password
        }
    })
    if (data.user.status === UserStatus.BLOCKED) {
        throw new AppError(StatusCodes.FORBIDDEN, "User is blocked")
    }
    if (data.user.isDeleted || data.user.status === UserStatus.DELETED) {
        throw new AppError(StatusCodes.NOT_FOUND, "User is deleted")
    }
    const accessToken = TokenUtils.getAccessToken({
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        status: data.user.status,
        isDeleted: data.user.isDeleted,
        emailVerified: data.user.emailVerified
    })
    const refreshToken = TokenUtils.getRefreshToken({
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        status: data.user.status,
        isDeleted: data.user.isDeleted,
        emailVerified: data.user.emailVerified
    })

    return {
        ...data,
        accessToken,
        refreshToken
    }

}
export const AuthService = {
    registerPatient,
    loginUser
}