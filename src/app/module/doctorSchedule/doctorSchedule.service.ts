import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { ICreateDoctorSchedule } from "./doctorSchedule.interface";

const createDoctorSchedule = async (user: IRequestUser, payload: ICreateDoctorSchedule) => {
    const doctorData = await prisma.doctor.findUniqueOrThrow({ where: { email: user.email } })
    const doctorScheduleData = payload.scheduleIds.map((scheduleId) => ({
        doctorId: doctorData.id,
        scheduleId
    }))
    await prisma.doctorSchedules.createMany({ data: doctorScheduleData })
    const result = await prisma.doctorSchedules.findMany({ where: { doctorId: doctorData.id, scheduleId: { in: payload.scheduleIds } }, include: { schedule: true } })
    return result
}

export const DoctorScheduleService = {
    createDoctorSchedule
}