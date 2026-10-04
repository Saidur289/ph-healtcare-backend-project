export interface IChangePasswordPayload {
    currentPassword: string,
    newPassword: string
}
export interface ILoginUserPayload {
    email: string,
    password: string,
    acceptTerms: true
}
export interface IRegisterPatientPayload {
    email: string,
    name: string,
    password: string,
    acceptTerms: true
}