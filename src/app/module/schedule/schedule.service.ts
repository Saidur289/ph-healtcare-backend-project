

import { ICreateSchedulePayload } from "./schedule.interface";
import { addHours, addMinutes, format } from "date-fns";
import { convertDateTime } from "./schedule.utils";
import { prisma } from "../../lib/prisma";
import { IQueryParams } from "../../interface/query.interface";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { Prisma, Schedule } from "../../../generated/prisma/client";
import { scheduleFilterableFields, scheduleIncludeConfig, scheduleSearchableFields } from './schedule.constant';

const createSchedule = async (payload: ICreateSchedulePayload) => {
    //destructure payload
    const { startDate, endDate, startTime, endTime } = payload
    console.log("payload Received", payload);
    //schedule interval 30 min
    const interval = 30;
    console.log("interval: ", 30, "min");
    //convert startDate and endDate to Date object
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);
    console.log("Current Date:", currentDate);
    console.log("Last Date:", lastDate);
    //Array to store created schedules
    const schedules = [];
    //loop through startDate to endDate
    while (currentDate <= lastDate) {
        console.log("===================================");
        console.log("Processing Date:", currentDate);
        //create starDateTime for current date
        const startDateTime = new Date(
            addMinutes(
                addHours(
                    `${format(currentDate, "yyyy-MM-dd")}`,
                    Number(startTime.split(":")[0])  // hour part
                ),
                Number(startTime.split(":")[1]) // minute part
            )
        );
        console.log("startTime", startDateTime);
        // create endDateTime for current date
        const endDateTime = new Date(
            addMinutes(
                addHours(
                    `${format(currentDate, "yyyy-MM-dd")}`,
                    Number(endTime.split(":")[0])  // hour part
                ),
                Number(endTime.split(":")[1]) // minute part
            )
        );
        //generate 30 min slots 
        while (startDateTime < endDateTime) {
            console.log("-----------------------------------");
            console.log("Current Slot Start:", startDateTime);
            // convert startDateTime to utc or db formate
            const utcStartDateTime = await convertDateTime(startDateTime);
            console.log(utcStartDateTime, "start date");
            const utcEndDateTime = await convertDateTime(addMinutes(startDateTime, interval));
            console.log(utcEndDateTime, "end date");
            const scheduleData = {
                startDateTime: utcStartDateTime,
                endDateTime: utcEndDateTime,
            }
            const existingSchedule = await prisma.schedule.findFirst({
                where: {
                    startDateTime: scheduleData.startDateTime,
                    endDateTime: scheduleData.endDateTime
                }
            })
            if (!existingSchedule) {
                const schedule = await prisma.schedule.create({
                    data: scheduleData
                })
                schedules.push(schedule);
            }
            startDateTime.setMinutes(startDateTime.getMinutes() + interval);
            console.log("Next Slot Start:", startDateTime);


        }
        currentDate.setDate(currentDate.getDate() + 1);
        console.log("===================================");
    }
    return schedules

}
const getAllSchedules = async (query: IQueryParams) => {
    const queryBuilder = new QueryBuilder<Schedule, Prisma.ScheduleWhereInput, Prisma.ScheduleInclude>(prisma.schedule, query, {
        searchableFields: scheduleSearchableFields,
        filterableFields: scheduleFilterableFields
    }
    )
    const result = await queryBuilder.search().filter().paginate().dynamicInclude(scheduleIncludeConfig).sort().fields().execute()
    return result
}
export const ScheduleService = {
    createSchedule,
    getAllSchedules
}