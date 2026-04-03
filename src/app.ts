import express, { Request, Response } from 'express';
import { IndexRoutes } from './app/routes';
import { notFound } from './app/middleware/notFound';
import globalErrorHandler from './app/middleware/globalErrorHandler';



const app = express();

app.use(express.json())
app.use("/api/v1", IndexRoutes)
app.use(notFound)

app.get('/', (req: Request, res: Response) => {
    res.send('Hello, TypeScript Express!');
});
app.use(globalErrorHandler)
export default app