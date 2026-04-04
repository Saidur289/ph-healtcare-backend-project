
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
const createToken = (payload: JwtPayload, secret: string, { expiresIn }: SignOptions) => {
    const token = jwt.sign(payload, secret, { expiresIn });
    return token;
}
const verifyToken = (token: string, secret: string) => {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return decoded;
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