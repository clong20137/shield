# SHIELD - Deployment Guide

## Pre-Deployment Checklist

- [ ] All environment variables are set correctly
- [ ] First-run installer has been completed and is locked
- [ ] Database backups are in place
- [ ] Frontend is built and tested
- [ ] Backend is built and tested
- [ ] All dependencies are up to date
- [ ] Security vulnerabilities are checked

## Environment Setup

### Production Environment Variables (.env)

For a new deployment, SHIELD can create or update the backend `.env` from the `/install` page before the first administrator account exists. After saving `.env` in the installer, restart the backend so the new database and security values are loaded.

After the first administrator account is created, the installer is locked by `SETUP_ENV_LOCKED=true` and browser-based environment editing is no longer available.

```
# Database
DB_HOST=your.production.host
DB_USER=production_user
DB_PASSWORD=strong_password_here
DB_NAME=shield_prod
DB_PORT=3306

# Server
PORT=5000
NODE_ENV=production

# CORS
ALLOWED_ORIGINS=https://yourdomain.com
APP_BASE_URL=https://yourdomain.com/shield
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
TRUST_PROXY=true

# Email / password reset
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=passwordresetshield@outlook.com
SMTP_PASSWORD=your_outlook_password_or_app_password
SMTP_FROM=passwordresetshield@outlook.com
SMTP_SECURE=false
SMTP_STARTTLS=true
SMTP_HELO=shield.local
SETUP_ENV_LOCKED=true
```

## Backend Deployment

### Using PM2 on Windows/IIS

PM2 keeps the Express API running in the background, restarts it after crashes, and gives you a visual terminal monitor instead of leaving the API open in a regular terminal window.

1. Install PM2 and the Windows startup helper globally on the server:
```powershell
npm install -g pm2
npm install -g pm2-windows-startup
```

2. From the SHIELD project root, install dependencies and build the backend:
```powershell
cd C:\inetpub\wwwroot\shield
cd backend
npm install
npm run build
cd ..
```

3. Start the API using the checked-in PM2 config:
```powershell
pm2 start ecosystem.config.cjs
```

4. Open the visual PM2 monitor:
```powershell
pm2 monit
```

5. Save the process list so PM2 remembers SHIELD:
```powershell
pm2 save
```

6. Install PM2 startup for Windows so the saved process list is restored after reboot:
```powershell
pm2-startup install
pm2 save
```

After reboot, Windows starts PM2 and PM2 resurrects `shield-api` from the saved process list. If you ever change the PM2 process list, run `pm2 save` again.

Useful PM2 commands:
```powershell
pm2 status
pm2 logs shield-api
pm2 restart shield-api
pm2 stop shield-api
pm2 delete shield-api
```

After pulling new code, rebuild and restart:
```powershell
cd C:\inetpub\wwwroot\shield\backend
npm install
npm run build
cd ..
pm2 restart shield-api
pm2 save
```

### Using Node.js Directly

1. Build the backend:
```bash
cd backend
npm install --production
npm run build
```

2. Start the server:
```bash
npm start
```

### Using Docker (Optional)

Create a `Dockerfile` in the backend directory:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
docker build -t shield-backend .
docker run -p 5000:5000 --env-file .env shield-backend
```

## Frontend Deployment

### Using Static File Server

1. Build the frontend:
```bash
cd frontend
npm install
npm run build
```

2. The `dist` folder contains all static files ready to deploy

3. Serve with:
- Apache/Nginx
- Express static middleware
- CDN
- Vercel, Netlify, etc.

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        root /var/www/shield/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend-server:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Database Deployment

### MySQL Setup on Production

Option A: use the first-run installer. Enter the database host, port, username, password, and database name on `/install`, then use **Test Database**. If the database does not exist, SHIELD will create it when the database user has permission.

Option B: create the database manually:
```bash
mysql -u admin -p < backend/database.sql
```

Create an application user:
```sql
CREATE USER 'shield_user'@'localhost' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON shield.* TO 'shield_user'@'localhost';
FLUSH PRIVILEGES;
```

3. Backup plan:
```bash
# Daily backup
0 2 * * * mysqldump -u admin -p database_password shield > /backups/shield_$(date +\%Y\%m\%d).sql
```

## Security in Production

1. Use HTTPS/TLS
2. Implement authentication and authorization
3. Use strong database passwords
4. Keep dependencies updated
5. Enable CORS only for trusted origins
6. Use environment variables for sensitive data
7. Implement rate limiting
8. Add request validation
9. Use database connection pooling
10. Implement proper error handling (no stack traces in production)

### Cookie Sessions Behind IIS

SHIELD uses an HttpOnly `shield_session` cookie for login. If IIS terminates HTTPS and proxies API requests to Node, set `TRUST_PROXY=true` so Express can recognize forwarded secure requests.

For HTTPS deployments, use:
```env
NODE_ENV=production
APP_BASE_URL=https://yourdomain.com/shield
ALLOWED_ORIGINS=https://yourdomain.com
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
TRUST_PROXY=true
```

For temporary internal HTTP-only testing, browsers will not store a `Secure` cookie. Use:
```env
NODE_ENV=production
APP_BASE_URL=http://yourserver/shield
ALLOWED_ORIGINS=http://yourserver
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
TRUST_PROXY=false
```

After changing cookie, origin, or proxy settings, restart the backend service.

## Monitoring

### Logging Setup

Add logging to backend:
```typescript
console.log('Request:', req.method, req.url);
console.error('Error:', err);
```

### Health Checks

Monitor using the `/health` endpoint:
```bash
curl http://localhost:5000/health
```

## Scaling Considerations

- Use load balancer for multiple backend instances
- Implement caching (Redis)
- Optimize database queries
- Use CDN for static assets
- Monitor database performance
- Implement connection pooling

## Rollback Plan

1. Keep previous version of code
2. Maintain database backups
3. Document deployment steps
4. Test rollback procedure

## Post-Deployment

1. Verify all endpoints are working
2. Check database connectivity
3. Review logs for errors
4. Load test the application
5. Monitor performance metrics

## Support

For deployment issues, check:
- Application logs
- Database logs
- Nginx/Apache error logs
- Network connectivity
- SSL certificates (if using HTTPS)
