
import { Role, Specialty } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { ICreateDoctorPayload } from "./user.interface";
import { auth } from "../../lib/auth";


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
        throw new Error("User with this email already exists");
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
                    id: userData.user.id
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
export const UserService = {
    createDoctor,
}