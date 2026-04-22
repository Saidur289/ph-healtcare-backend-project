
import z from "zod";


const createScheduleZodSchema = z.object({
    startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "Start date must be a valid date",
    }).optional(),
    endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "End date must be a valid date",
    }).optional(),
    startTime: z.string().refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
        message: "Invalid time format",
    }).optional(),
    endTime: z.string().refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
        message: "Invalid time format",
    }).optional(),
})
const updateScheduleZodSchema = z.object({
    startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "Start date must be a valid date",
    }).optional(),
    endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "End date must be a valid date",
    }).optional,
    startTime: z.string().refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
        message: "invalid time format",
    }).optional,
    endTime: z.string().refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
        message: "invalid time format",
    }).optional()
})

export const ScheduleValidation = {
    createScheduleZodSchema,
    updateScheduleZodSchema
}