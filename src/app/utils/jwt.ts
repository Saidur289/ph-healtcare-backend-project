
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

const createToken = (payload: JwtPayload, secret: string, { expiresIn }: SignOptions) => {
    const token = jwt.sign(payload, secret, { expiresIn });
    return token;
}
const verifyToken = (token: string, secret: string) => {
    try {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        return {
            success: true,
            data: decoded
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        return {
            success: false,
            error: error.message,

        }
    }
}
const decodeToken = (token: string) => {
    const decoded = jwt.decode(token) as JwtPayload;
    return decoded;
}
const JwtUtils = {
    createToken,
    verifyToken,
    decodeToken
}
export default JwtUtils;