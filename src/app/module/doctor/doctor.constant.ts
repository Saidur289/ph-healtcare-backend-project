import { Prisma } from "../../../generated/prisma/client";

// ---------- Public (no login) ----------
// Public endpoints must never expose patient data or private doctor contact details.
export const doctorPublicSearchableFields = ["name", "qualification", "designation", "currentWorkingPlace", "specialties.specialty.title"];
export const doctorPublicFilterableFields = ["gender", "appointmentFee", "experience", "averageRating", "specialties.specialtyId", "specialties.specialty.title"];
export const doctorPublicSortableFields = ["createdAt", "name", "appointmentFee", "experience", "averageRating"];

export const doctorPublicSelect = {
    id: true,
    name: true,
    profilePhoto: true,
    gender: true,
    experience: true,
    qualification: true,
    designation: true,
    currentWorkingPlace: true,
    registrationNumber: true,
    appointmentFee: true,
    averageRating: true,
    createdAt: true,
    specialties: {
        select: {
            specialty: {
                select: { id: true, title: true, icon: true }
            }
        }
    },
} satisfies Prisma.DoctorSelect;

// single doctor page: profile + future free slots + reviews (reviewer name/photo only)
export const getDoctorPublicDetailsSelect = () => ({
    ...doctorPublicSelect,
    doctorSchedules: {
        where: {
            isBooked: false,
            schedule: { startDateTime: { gte: new Date() } },
        },
        orderBy: { schedule: { startDateTime: "asc" } },
        select: {
            doctorId: true,
            scheduleId: true,
            isBooked: true,
            schedule: {
                select: { id: true, startDateTime: true, endDateTime: true }
            }
        }
    },
    reviews: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            patient: {
                select: { name: true, profilePhoto: true }
            }
        }
    },
} satisfies Prisma.DoctorSelect);

// ---------- Admin only ----------
export const doctorSearchableFields = ["name", "email", "qualification", "designation", "currentWorkingPlace", "registrationNumber", "specialties.specialty.title"];
export const doctorFilterableFields = ["gender", "isDeleted", "appointmentFee", "experience", "address", "contactNumber", "name", "email", "qualification", "designation", "currentWorkingPlace", "registrationNumber", "specialties.specialtyId", "specialties.specialty.title", "user.role"];

// safe user columns (no tokens / internal flags beyond what an admin needs)
export const doctorUserAdminSelect = {
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
} satisfies Prisma.UserSelect;

export const doctorIncludeConfig: Partial<Record<keyof Prisma.DoctorInclude, Prisma.DoctorInclude[keyof Prisma.DoctorInclude]>> = {
    user: { select: doctorUserAdminSelect },
    specialties: {
        include: {
            specialty: true
        }
    },
    appointments: {
        include: {
            patient: true,
            schedule: true
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
