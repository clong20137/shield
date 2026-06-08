# SHIELD - Agency User Search & Reporting System

A comprehensive internal application for searching users throughout an agency and generating detailed reports.

## Features

- **User Search**: Advanced search with multiple filtering options
- **User Management**: Create, read, update, and delete user records
- **Reporting**: Generate detailed reports by rank, district, employment type, and more
- **Dashboard**: System overview with key statistics
- **Responsive Design**: Mobile-friendly interface with SASS styling

## Tech Stack

### Backend
- **Express.js** - Node.js web framework
- **MySQL** - Relational database
- **TypeScript** - Type-safe JavaScript
- **Node.js** - JavaScript runtime

### Frontend
- **React 18** - UI library
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Axios** - HTTP client

## Project Structure

```text
SHIELD/
|-- backend/
|   |-- src/
|   |   |-- config/
|   |   |   `-- database.ts          # Database configuration
|   |   |-- models/
|   |   |   `-- User.ts              # User model
|   |   |-- controllers/
|   |   |   |-- userController.ts    # User endpoints
|   |   |   `-- reportController.ts  # Report endpoints
|   |   |-- routes/
|   |   |   |-- userRoutes.ts        # User routes
|   |   |   `-- reportRoutes.ts      # Report routes
|   |   `-- index.ts                 # Server entry point
|   |-- package.json
|   |-- tsconfig.json
|   |-- .env.example                 # Environment variables template
|   `-- database.sql                 # Database schema
|
`-- frontend/
    |-- src/
    |   |-- components/
    |   |   |-- SearchBar.tsx        # Search component
    |   |   |-- UserTable.tsx        # User table display
    |   |   |-- UserDetail.tsx       # User detail view
    |   |   `-- StatisticsCard.tsx   # Statistics display
    |   |-- pages/
    |   |   |-- DashboardPage.tsx    # Dashboard page
    |   |   |-- SearchPage.tsx       # Search page
    |   |   `-- ReportsPage.tsx      # Reports page
    |   |-- services/
    |   |   `-- api.ts               # API service
    |   |-- styles/
    |   |   |-- App.scss
    |   |   |-- index.scss
    |   |   |-- variables.scss
    |   |   |-- components/          # Component styles
    |   |   `-- pages/               # Page styles
    |   |-- App.tsx                  # Main App component
    |   |-- main.tsx                 # React entry point
    |   `-- vite-env.d.ts            # Vite TypeScript env types
    |-- index.html
    |-- package.json
    |-- tsconfig.json
    `-- vite.config.ts
```

## Installation

### Prerequisites
- Node.js 16+
- MySQL 5.7+
- npm or yarn

### First-Run Installer

SHIELD includes a browser-based first-run installer. On a fresh installation, the app redirects to `/install` until the first administrator account is created.

The installer can:
- Write the backend `.env` file.
- Test the MySQL connection.
- Create the configured database if it does not already exist and the database user has permission.
- Configure application/site names, URLs, security settings, registration mode, enabled feature areas, roles, and the first administrator account.

After installation completes, the installer is locked and environment editing is no longer available through the browser.

### Backend Setup

1. Navigate to the backend folder:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start with either an empty backend `.env` or create one manually if you prefer:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=shield
DB_PORT=3306
PORT=5000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASSWORD=your_smtp_password
SMTP_FROM=shield@yourdomain.com
SMTP_SECURE=false
```

`ALLOWED_ORIGINS` is a comma-separated list of trusted frontend origins. Leave it blank only for local testing.
Password reset emails use the SMTP settings above. If SMTP is not configured, reset links are printed to the backend console for local development.

4. Build TypeScript:
```bash
npm run build
```

5. Start the server:
```bash
npm run dev  # For development
npm start    # For production
```

The backend will run on `http://localhost:5000`.

If the database is not connected yet, the backend still starts enough API for the installer to write `.env`. After saving database settings in the installer, restart the backend and refresh `/install`.

### Frontend Setup

1. Navigate to the frontend folder:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`.

Open the frontend URL. A fresh installation redirects to `/install`.

To override the API URL in Vite, set `VITE_API_URL`, for example:

```env
VITE_API_URL=http://localhost:5000/api
```

## API Endpoints

### Users
- `GET /api/users/search?q=query` - Search users; also supports `rank`, `district`, `active`, and `employmentType` filters
- `GET /api/users/all?page=1&limit=50` - Get all users, paginated
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Reports
- `GET /api/reports/by-rank` - Users grouped by rank
- `GET /api/reports/by-district` - Users grouped by district
- `GET /api/reports/by-employment-type` - Users grouped by employment type
- `GET /api/reports/statistics` - System statistics
- `GET /api/reports/detailed` - Detailed report with filters

## User Fields

The application tracks the following information for each user:

- **Name**: First name, last name
- **Identification**: PE number, badge number, car number, public safety ID
- **Status**: Active or inactive
- **Employment**: Rank, district, assigned to, employment type, type details, status
- **Management**: Supervisor, specialty certifications
- **Demographics**: Race, sex

## Database Schema

### users table
| Column | Type | Details |
|--------|------|---------|
| id | VARCHAR(36) | Primary Key (UUID) |
| firstName | VARCHAR(100) | Not Null |
| lastName | VARCHAR(100) | Not Null |
| peNumber | VARCHAR(50) | Unique |
| carNumber | VARCHAR(50) | |
| badgeNumber | VARCHAR(50) | Unique |
| assignedTo | VARCHAR(100) | |
| district | VARCHAR(100) | Indexed |
| rank | VARCHAR(100) | Indexed |
| isActive | BOOLEAN | Default: 1, Indexed |
| employmentType | VARCHAR(100) | Indexed |
| typeDetails | VARCHAR(255) | |
| status | VARCHAR(100) | |
| supervisor | VARCHAR(100) | |
| specialtyCertifications | TEXT | |
| publicSafetyId | VARCHAR(50) | Unique |
| race | VARCHAR(50) | |
| sex | VARCHAR(10) | |
| createdAt | TIMESTAMP | Auto |
| updatedAt | TIMESTAMP | Auto |

## Development

### Building for Production

Backend:
```bash
cd backend
npm run build
npm start
```

Frontend:
```bash
cd frontend
npm run build
npm run preview
```

### Type Checking

Backend:
```bash
cd backend
npm run type-check
```

Frontend:
```bash
cd frontend
npm run type-check
```

## Styling

The application uses Tailwind CSS for efficient and maintainable styling with the following color scheme:

- **Primary**: `#1a365d` (Dark Blue)
- **Secondary**: `#2d5a8c` (Medium Blue)
- **Accent**: `#e74c3c` (Red)
- **Success**: `#27ae60` (Green)
- **Danger**: `#c0392b` (Dark Red)
- **Light Background**: `#f5f7fa`

Customize colors in `frontend/tailwind.config.js`.

## Features Overview

### Dashboard
- System statistics overview
- Recent users display
- Quick access to key metrics

### Search
- Full-text search across user names, numbers, and IDs
- Advanced filters by rank, district, active status, and employment type
- View detailed user information
- Edit and delete users

### Reports
- Users breakdown by rank
- Users breakdown by district
- Users breakdown by employment type
- System-wide statistics
- Detailed custom reports with filters

## Security Considerations

- Validate all inputs on both frontend and backend
- Use parameterized queries to prevent SQL injection
- Implement authentication/authorization as needed
- Store sensitive data securely
- Use HTTPS in production

## Future Enhancements

- User authentication and authorization
- Role-based access control (RBAC)
- Advanced reporting with exports (PDF, Excel)
- User activity logging
- Photo uploads and identification
- Integration with external systems
- Email notifications
- Batch user imports

## License

Internal Use Only
