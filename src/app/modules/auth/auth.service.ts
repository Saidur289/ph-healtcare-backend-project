import { UserStatus } from "../../../generated/prisma/enums"
import { auth } from "../../lib/auth"

interface IRegisterPatientPayload {
    email: string,
    name: string,
    password: string
}
const registerPatient = async (payload: IRegisterPatientPayload) => {
    const { name, email, password } = payload
    const data = await auth.api.signUpEmail({
        body: {
            name,
            email,
            password
        }
    })
    if (!data.user) {
        throw new Error("Failed to register patient")
    }
    return data


}
interface ILoginUserPayload {
    email: string,
    password: string
}
const loginUser = async (payload: ILoginUserPayload) => {
    const { email, password } = payload
    const data = await auth.api.signInEmail({
        body: {
            email,
            password
        }
    })
    if (data.user.status === UserStatus.BLOCKED) {
        throw new Error("User is blocked")
    }
    if (data.user.isDeleted || data.user.status === UserStatus.DELETED) {
        throw new Error("User is deleted")
    }
    return data

}
export const AuthService = {
    registerPatient,
    loginUser
}