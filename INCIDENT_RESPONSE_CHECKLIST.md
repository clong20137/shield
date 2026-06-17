# BlueLine Command Incident Response Checklist

Use this checklist when BlueLine Command generates a security alert or an agency suspects account misuse, unauthorized access, ransomware activity, or improper data handling.

## 1. Triage

- Record the date, time, reporting person, and alert source.
- Open the Audit Log and filter by the alert action, actor, IP address, and time window.
- Determine whether the activity is expected administrative work, user error, or suspicious behavior.
- Preserve relevant audit exports, screenshots, and server logs before making broad changes.

## 2. Account Compromise

- Disable the affected account or reset the password with forced password change.
- Revoke active sessions for the affected account.
- Confirm MFA status and re-enroll MFA if the authenticator device may be compromised.
- Review recent profile access, message activity, role changes, exports, media actions, and deleted records.
- Check whether other accounts share the same IP address or user agent pattern.

## 3. Privileged Access Change

- Confirm who made the role or permission change and why.
- Compare the changed role against the intended permission set.
- Remove unnecessary elevated permissions.
- Review all administrator and `audit:view` accounts for MFA enrollment.
- Export audit records covering at least 24 hours before and after the change.

## 4. Repeated Failed Sign-Ins or Permission Denials

- Identify source IP address, username/email, browser user agent, and affected route.
- Determine whether the source is internal agency network, VPN, or public internet.
- If malicious or unexplained, block the source at the network/reverse-proxy layer.
- Confirm the targeted account has MFA enabled and no stale sessions.
- Notify agency IT/security leadership if attempts continue.

## 5. Lost or Stolen Device

- Revoke the user's active sessions.
- Reset the user's password if browser/session compromise is possible.
- Confirm the device is removed or marked lost in device inventory.
- Review audit logs for activity after the reported loss time.
- Coordinate with agency mobile-device-management or endpoint tools.

## 6. Ransomware or Server Compromise

- Isolate the application server from the network.
- Stop application services only after preserving logs when possible.
- Preserve database, application, IIS/reverse-proxy, and OS security logs.
- Do not restore from backup until the entry point is understood.
- Rotate database credentials, session secrets, SSO secrets, and data encryption keys if compromise is suspected.
- Restore only from a known-good backup and validate audit continuity.

## 7. Closure

- Document root cause, affected users, affected records, containment steps, and remediation.
- Record whether notifications to agency leadership, CJIS/security officials, or legal counsel are required.
- Add follow-up tasks to reduce recurrence.
- Keep the incident packet with exported audit logs and timeline notes.

