import express, { Request, Response } from 'express';
import { IndexRoutes } from './app/routes';
import path from "path"
import { notFound } from './app/middleware/notFound';
import globalErrorHandler from './app/middleware/globalErrorHandler';
import cookieParser from 'cookie-parser';
import cors from 'cors'
import { envVars } from './app/config/env';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './app/lib/auth';
import qs from "qs"



const app = express();
app.set("query parser", (str: string) => qs.parse(str))
app.set("view engine", "ejs")
app.set("views", path.resolve(process.cwd(), `src/app/templates`))
app.use(express.json())
app.use(cors({
    origin: [
        "http://localhost:3000",
        "http://localhost:5000", envVars.FRONTEND_URL, envVars.BETTER_AUTH_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Set-Cookie"]
}))
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))
app.use("/api/v1", IndexRoutes)
app.use("/api/auth", toNodeHandler(auth))


app.get('/', (req: Request, res: Response) => {
    res.send('Hello, TypeScript Express!');
});
app.use(globalErrorHandler)
app.use(notFound)
export default app