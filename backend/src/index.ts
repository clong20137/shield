import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import fs from 'fs';
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
import errorLogRoutes from './routes/errorLogRoutes';
import dashboardPostRoutes from './routes/dashboardPostRoutes';
import dashboardSummaryRoutes from './routes/dashboardSummaryRoutes';
import districtFeedRoutes from './routes/districtFeedRoutes';
import bugReportRoutes from './routes/bugReportRoutes';
import notificationRoutes from './routes/notificationRoutes';
import notificationSoundRoutes from './routes/notificationSoundRoutes';
import mileageRoutes from './routes/mileageRoutes';
import quickLaunchRoutes from './routes/quickLaunchRoutes';
import eventRoutes from './routes/eventRoutes';
import performanceEvaluationRoutes from './routes/performanceEvaluationRoutes';
import reminderRoutes from './routes/reminderRoutes';
import pinnedProfileRoutes from './routes/pinnedProfileRoutes';
import quickNoteRoutes from './routes/quickNoteRoutes';
import urgentAlertRoutes from './routes/urgentAlertRoutes';
import mediaRoutes from './routes/mediaRoutes';
import memorialProfileRoutes from './routes/memorialProfileRoutes';
import { startSecurityCleanupJob } from './services/securityCleanup';
import { requireAuthenticated } from './middleware/authSession';
import { rateLimit } from './middleware/rateLimit';
import { requestTimeout } from './middleware/requestTimeout';
import { csrfProtection } from './middleware/csrfProtection';
import { ErrorLogModel } from './models/ErrorLog';
import { createImageThumbnail } from './services/imageThumbnails';
import { protectExistingSensitiveUserData } from './services/sensitiveDataProtection';
import { isAllowedOrigin, parseAllowedOrigins } from './utils/originPolicy';
import { logProductionSecurityFindings } from './utils/securityConfig';

dotenv.config();
logProductionSecurityFindings();

const app: Express = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || '');
const apiRateLimitWindowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const apiRateLimitMax = Number(process.env.API_RATE_LIMIT_MAX || 3600);
const apiRequestTimeoutMs = Number(process.env.API_REQUEST_TIMEOUT_MS || 30 * 1000);
const isProduction = process.env.NODE_ENV === 'production';
const thumbnailGenerationPromises = new Map<string, Promise<string | null>>();

function getCspOrigins(): string[] {
  const configuredApiUrl = process.env.VITE_API_URL || process.env.API_BASE_URL || '';
  const configuredAppUrl = process.env.APP_BASE_URL || '';
  const origins = [...allowedOrigins];

  [configuredApiUrl, configuredAppUrl].forEach((value) => {
    if (!value) {
      return;
    }

    try {
      origins.push(new URL(value).origin);
    } catch {
      // Ignore invalid optional configuration and rely on explicit allowed origins.
    }
  });

  return [...new Set(origins)];
}

function getLocalDevelopmentCspSources(): string[] {
  return isProduction ? [] : ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*'];
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

async function generateMissingUploadThumbnail(req: Request, res: Response, next: express.NextFunction) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return next();
  }

  const normalizedRequestPath = decodeURIComponent(req.path).replace(/\\/gu, '/');
  const thumbnailMatch = normalizedRequestPath.match(/^\/(.+)\/thumbs\/([^/]+)-(\d+)\.webp$/u);
  if (!thumbnailMatch) {
    return next();
  }

  const [, containingDirectory, originalBaseName, widthValue] = thumbnailMatch;
  const width = Number(widthValue);
  if (!Number.isFinite(width) || width < 32 || width > 1200) {
    return next();
  }

  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const originalDirectory = path.resolve(uploadsRoot, containingDirectory);
  if (!isPathInside(uploadsRoot, originalDirectory)) {
    return next();
  }

  const allowedExtensions = ['.jpg', '.jpeg', '.jfif', '.png', '.gif', '.webp'];
  const originalPath = allowedExtensions
    .map((extension) => path.join(originalDirectory, `${originalBaseName}${extension}`))
    .find((candidatePath) => isPathInside(uploadsRoot, candidatePath) && fs.existsSync(candidatePath));

  if (!originalPath) {
    return next();
  }

  if (req.query.full === '1') {
    return res.sendFile(originalPath);
  }

  const thumbnailPath = path.join(originalDirectory, 'thumbs', `${originalBaseName}-${width}.webp`);
  if (isPathInside(uploadsRoot, thumbnailPath) && fs.existsSync(thumbnailPath)) {
    return next();
  }

  const thumbnailKey = `${originalPath}:${width}`;
  let generationPromise = thumbnailGenerationPromises.get(thumbnailKey);
  if (!generationPromise) {
    generationPromise = createImageThumbnail(originalPath, width);
    thumbnailGenerationPromises.set(thumbnailKey, generationPromise);
    generationPromise.finally(() => thumbnailGenerationPromises.delete(thumbnailKey));
  }

  await generationPromise;
  return next();
}

// Middleware
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const cspOrigins = getCspOrigins();
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', ...cspOrigins, ...getLocalDevelopmentCspSources()],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...cspOrigins, ...getLocalDevelopmentCspSources()],
      mediaSrc: ["'self'", 'blob:', ...cspOrigins],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
}));

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
    if (!origin || isAllowedOrigin(origin, allowedOrigins)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/api', csrfProtection({ allowedOrigins }));
const uploadsStaticMiddleware = express.static(path.join(process.cwd(), 'uploads'), {
  fallthrough: false,
  etag: true,
  immutable: true,
  lastModified: true,
  maxAge: '1d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  },
});
app.use('/uploads', requireAuthenticated(), generateMissingUploadThumbnail);
app.use('/api/uploads', requireAuthenticated(), generateMissingUploadThumbnail);
app.use('/uploads', requireAuthenticated(), uploadsStaticMiddleware);
app.use('/api/uploads', requireAuthenticated(), uploadsStaticMiddleware);

// Routes
app.use('/api', rateLimit({
  keyPrefix: 'api',
  windowMs: Number.isFinite(apiRateLimitWindowMs) && apiRateLimitWindowMs > 0 ? apiRateLimitWindowMs : 60 * 1000,
  max: Number.isFinite(apiRateLimitMax) && apiRateLimitMax > 0 ? apiRateLimitMax : 1200,
  message: 'Too many API requests. Slow down and try again shortly.',
  skipPaths: ['/events', '/messages/events'],
}));
app.use('/api', requestTimeout({
  timeoutMs: Number.isFinite(apiRequestTimeoutMs) && apiRequestTimeoutMs > 0 ? apiRequestTimeoutMs : 30 * 1000,
  message: 'The request took too long. Try again shortly.',
  skipPaths: ['/api/events', '/api/messages/events', '/api/users/import', '/api/users/profile-pictures/import'],
}));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/errors', errorLogRoutes);
app.use('/api/dashboard', dashboardSummaryRoutes);
app.use('/api/dashboard-posts', dashboardPostRoutes);
app.use('/api/district-feed', districtFeedRoutes);
app.use('/api/bugs', bugReportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notification-sounds', notificationSoundRoutes);
app.use('/api/mileage', mileageRoutes);
app.use('/api/quick-launch', quickLaunchRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/performance-evaluations', performanceEvaluationRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/pinned-profiles', pinnedProfileRoutes);
app.use('/api/quick-notes', quickNoteRoutes);
app.use('/api/urgent-alerts', urgentAlertRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/memorial-profiles', memorialProfileRoutes);

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
  const statusCode = (error as Error & { status?: number; statusCode?: number }).statusCode || (error as Error & { status?: number }).status;
  if (statusCode === 404 || (error as NodeJS.ErrnoException).code === 'ENOENT') {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.status(404).send('File not found');
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === 'Only image uploads are allowed') {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === 'Only Excel spreadsheets are allowed') {
    return res.status(400).json({ error: error.message });
  }

  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  console.error('Unhandled request error:', error);
  ErrorLogModel.create({
    level: 'error',
    message: error.message || 'Unhandled request error',
    stack: error.stack || null,
    route: req.originalUrl || req.path,
    method: req.method,
    userId: null,
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  }).catch((logError) => console.error('Failed to write error log:', logError));
  res.status(500).json({ error: 'Internal server error' });
});

// Start server. If database initialization fails, keep the API online so first-run
// setup can write a backend .env file and guide the operator through restart.
initializeDatabase()
  .then(() => {
    protectExistingSensitiveUserData()
      .then((updatedCount) => {
        if (updatedCount > 0) {
          console.info(`Protected sensitive profile fields for ${updatedCount} existing user record${updatedCount === 1 ? '' : 's'}.`);
        }
      })
      .catch((error) => {
        console.error('Failed to protect existing sensitive profile fields:', error);
      });
    startSecurityCleanupJob();
  })
  .catch((error) => {
    console.error('Failed to initialize database. Starting setup-capable API anyway:', error);
  })
  .finally(() => {
    app.listen(PORT, () => {
    console.log(`Blueline backend running on port ${PORT}`);
    });
  });
