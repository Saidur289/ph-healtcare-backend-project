// dates are "YYYY-MM-DD", times "HH:mm" - wall-clock time in timeZone
export interface ICreateSchedulePayload {
    startDate: string,
    endDate: string,
    startTime: string,
    endTime: string,
    timeZone?: string
}
export interface IUpdateSchedulePayload {
    startDate: string,
    endDate: string,
    startTime: string,
    endTime: string,
    timeZone?: string
}