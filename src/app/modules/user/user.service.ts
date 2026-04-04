
import { Role, Specialty } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { ICreateAdmin, ICreateDoctorPayload, ICreateSuperAdmin } from "./user.interface";
import { auth } from "../../lib/auth";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";


const createDoctor = async (payload: ICreateDoctorPayload) => {
    const specialties: Specialty[] = []
    for (const specialtiesId of payload.specialties) {
        const specialty = await prisma.specialty.findUnique({
            where: {
                id: specialtiesId
            }
        });
        if (specialty) {
            specialties.push(specialty);
        }

    }
    const userExists = await prisma.user.findUnique({
        where: {
            email: payload.doctor.email
        }
    });
    if (userExists) {
        throw new AppError(StatusCodes.BAD_REQUEST, "User with this email already exists");
    }
    const userData = await auth.api.signUpEmail({
        body: {
            name: payload.doctor.name,
            email: payload.doctor.email,
            password: payload.password,
            role: Role.DOCTOR,
            needPasswordChange: true,

        }
    })
    try {
        const doctor = await prisma.$transaction(async (tx) => {
            const doctorData = await tx.doctor.create({
                data: {
                    userId: userData.user.id,
                    ...payload.doctor
                }
            })
            const doctorSpecialtyData = specialties.map((specialty) => {
                return {
                    doctorId: doctorData.id,
                    specialtyId: specialty.id
                }
            });
            await tx.doctorSpecialty.createMany({
                data: doctorSpecialtyData
            })
            const data = await tx.doctor.findUnique({
                where: {
                    id: doctorData.id
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    experience: true,
                    address: true,
                    profilePhoto: true,
                    designation: true,
                    qualification: true,
                    contactNumber: true,
                    currentWorkplace: true,
                    registrationNumber: true,
                    appointmentFee: true,
                    createdAt: true,
                    updatedAt: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            role: true,
                            status: true,
                            emailVerified: true,
                            image: true,
                            isDeleted: true,
                            deletedAt: true,
                            createdAt: true,
                            updatedAt: true,

                        }
                    },
                    specialties: {
                        select: {
                            specialty: {
                                select: {
                                    id: true,
                                    title: true
                                }
                            }
                        }
                    }
                }

            })

            return data
        })

        return doctor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.log("Error occurred while creating doctor");
        await prisma.user.delete({
            where: {
                id: userData.user.id
            }
        })
        throw error
    }
}
const createAdmin = async (payload: ICreateAdmin) => {
    // check if user with the same email already exists
    const userExists = await prisma.user.findUnique({
        where: {
            email: payload.admin.email
        }
    });
    // if user exists throw error
    if (userExists) {
        throw new AppError(StatusCodes.BAD_REQUEST, "User with this email already exists");
    }
    // create user in auth system
    const userData = await auth.api.signUpEmail({
        body: {
            email: payload.admin.email,
            name: payload.admin.name,
            password: payload.password,
            role: Role.ADMIN,
            needPasswordChange: true,
            rememberMe: false
        }
    })
    try {
        // create admin in database
        const admin = await prisma.$transaction(async (tx) => {
            const adminData = await tx.admin.create({
                data: {
                    userId: userData.user.id,
                    name: payload.admin.name,
                    email: payload.admin.email,
                    contactNumber: payload.admin.contactNumber,
                    profilePhoto: payload.admin.profilePhoto
                }
            })
            // select the created admin with user details
            const data = await tx.admin.findUnique({
                where: {
                    id: adminData.id
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    contactNumber: true,
                    profilePhoto: true,
                    createdAt: true,
                    updatedAt: true,

                    user: {
                        select: {
                            id: true,
                            email: true,
                            role: true,
                            status: true,
                            emailVerified: true,
                            image: true,
                        }
                    }
                }

            })
            return data

        })
        return admin

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.log("Error occurred while creating admin");
        await prisma.user.delete({
            where: {
                id: userData.user.id
            }
        })
        throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, error.message || "Something went wrong while creating admin")

    }
}
const createSuperAdmin = async (payload: ICreateSuperAdmin) => {
    const userExists = await prisma.user.findUnique({
        where: {
            email: payload.superAdmin.email
        }
    });
    if (userExists) {
        throw new AppError(StatusCodes.BAD_REQUEST, "User with this email already exists");
    }
    const userData = await auth.api.signUpEmail({
        body: {
            email: payload.superAdmin.email,
            name: payload.superAdmin.name,
            password: payload.password,
            role: Role.SUPER_ADMIN,
            needPasswordChange: true,
            rememberMe: false
        }
    })
    try {
        const superAdmin = await prisma.$transaction(async (tx) => {
            const superAdminData = await tx.superAdmin.create({
                data: {
                    userId: userData.user.id,
                    name: payload.superAdmin.name,
                    email: payload.superAdmin.email,
                    contactNumber: payload.superAdmin.contactNumber,
                }
            })
            const data = await tx.superAdmin.findUnique({
                where: {
                    id: superAdminData.id
                },
                select: {
                    id: true,
                    name: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            role: true,
                            status: true,
                            emailVerified: true,
                            image: true,
                        }
                    }
                }

            })
            return data

        })
        return superAdmin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.log("error creating super admin");
        await prisma.user.delete({
            where: {
                id: userData.user.id
            }
        })
        throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, error.message || "Something went wrong while creating super admin")

    }
}
export const UserService = {
    createDoctor,
    createAdmin,
    createSuperAdmin
}