import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import { initializeDatabase } from './config/initializeDatabase';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import reportRoutes from './routes/reportRoutes';
import calendarRoutes from './routes/calendarRoutes';
import deviceRoutes from './routes/deviceRoutes';
import messageRoutes from './routes/messageRoutes';
import auditRoutes from './routes/auditRoutes';
import dashboardPostRoutes from './routes/dashboardPostRoutes';
import bugReportRoutes from './routes/bugReportRoutes';
import notificationRoutes from './routes/notificationRoutes';
import mileageRoutes from './routes/mileageRoutes';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard-posts', dashboardPostRoutes);
app.use('/api/bugs', bugReportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/mileage', mileageRoutes);

app.use((error: Error, req: Request, res: Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === 'Only image uploads are allowed') {
    return res.status(400).json({ error: error.message });
  }

  next(error);
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'Server is running' });
});

// Start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Shield backend running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
