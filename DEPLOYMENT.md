# SHIELD - Deployment Guide

## Pre-Deployment Checklist

- [ ] All environment variables are set correctly
- [ ] Database backups are in place
- [ ] Frontend is built and tested
- [ ] Backend is built and tested
- [ ] All dependencies are up to date
- [ ] Security vulnerabilities are checked

## Environment Setup

### Production Environment Variables (.env)

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

# CORS (if applicable)
CORS_ORIGIN=https://yourdomain.com
```

## Backend Deployment

### Using Node.js

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

1. Create database:
```bash
mysql -u admin -p < backend/database.sql
```

2. Create application user:
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
