# SHIELD Project Brief

## Executive Summary

SHIELD is an internal agency workspace built to centralize personnel information, operational tools, communications, reporting, alerts, and administrative oversight in one secure web application.

The system was designed for daily use by troopers, supervisors, HR, and administrators. It reduces the need to search across separate spreadsheets, email chains, shared drives, and disconnected tools. SHIELD gives personnel a single place to find people, manage daily reporting, communicate, track devices, review activity, and respond to important updates.

The application is built as a modern full-stack web system using React, TypeScript, Node.js, Express, and MySQL. These tools were chosen because they are widely supported, reliable, maintainable, and appropriate for an internal application that needs strong security, responsive performance, and room to grow.

## Why SHIELD Was Built

SHIELD was built to solve several internal workflow problems:

- Personnel data needs to be searchable, consistent, and easier to maintain.
- Supervisors and HR need better visibility into users, devices, reports, reminders, and system activity.
- Troopers need fast access to common tools without jumping between systems.
- Important updates and urgent alerts need to reach personnel quickly and reliably.
- Administrative actions need to be permission-controlled and auditable.
- The application needs to work well on desktop and mobile devices.

SHIELD is intended to be an operational workspace, not just a database viewer. It combines people search, reporting, messaging, alerts, dashboard widgets, device management, calendar tools, and audit visibility into a single internal system.

## Core Capabilities

### Personnel Search and Profiles

SHIELD includes a searchable personnel directory with profile details such as:

- Name, PE number, PeopleSoft ID, email, phone numbers, and district.
- Rank, assignment, employment type, status, supervisor, and specialty details.
- Profile photos and visual identity cues.
- Copy-to-clipboard actions for common fields.
- Draggable and resizable profile windows.
- Pinned profiles for fast dashboard access.

Search has been tuned to prioritize people by name and handle partial/flexible matching, such as finding "Christopher Rowley" when searching "Chris Rowley."

### Dashboard Workspace

The dashboard serves as the main workspace and includes:

- Pinned personnel.
- News and updates carousel.
- Quick notes.
- My Day widget.
- Calendar and reminders widgets.
- Quick launch dock for common apps.
- Floating windows for messages, calendar, calculator, profiles, and admin tools.
- Mobile-friendly navigation and phone-specific floating app behavior.

The goal is to make common daily work fast and familiar.

### Messages

SHIELD includes internal instant messaging designed to feel more like a chat app than email:

- Conversation threads.
- Unread counts.
- Typing indicators.
- Message reactions.
- Pinned conversations.
- Search within messages.
- Profile images in conversations.
- Realtime message updates.
- Configurable message sounds, including an MSN-style option.

Messages use realtime server events so users see updates without refreshing the page.

### Urgent Alerts

The urgent alert system allows authorized users to send high-priority alerts to:

- Everyone.
- A specific district.
- Selected personnel.

Alerts are persistent in the database, so users who are logged out will see them when they next sign in. Logged-in users receive the alert immediately in a high-priority modal with sound. Alerts support:

- Severity levels: Advisory, Important, Urgent, Critical.
- Optional expiration.
- Required acknowledgement.
- Acknowledgement tracking.
- Audit logging of who sent the alert and to whom.

This is useful for critical operational notices, weather impacts, officer-safety information, staffing emergencies, or system-wide instructions.

### News and Updates

SHIELD supports dashboard news/update posts with:

- Rich text editing.
- Formatting such as bold, italics, underline, headers, lists, and alignment.
- Images and thumbnails.
- Permissions for creating, editing, and deleting posts.
- Comments, reactions, and mentions.

This gives leadership and administrators a controlled way to distribute internal updates.

### Calendar, Reminders, and Daily Reporting

SHIELD includes a calendar workflow with:

- Draggable/resizable calendar window.
- Trooper Daily style entries.
- Reminder creation through the calendar.
- Reminder notifications.
- Calendar sidebar widget.
- Daily shortcuts and autofill helpers.
- Review status for submitted daily information.

The calendar supports both personal productivity and operational reporting.

### Device Management

Device management tracks assigned and available equipment such as:

- Cell phones.
- Radios.
- Computers.
- MiFi devices.
- Cradlepoints.

It supports device details, assignments, status, condition, history, maintenance fields, and device-specific forms. The interface has been refined so unnecessary fields are hidden when a selected device type does not need them.

### Reports and Audit Tools

SHIELD includes reporting and administrative visibility:

- Personnel reports by rank, district, employment type, and other filters.
- Trooper Daily report review.
- CPAR/performance evaluation workflows.
- Audit log with filtering, readable actions, copy-to-clipboard, and export options.
- Error log with live updates.
- Bug tracker for internal issue reporting.

Audit logging is important because the system handles internal personnel data and administrative actions.

### Admin Console and Permissions

The Admin Console centralizes administrative tools:

- General settings.
- Role and permission management.
- Account creation.
- User import.
- Bug tracker.
- Audit log.
- Error log.
- Urgent alerts.
- Achievements/mileage settings.

Access is role- and permission-based. Users do not need to be full administrators for every function; specific permissions such as `alerts:send`, `users:create`, `audit:view`, or `devices:manage` can be granted as needed.

## Security Posture

SHIELD has been built with internal application security in mind. Important security controls include:

### Authentication and Sessions

- Secure login with password hashing.
- MFA support through authenticator app codes.
- Forced password change for newly created accounts.
- Session storage using HttpOnly cookies instead of browser-accessible local storage.
- Session revocation support.
- Automatic session cleanup.
- Microsoft SSO support when configured.

Moving sessions into HttpOnly cookies helps protect against token theft from browser-side scripts.

### Authorization

- Role-based access control.
- Permission-level controls for sensitive areas.
- Separate permissions for users, devices, reports, calendar, messages, dashboard posts, audit, roles, bug management, and urgent alerts.
- Admin-only and permission-only workflows are checked on the backend, not just hidden in the interface.

### CSRF and Origin Protection

- The backend checks request origins for unsafe operations.
- CORS is restricted to trusted origins.
- Local development origin handling is allowed only outside production.
- Credentialed requests are supported safely with origin controls.

### HTTP Security Headers

SHIELD uses Helmet to apply modern security headers, including:

- Content Security Policy.
- Referrer policy.
- Cross-origin resource policy.
- Protection against MIME sniffing.
- Frame ancestor restrictions to prevent clickjacking.

The CSP limits where scripts, images, styles, and network connections can load from.

### Rate Limiting

The backend includes rate limits by action type, including:

- Login.
- Registration.
- Password reset.
- Password change.
- MFA actions.
- Role management.
- User search.
- User import.
- Profile picture updates.
- Messaging actions.
- Urgent alert sending.

This helps reduce abuse, brute force attempts, accidental overload, and noisy automation.

### Audit and Error Visibility

SHIELD logs important administrative and security-related activity, including:

- Logins and failed logins.
- Password resets and password changes.
- Role changes.
- Invite creation.
- Device changes.
- Dashboard/news changes.
- Urgent alert sending.
- User-related actions.

Error logging provides administrators visibility into backend issues without relying only on terminal output.

### Upload Controls

Image uploads are restricted by:

- File type.
- MIME type.
- File size.
- Extension.
- Basic image signature validation.

Future hardening could include server-side image re-encoding and metadata stripping.

## Performance and Reliability

SHIELD uses several design choices to keep the application responsive:

- React lazy loading for larger pages.
- Vite production builds for optimized frontend assets.
- Paginated API responses for larger lists.
- Database indexes on common search/filter fields.
- Server-Sent Events for realtime updates without constant polling.
- Request timeout middleware to prevent long-running backend requests.
- Rate limiting to protect backend resources.
- Focused API endpoints organized by domain.

Realtime features such as messages, notifications, urgent alerts, audit updates, and dashboard updates use server event streams. This is lighter and simpler than repeatedly refreshing the page or polling every few seconds.

## Technology and Library Choices

### React

React was chosen for the frontend because it is widely used, maintainable, and well-suited for interactive applications with modals, floating windows, dashboard widgets, realtime updates, and complex forms.

### TypeScript

TypeScript is used on both frontend and backend. It improves maintainability by catching many errors before runtime and documenting the shape of data moving between the browser, server, and database.

### Vite

Vite is used for frontend development and builds. It provides fast local development, efficient production builds, and a modern development experience.

### Tailwind CSS

Tailwind CSS is used for rapid, consistent interface styling. It helps keep layouts responsive and allows the application to maintain a unified design across dashboard widgets, modals, admin tools, and mobile views.

### Lucide React

Lucide provides consistent, lightweight icons throughout the interface. It improves usability by making buttons and tools visually recognizable.

### Axios

Axios is used for API calls from the frontend. It gives a consistent HTTP client layer and supports credentialed requests for secure cookie-based sessions.

### Node.js and Express

Node.js and Express are used for the backend API. Express is lightweight, flexible, and appropriate for building clear route/controller/model layers for an internal application.

### MySQL

MySQL was chosen as the relational database because SHIELD data is highly structured:

- Users.
- Roles.
- Sessions.
- Reports.
- Devices.
- Calendar entries.
- Messages.
- Audit logs.
- Alerts.

Relational tables and indexes are a good fit for this kind of operational data.

### Helmet

Helmet adds important HTTP security headers and Content Security Policy protections. It reduces common web risks without requiring large architectural changes.

### Multer

Multer handles file uploads such as profile pictures, dashboard/news images, and spreadsheet imports. It gives the backend control over file size, type, and storage rules.

### XLSX

XLSX supports spreadsheet import/export workflows. This matters because agency data often starts in Excel files, and administrative reporting frequently needs Excel-compatible output.

### QRCode

QRCode supports MFA setup by generating scannable authenticator app codes.

### Emoji Picker

The emoji picker supports message reactions and a more familiar instant messaging experience.

## Why These Tools Are Appropriate for an Internal Agency Application

The selected tools balance security, maintainability, and speed of development:

- They are widely supported and documented.
- They work well on standard Windows/server environments.
- They do not require a highly specialized runtime.
- They support responsive web use across desktop and mobile.
- They allow incremental growth as new agency workflows are added.
- They support strong backend controls around data, permissions, audit logs, and security.

The architecture is also straightforward: a React frontend communicates with an Express API backed by MySQL. This keeps the system understandable for future developers and easier to support over time.

## Current Operational Value

SHIELD currently provides value in several areas:

- Faster personnel lookup.
- Better user/profile data visibility.
- Centralized daily workspace.
- Internal messaging.
- Urgent alerting with acknowledgement.
- Dashboard announcements.
- Device tracking.
- Calendar/reminder workflows.
- Trooper Daily/report review support.
- Role and permission control.
- Audit and error visibility.
- Mobile-friendly access.

Together, these features make SHIELD a practical internal operations platform rather than a single-purpose directory.

## Recommended Future Enhancements

High-value future enhancements include:

- Document center for policies, SOPs, forms, and training material.
- Required policy acknowledgements with audit trails.
- Training and certification tracker.
- HR onboarding/offboarding checklist.
- Leave/time-off request workflow.
- Active session/device visibility for users.
- Server-side image re-encoding and metadata stripping.
- Redis-backed rate limiting for multi-server deployments.
- Expanded acknowledgement reporting for urgent alerts and policy updates.
- Backup and disaster recovery dashboard.

## Summary

SHIELD is a secure internal agency workspace built to improve access to personnel data, streamline daily tools, support supervisors and HR, and provide administrators with visibility and control.

The system uses a practical, maintainable technology stack and includes important security controls such as MFA, permission-based access, HttpOnly sessions, CSRF/origin checks, rate limiting, Helmet/CSP security headers, audit logs, and persistent urgent alerts.

The project is designed to grow with the agency's needs while keeping the core mission simple: make important internal information easier to find, easier to act on, and safer to manage.
