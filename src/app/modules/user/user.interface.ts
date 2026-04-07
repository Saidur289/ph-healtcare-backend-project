import { Gender } from "../../../generated/prisma/enums"

/*
model Doctor{
    id String @id @default(uuid(7))
    name String
    email String @unique
    experience Int
    address String?
    profilePhoto String?
    designation String
    qualification String
    contactNumber String?
    isDeleted Boolean @default(false)
    deletedAt DateTime?
    currentWorkplace String
    gender Gender
    registrationNumber String @unique
    appointmentFee Float
    averageRating Float @default(0)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    specialties DoctorSpecialty[]
    // relation 
    userId String @unique
    user User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}
*/
export interface ICreateDoctorPayload {
    password: string
    doctor: {
        name: string
        email: string
        experience: number
        address?: string
        profilePhoto?: string
        designation: string
        qualification: string
        contactNumber?: string
        currentWorkplace: string
        registrationNumber: string
        appointmentFee: number
        gender: Gender
    },
    specialties: string[]
}
export interface ICreateAdmin {
    password: string,
    admin: {
        name: string,
        email: string,
        contactNumber?: string,
        profilePhoto?: string,
    },
    role: "ADMIN" | "SUPER_ADMIN"
}
export interface ICreateSuperAdmin {
    password: string,
    superAdmin: {
        name: string,
        email: string,
        contactNumber?: string,
        profilePhoto?: string,
    }
}

