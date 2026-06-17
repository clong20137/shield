# BlueLine Command Security Hardening Roadmap

BlueLine Command is intended for law-enforcement agency data, including personnel details, operational records, messages, device inventory, reminders, media, and administrative audit information. The security target should be CJIS-aware and mapped to NIST Cybersecurity Framework 2.0 and NIST SP 800-53 controls, while avoiding a formal "CJIS compliant" claim until the deployed environment is reviewed by the appropriate agency or state CJIS authority.

## Phase 1 - Immediate Application Controls

Status: implemented in application, pending deployment verification

- Keep all authentication in HttpOnly session cookies.
- Keep CSRF/origin checks enabled for unsafe API requests.
- Keep Helmet security headers and no-store API caching enabled.
- Require strong passwords and support authenticator app MFA.
- Audit successful sign-ins, failed sign-ins, MFA prompts, lock-screen unlock failures, password resets, MFA changes, role changes, and logout/session revocation.
- Audit backend permission denials and missing-session attempts against protected routes.
- Warn on unsafe production security configuration during backend startup.
- Use strict production environment settings:
  - `NODE_ENV=production`
  - `SESSION_COOKIE_SECURE=true`
  - `SESSION_COOKIE_SAMESITE=lax` or `strict` when deployment allows it
  - `TRUST_PROXY=true` only behind the approved reverse proxy
  - `ALLOWED_ORIGINS` set to the exact app origin
  - `ALLOW_CONSOLE_RESET_LINKS=false`

Deployment verification required:

- Confirm HTTPS is enforced before any production agency use.
- Confirm `ALLOWED_ORIGINS`, `APP_BASE_URL`, and `API_BASE_URL` use exact production HTTPS origins.
- Confirm security audit events appear in the audit log after failed login, denied permission, MFA challenge, and session revocation tests.
- Confirm administrators have MFA enabled before agency rollout.

## Phase 2 - Sensitive Data Protection

Status: in progress

Implemented in this pass:

- Added application-level AES-256-GCM encryption for sensitive profile fields:
  - personal phone number
  - residential address
  - mailing address
  - emergency contact name
  - emergency contact relationship
  - emergency contact phone
- Added keyed blind indexes for personal phone and emergency contact phone lookups.
- Added startup protection for existing plaintext sensitive profile values when `DATA_ENCRYPTION_KEY` is configured.
- Added production warnings for missing data encryption and blind-index keys.
- Moved uploaded media delivery behind authenticated `/api/uploads` and `/uploads` session checks.
- Disabled public long-lived caching for uploaded media responses.

- Expand field-level encryption to additional identifiers only after search/import behavior is redesigned to avoid breaking PE, badge, PeopleSoft, and public-safety ID workflows.
- Store encryption keys outside the database using a vault or cloud KMS.
- Add key rotation procedures and emergency key revocation procedures.
- Encrypt uploaded media storage and backups.
- Add expiring media access links for high-sensitivity file sharing if agencies need link-based access outside the authenticated app.
- Add malware scanning for uploaded profile images, media-library assets, documents, and imports.

## Phase 3 - Agency Isolation and Access Reviews

Status: in progress

Implemented in this pass:

- Added an admin access-review report for privileged access, MFA gaps, stale accounts, hidden accounts, and active sessions.
- Added role permission distribution so administrators can review which roles carry sensitive permissions.
- Added an Admin Console access-review panel in Permissions for quick security review.

- Add an agency or tenant boundary if multiple agencies will use the same deployment.
- Enforce agency scoping in every backend query, not only in the frontend.
- Add supervisor/district scoping options for profiles, calendar records, messages, and reports.
- Add periodic access review reports for administrators.
- Expand the access-review view into scheduled/periodic reports with export and acknowledgement workflow.

## Phase 4 - Monitoring and Incident Response

Status: in progress

Implemented in this pass:

- Added security monitoring on new audit log entries.
- Added admin security notifications for repeated failed sign-ins, repeated unlock failures, repeated permission denials, role changes, MFA disablement, administrator password resets, user deletion, and user imports.
- Added `INCIDENT_RESPONSE_CHECKLIST.md` for account compromise, privilege changes, failed access attempts, lost devices, ransomware/server compromise, and incident closure.

- Add security alerts for repeated failed login attempts, permission denials, mass exports, mass media access, role changes, and disabled MFA.
- Add audit-log export with date range, actor, action, IP address, and entity filters.
- Add tamper-evident audit retention using append-only storage or signed log batches.
- Create an incident response checklist for account compromise, lost device, malicious insider, and ransomware scenarios.
- Send critical security events to a SIEM or central log collector.

## Phase 5 - Infrastructure and Deployment

Status: planned

- Force HTTPS at the reverse proxy or IIS layer.
- Use modern TLS configuration and disable legacy protocols.
- Restrict database access to the application host or private network.
- Use least-privilege database accounts.
- Encrypt database volumes and backup storage.
- Test backup restoration on a schedule.
- Apply OS, Node.js, database, and dependency patching procedures.
- Run vulnerability scans and penetration testing before agency rollout.

## Phase 6 - Compliance Evidence

Status: planned

- Maintain a security control matrix mapped to CJIS policy areas, NIST CSF 2.0, and NIST SP 800-53 families.
- Document authentication, authorization, encryption, logging, backup, incident response, and personnel access procedures.
- Keep deployment diagrams and data-flow diagrams current.
- Track risk acceptance decisions with an owner and review date.
- Prepare an agency-facing security packet that explains what is encrypted, where data is stored, who can access it, how logs are retained, and how incidents are handled.
