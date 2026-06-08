# Development Guide

## Quick Start

### 1. Terminal 1 - Backend Server
```bash
cd backend
npm install
npm run dev
# Server runs on http://localhost:5000
```

### 2. Terminal 2 - Frontend Server
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:3000
```

## MySQL Setup

For normal local setup, start the backend and frontend, then open the app. If no administrator account exists, SHIELD redirects to `/install`. The installer can write `backend/.env`, test the database connection, create the database when your MySQL user has permission, and guide you through the first admin account.

After saving `.env` in the installer, restart the backend and refresh `/install`.

### Using Command Line
```bash
# Connect to MySQL
mysql -u root -p

# Run the database setup
source database.sql;

# Verify the database was created
SHOW DATABASES;
USE shield;
SHOW TABLES;
```

### Using MySQL GUI Tools
Import the `backend/database.sql` file into your MySQL client.

## Key Configuration Files

### Backend
- `.env` - Environment variables (copy from `.env.example`)
- `src/config/database.ts` - Database connection pool
- `src/index.ts` - Express server setup

### Frontend
- `vite.config.ts` - Vite configuration with API proxy
- `src/services/api.ts` - API service and HTTP client setup

## Common Tasks

### Run an API Stress Test
The stress runner lives in the backend and uses the configured API, so point it at local, staging, or a test deployment. By default it is read-only.

```powershell
cd backend
$env:SHIELD_STRESS_EMAIL="admin@example.com"
$env:SHIELD_STRESS_PASSWORD="your-password"
npm run stress -- --url http://localhost:5000/api --users 5 --duration 60 --ramp 15 --think 1000
```

Use `--write` only against test data. It adds lightweight Trooper Daily calendar creates to the request mix.

```powershell
npm run stress -- --url http://localhost:5000/api --users 10 --duration 60 --ramp 20 --think 1000 --rps 20 --write
```

Useful options:
- `--users`: concurrent simulated users.
- `--duration`: seconds to run, not milliseconds.
- `--ramp`: seconds to gradually start all users.
- `--think`: milliseconds each user waits between actions. Use `0` only for an aggressive load test.
- `--rps`: optional global request-per-second cap.
- `--timeout`: request timeout in milliseconds.

### API Rate Limiting
The backend applies a global API limiter to `/api/*` routes. Upload assets under `/api/uploads/*` are served before this limiter.

Defaults:
- `API_RATE_LIMIT_WINDOW_MS=60000`
- `API_RATE_LIMIT_MAX=300`
- `API_REQUEST_TIMEOUT_MS=30000`

For a tighter local test:

```powershell
$env:API_RATE_LIMIT_WINDOW_MS="60000"
$env:API_RATE_LIMIT_MAX="120"
$env:API_REQUEST_TIMEOUT_MS="30000"
npm run dev
```

### Add a New User Field
1. Update database schema in `backend/database.sql`
2. Update `User` interface in `backend/src/models/User.ts`
3. Update `User` interface in `frontend/src/services/api.ts`
4. Update components that display user data

### Create a New API Endpoint
1. Create a method in `backend/src/models/User.ts` or create new model
2. Create a handler in `backend/src/controllers/userController.ts`
3. Add route in `backend/src/routes/userRoutes.ts`
4. Add service method in `frontend/src/services/api.ts`
5. Use in frontend components via `userService`

### Add a New Page
1. Create component in `frontend/src/pages/`
2. Create SCSS file in `frontend/src/styles/pages/`
3. Add route to `frontend/src/App.tsx`
4. Add navigation link in navbar

## Debugging

### Backend
```bash
# Run with verbose logging
DEBUG=* npm run dev

# Check TypeScript errors
npm run type-check
```

### Frontend
- Open DevTools (F12)
- Check Network tab for API calls
- Check Console for errors
- React DevTools browser extension recommended

## Building for Production

### Backend
```bash
npm run build
# Output in ./dist
npm start
```

### Frontend
```bash
npm run build
# Output in ./dist
npm run preview
```

## Database Maintenance

### Backup Database
```bash
mysqldump -u root -p shield > backup.sql
```

### Restore Database
```bash
mysql -u root -p shield < backup.sql
```

### Add Sample Data
The `database.sql` includes sample data. To add more:
```sql
INSERT INTO users (...) VALUES (...);
```

## Performance Tips

- Add database indexes for frequently queried fields
- Implement pagination for large result sets
- Cache frequently accessed data
- Use query limits to prevent large result sets
- Monitor slow queries

## Troubleshooting

### "Cannot find module" errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

### Database connection errors
- Verify MySQL is running
- Check credentials in `.env`
- Ensure database exists: `SHOW DATABASES;`

### Port already in use
- Backend: Change PORT in `.env`
- Frontend: Change port in `vite.config.ts` or use `npm run dev -- --port 3001`

### CORS errors
- Frontend is using proxy in `vite.config.ts`
- Backend allows all origins only when `ALLOWED_ORIGINS` is blank
- For stricter local testing, set `ALLOWED_ORIGINS=http://localhost:3000`

### Password reset emails
- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` to send real reset emails
- Without SMTP settings, reset links are printed in the backend console for local development
