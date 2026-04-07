import { StatusCodes } from "http-status-codes"
import { UserStatus } from "../../../generated/prisma/enums"
import AppError from "../../errorHelpers/AppError"
import { auth } from "../../lib/auth"
import { prisma } from "../../lib/prisma"
import TokenUtils from "../../utils/token"

import JwtUtils from "../../utils/jwt"
import { envVars } from "../../config/env"
import { JwtPayload } from "jsonwebtoken"
import { IChangePasswordPayload, ILoginUserPayload, IRegisterPatientPayload } from "./auth.interface"
import { IRequestUser } from "../../interface/requestUser.interface"




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
const getMe = async (user: IRequestUser) => {
    const isUserExists = await prisma.user.findUnique({
        where: {
            id: user.userId
        },
        include: {
            Patient: {
                include: {
                    prescriptions: true,
                    medicalReports: true,
                    appointments: true,
                    reviews: true,
                },


            },

            Doctor: {
                include: {
                    reviews: true,
                    prescriptions: true,
                    appointments: true,
                }
            },
            Admin: true

        }




    })
    if (!isUserExists) {
        throw new AppError(StatusCodes.NOT_FOUND, "user not found")
    }
    return isUserExists
}
const getNewToken = async (refreshToken: string, sessionToken: string) => {
    const isSessionTokenExists = await prisma.session.findUnique({
        where: {
            token: sessionToken
        },
        include: {
            user: true
        }
    })
    if (!isSessionTokenExists) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid session token")
    }
    const verifiedRefreshToken = JwtUtils.verifyToken(refreshToken, envVars.REFRESH_TOKEN_SECRET)
    if (!verifiedRefreshToken) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token")
    }
    // console.log({ verifiedRefreshToken }, "verified token");
    const data = verifiedRefreshToken.data! as JwtPayload
    const newAccessToken = TokenUtils.getAccessToken({
        userId: data.userId,
        role: data.role,
        name: data.name,
        email: data.email,
        status: data.status,
        isDeleted: data.isDeleted,
        emailVerified: data.emailVerified
    })
    const newRefreshToken = TokenUtils.getRefreshToken({
        userId: data.userId,
        role: data.role,
        name: data.name,
        email: data.email,
        status: data.status,
        isDeleted: data.isDeleted,
        emailVerified: data.emailVerified
    })
    const { token } = await prisma.session.update({
        where: {
            token: sessionToken
        },
        data: {
            token: sessionToken,
            expiresAt: new Date(Date.now() + 60 * 60 * 60 * 1000),
            updatedAt: new Date()
        }
    })
    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        sessionToken: token
    }

}
const changePassword = async (payload: IChangePasswordPayload, sessionToken: string) => {
    const session = await auth.api.getSession({
        headers: new Headers({
            Authorization: `Bearer ${sessionToken}`
        })
    })

    if (!session) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "invalid session token")
    }
    const { currentPassword, newPassword } = payload
    const result = await auth.api.changePassword({
        body: {
            currentPassword,
            newPassword,
            revokeOtherSessions: true
        },
        headers: new Headers({
            Authorization: `Bearer ${sessionToken}`
        })
    })
    if (session.user.needPasswordChange) {
        await prisma.user.update({
            where: {
                id: session.user.id
            },
            data: {
                needPasswordChange: false,
            }
        })
    }
    const accessToken = TokenUtils.getAccessToken({
        userId: session.user.id,
        role: session.user.role,
        name: session.user.name,
        email: session.user.email,
        status: session.user.status,
        isDeleted: session.user.isDeleted,
        emailVerified: session.user.emailVerified
    })
    const refreshToken = TokenUtils.getRefreshToken({
        userId: session.user.id,
        role: session.user.role,
        name: session.user.name,
        email: session.user.email,
        status: session.user.status,
        isDeleted: session.user.isDeleted,
        emailVerified: session.user.emailVerified
    })
    return { ...result, accessToken, refreshToken }

}
const logoutUser = async (sessionToken: string) => {
    const result = await auth.api.signOut({
        headers: {
            authorization: `Bearer ${sessionToken}`
        }
    })
    return result
}
const verifyEmail = async (email: string, otp: string) => {
    const result = await auth.api.verifyEmailOTP({
        body: {
            email,
            otp
        }
    })
    if (result.status && !result.user.emailVerified) {
        await prisma.user.update({
            where: {
                email,
            },
            data: {
                emailVerified: true
            }
        })
    }
}

export const AuthService = {
    registerPatient,
    loginUser,
    getMe,
    getNewToken,
    changePassword,
    logoutUser,
    verifyEmail
}