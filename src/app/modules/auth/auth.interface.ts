export interface IChangePasswordPayload {
    currentPassword: string,
    newPassword: string
}
export interface ILoginUserPayload {
    email: string,
    password: string
}
export interface IRegisterPatientPayload {
    email: string,
    name: string,
    password: string
}