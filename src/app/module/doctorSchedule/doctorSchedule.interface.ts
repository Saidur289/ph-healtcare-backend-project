export interface ICreateDoctorSchedule {
    scheduleIds: string[];

}
export interface IUpdateDoctorSchedule {
    scheduleIds: {
        shouldDelete: boolean;
        scheduleId: string
    }[];
}