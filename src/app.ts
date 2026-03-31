import express, { Request, Response } from 'express';
import { IndexRoutes } from './app/routes';

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json())
app.use("/api/v1", IndexRoutes)
app.get('/', (req: Request, res: Response) => {
    res.send('Hello, TypeScript Express!');
});
export default app