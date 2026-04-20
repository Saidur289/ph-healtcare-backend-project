import { Prisma } from "../../../generated/prisma/client";

export const doctorSearchableFields = ["name", "email", "qualification", "designation", "currentWorkplace", "registrationNumber", "specialties.specialty.title"];
export const doctorFilterableFields = ["gender", "isDeleted", "appointmentFee", "experience", "address", "contactNumber", "name", "email", "qualification", "designation", "currentWorkplace", "registrationNumber", "specialties.specialtyId", "specialties.specialty.title", "user.role"];
export const doctorIncludeConfig: Partial<Record<keyof Prisma.DoctorInclude, Prisma.DoctorInclude[keyof Prisma.DoctorInclude]>> = {
    user: true,
    specialties: {
        include: {
            specialty: true
        }
    },
    appointments: {
        include: {
            patient: true,
            doctor: true
        }
    },
    doctorSchedules: {
        include: {
            schedule: true
        }
    },
    prescriptions: true,
    reviews: true
}