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
import quickLaunchRoutes from './routes/quickLaunchRoutes';
import eventRoutes from './routes/eventRoutes';
import performanceEvaluationRoutes from './routes/performanceEvaluationRoutes';
import { startSecurityCleanupJob } from './services/securityCleanup';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use((req: Request, res: Response, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
});
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production')) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  fallthrough: false,
  immutable: true,
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

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
app.use('/api/quick-launch', quickLaunchRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/performance-evaluations', performanceEvaluationRoutes);

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'Server is running' });
});

app.get('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found' });
});

app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.use((error: Error, req: Request, res: Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === 'Only image uploads are allowed') {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  console.error('Unhandled request error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
initializeDatabase()
  .then(() => {
    startSecurityCleanupJob();
    app.listen(PORT, () => {
      console.log(`Shield backend running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
