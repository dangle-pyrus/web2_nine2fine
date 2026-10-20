import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes';

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Đăng ký các Module Routes
app.use('/api/auth', authRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Nine2Fine API is running smoothly!',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to Nine2Fine API!' });
});

export default app;
