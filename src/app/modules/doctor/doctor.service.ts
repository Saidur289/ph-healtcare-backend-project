
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma"
import { IUpdateDoctor } from "./doctor.interface";

const getAllDoctors = async () => {
    const result = await prisma.doctor.findMany({
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
            designation: true,
            currentWorkplace: true,
            registrationNumber: true,
            appointmentFee: true,
            averageRating: true,
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

    const doctors = result.map(doctor => ({
        ...doctor,
        specialties: doctor.specialties.map(s => s.specialty)
    })
    )

    return doctors


}
const getDoctorById = async (doctorId: string) => {
    const doctor = await prisma.doctor.findFirst({
        where: {
            id: doctorId,
            isDeleted: false
        },
        include: {
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
    if (!doctor) {
        throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found")
    }
    return {
        ...doctor,
        specialties: doctor.specialties.map(s => s.specialty)
    }
}
const updateDoctor = async (doctorId: string, payload: IUpdateDoctor) => {
    // check if doctor exists
    const doctor = await prisma.doctor.findFirst({
        where: {
            id: doctorId,
            isDeleted: false

        },
        select: {
            specialties: {
                select: {
                    specialtyId: true
                }
            }
        }

    })
    if (!doctor) {
        throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found")
    }
    const { specialties, ...doctorData } = payload
    // update doctor data
    const updatedDoctor = await prisma.doctor.update({
        where: {
            id: doctorId
        },
        data: doctorData,
        include: {
            specialties: {
                include: {
                    specialty: true
                }
            }
        }
    })
    // new specialties 
    if (specialties && specialties.length > 0) {
        await prisma.doctorSpecialty.deleteMany({
            where: {
                doctorId: doctorId
            }
        })
        const doctorSpecialtyData = specialties.map((specialtyId) => {
            return {
                doctorId: doctorId,
                specialtyId: specialtyId
            }
        })
        await prisma.doctorSpecialty.createMany({
            data: doctorSpecialtyData
        })
        const result = await prisma.doctor.findUnique({
            where: {
                id: doctorId
            },
            include: {
                specialties: {
                    include: {
                        specialty: true
                    }
                }
            }
        })
        return {
            ...result,
            specialties: result?.specialties.map(s => s.specialty)
        }

    }

    return {
        ...updatedDoctor,
        specialties: updatedDoctor.specialties.map(s => s.specialty)

    }
}
const deleteDoctor = async (doctorId: string) => {
    const existsDoctor = await prisma.doctor.findUnique({
        where: {
            id: doctorId
        }
    })
    if (!existsDoctor) {
        throw new Error("doctor not found")
    }
    if (existsDoctor.isDeleted) {
        throw new Error("Doctor is already deleted")
    }
    const deleteDoctor = await prisma.doctor.update({
        where: {
            id: doctorId,
            isDeleted: false
        },
        data: {
            isDeleted: true,
            deletedAt: new Date()
        }
    })
    return deleteDoctor
}


export const DoctorService = {
    getAllDoctors,
    getDoctorById,
    updateDoctor,
    deleteDoctor
}