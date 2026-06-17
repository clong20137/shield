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

Status: planned

- Add field-level encryption for highly sensitive profile fields such as personal phone, residential address, mailing address, identifiers, and other protected personnel data.
- Store encryption keys outside the database using a vault or cloud KMS.
- Add key rotation procedures and emergency key revocation procedures.
- Encrypt uploaded media storage and backups.
- Replace direct static access to private uploads with permission-checked, expiring media access routes.
- Add malware scanning for uploaded profile images, media-library assets, documents, and imports.

## Phase 3 - Agency Isolation and Access Reviews

Status: planned

- Add an agency or tenant boundary if multiple agencies will use the same deployment.
- Enforce agency scoping in every backend query, not only in the frontend.
- Add supervisor/district scoping options for profiles, calendar records, messages, and reports.
- Add periodic access review reports for administrators.
- Add an admin view for inactive accounts, stale sessions, MFA enrollment, and privileged roles.

## Phase 4 - Monitoring and Incident Response

Status: planned

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
