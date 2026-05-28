import { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthInviteModel } from '../models/AuthInvite';
import { AuthPasswordResetModel } from '../models/AuthPasswordReset';
import { AuthSessionModel } from '../models/AuthSession';
import { AuditLogModel } from '../models/AuditLog';
import { SystemSettingModel } from '../models/SystemSetting';
import { getBearerToken, getSessionAccount } from '../middleware/authSession';
import { broadcastAppEvent } from '../services/appEvents';
import { sendEmail } from '../services/emailService';
import { cleanMultiline, cleanString, isOneOf, isStrongPassword, isValidEmail, normalizeEmail } from '../utils/validation';

const DEFAULT_LOGIN_WARNING_MESSAGE = 'This is a Indiana State Police computer application system that is for Official use only. This system is subject to monitoring. Therefore, no expectation of privacy is to be assumed. Individuals found performing unauthorized activities may be subject to disciplinary action including criminal prosecution.';

function generateTemporaryPassword(length = 14): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const allChars = `${uppercase}${lowercase}${digits}`;

  const randomPart = () => allChars[crypto.randomInt(0, allChars.length)];

  const password = [
    uppercase[crypto.randomInt(0, uppercase.length)],
    lowercase[crypto.randomInt(0, lowercase.length)],
    digits[crypto.randomInt(0, digits.length)],
    ...Array.from({ length: Math.max(0, length - 3) }, randomPart),
  ];

  return password.sort(() => 0.5 - Math.random()).join('');
}

const allowedPermissions = [
  'users:view',
  'users:create',
  'users:edit',
  'users:profile-picture',
  'devices:manage',
  'calendar:manage',
  'reports:trooper-dailies',
  'reports:cpar',
  'audit:view',
  'roles:manage',
  'messages:send',
  'dashboard:manage',
  'dashboard:create',
  'dashboard:edit',
  'dashboard:delete',
  'bugs:manage',
] as const;

function isDuplicateEmailError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

async function canManageRoles(account?: { id: string; role: string } | null): Promise<boolean> {
  if (!account) {
    return false;
  }

  if (account.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('roles:manage');
}

async function canListAccounts(account?: { id: string; role: string } | null): Promise<boolean> {
  if (!account) {
    return false;
  }

  if (account.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('roles:manage') || permissions.includes('devices:manage');
}

async function withPermissions<T extends { id: string; role: string }>(account: T): Promise<T & { permissions: string[] }> {
  const permissions = account.role === 'administrator'
    ? [...allowedPermissions]
    : await AuthAccountModel.getPermissionsForAccount(account.id);

  return { ...account, permissions };
}

const registrationModes = ['public', 'invite-only', 'disabled'] as const;
type RegistrationMode = typeof registrationModes[number];

function normalizeRegistrationMode(value: string): RegistrationMode {
  return registrationModes.includes(value as RegistrationMode) ? value as RegistrationMode : 'public';
}

async function getRegistrationMode(): Promise<RegistrationMode> {
  return normalizeRegistrationMode(await SystemSettingModel.getString('registrationMode', 'public'));
}

async function getAppBaseUrl(req: Request): Promise<string> {
  const configured = (await SystemSettingModel.getString('appBaseUrl', '')) || process.env.APP_BASE_URL || '';
  if (configured) {
    return configured.replace(/\/+$/u, '');
  }

  const origin = req.get('origin');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((allowedOrigin) => allowedOrigin.trim().replace(/\/+$/u, ''))
    .filter(Boolean);

  if (origin && allowedOrigins.includes(origin.replace(/\/+$/u, ''))) {
    return origin.replace(/\/+$/u, '');
  }

  if (allowedOrigins[0]) {
    return allowedOrigins[0];
  }

  return `${req.protocol}://${req.get('host')}`.replace(/\/+$/u, '');
}

function cleanTotpCode(value: unknown): string {
  return cleanString(value, 20).replace(/\s/gu, '');
}

function requestAuditFields(req: Request) {
  return {
    ipAddress: cleanString(req.ip || req.socket.remoteAddress, 45) || null,
    userAgent: cleanString(req.get('user-agent'), 255) || null,
  };
}

function getMicrosoftSsoConfig(req?: Request) {
  const tenantId = process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID || '';
  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID || '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '';
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || (req ? `${req.protocol}://${req.get('host')}/api/auth/microsoft/callback` : '');
  const enabled = Boolean(tenantId && clientId && clientSecret);

  return { tenantId, clientId, clientSecret, redirectUri, enabled };
}

function createSsoState(returnTo: string): string {
  const secret = process.env.SSO_STATE_SECRET || process.env.JWT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || 'shield-sso-state';
  const payload = Buffer.from(JSON.stringify({
    nonce: Math.random().toString(36).slice(2),
    returnTo,
    createdAt: Date.now(),
  })).toString('base64url');
  const signature = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('hex')).toString('base64url');

  return `${payload}.${signature}`;
}

function verifySsoState(value: unknown): { returnTo: string } | null {
  const state = cleanString(value, 1000);
  const [payload, signature] = state.split('.');
  if (!payload || !signature) {
    return null;
  }

  const secret = process.env.SSO_STATE_SECRET || process.env.JWT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || 'shield-sso-state';
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('hex')).toString('base64url');

  if (signature !== expected) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { returnTo?: string; createdAt?: number };
    if (!parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
      return null;
    }

    return { returnTo: typeof parsed.returnTo === 'string' ? parsed.returnTo : '/' };
  } catch {
    return null;
  }
}

function getSafeReturnTo(value: unknown): string {
  const raw = cleanString(value, 500);
  if (!raw || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//')) {
    return '/';
  }

  return raw.startsWith('/') ? raw : '/';
}

function appendQueryParam(path: string, key: string, value: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

async function exchangeMicrosoftCode(code: string, req: Request): Promise<{ id: string; email: string; displayName: string }> {
  const config = getMicrosoftSsoConfig(req);
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      scope: 'openid profile email User.Read',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Microsoft token exchange failed with ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json() as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error('Microsoft token response did not include an access token');
  }

  const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileResponse.ok) {
    throw new Error(`Microsoft profile lookup failed with ${profileResponse.status}`);
  }

  const profile = await profileResponse.json() as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };
  const email = normalizeEmail(profile.mail || profile.userPrincipalName || '');
  const id = cleanString(profile.id, 100);

  if (!id || !email || !isValidEmail(email)) {
    throw new Error('Microsoft profile did not include a usable id and email');
  }

  return { id, email, displayName: cleanString(profile.displayName, 150) || email };
}

function cleanRoleName(value: unknown): string {
  return cleanString(value, 40).toLowerCase().replace(/[^a-z0-9-]/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '');
}

function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value)]
    .filter((permission): permission is typeof allowedPermissions[number] => typeof permission === 'string' && isOneOf(permission, allowedPermissions));
}

function publicInvite(invite: Awaited<ReturnType<typeof AuthInviteModel.create>>, inviteUrl?: string) {
  return {
    id: invite.id,
    email: invite.email,
    invitedBy: invite.invitedBy,
    invitedByName: invite.invitedByName,
    token: invite.token,
    inviteUrl,
    acceptedAt: invite.acceptedAt,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName, displayName, inviteToken } = req.body as {
        email?: string;
        password?: string;
        firstName?: string;
        lastName?: string;
        displayName?: string;
        inviteToken?: string;
      };

      const nameParts = cleanString(displayName, 200).split(/\s+/u).filter(Boolean);
      const submittedFirstName = firstName || nameParts[0] || '';
      const submittedLastName = lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

      if (!email || !password || !submittedFirstName || !submittedLastName) {
        return res.status(400).json({ error: 'Email, password, first name, and last name are required' });
      }

      const cleanEmail = normalizeEmail(email);
      const cleanFirstName = cleanString(submittedFirstName, 100);
      const cleanLastName = cleanString(submittedLastName, 100);

      if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      if (cleanFirstName.length < 1 || cleanLastName.length < 1) {
        return res.status(400).json({ error: 'First and last name are required' });
      }

      if (!isStrongPassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, and a number' });
      }

      const accountCount = await AuthAccountModel.countAccounts();
      const registrationMode = await getRegistrationMode();
      let inviteId: string | null = null;

      if (accountCount > 0 && registrationMode === 'disabled') {
        return res.status(403).json({ error: 'Public registration is disabled' });
      }

      if (accountCount > 0 && registrationMode === 'invite-only') {
        if (!inviteToken) {
          return res.status(403).json({ error: 'An invitation link is required to register' });
        }

        const invite = await AuthInviteModel.getValidInvite(inviteToken);
        if (!invite || invite.email.toLowerCase() !== cleanEmail) {
          return res.status(403).json({ error: 'Invitation link is invalid or expired' });
        }

        inviteId = invite.id;
      }

      const account = await AuthAccountModel.createAccount(cleanEmail, password, cleanFirstName, cleanLastName);
      if (inviteId) {
        await AuthInviteModel.markAccepted(inviteId);
      }
      const token = await AuthSessionModel.createSession(account.id);
      broadcastAppEvent({ type: 'user-updated', entityId: account.id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: account.id });
      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.register',
        entityType: 'user',
        entityId: account.id,
        details: JSON.stringify({ email: account.email, role: account.role, inviteAccepted: Boolean(inviteId) }),
        ...requestAuditFields(req),
      });
      res.status(201).json({ account: await withPermissions(account), token });
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: 'An account already exists for that email' });
      }

      console.error('Register error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password, twoFactorCode } = req.body as {
        email?: string;
        password?: string;
        twoFactorCode?: string;
      };

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (!isValidEmail(normalizeEmail(email))) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      const maintenanceMode = await SystemSettingModel.getString('maintenanceMode', 'false') === 'true';
      const result = await AuthAccountModel.verifyLogin(
        normalizeEmail(email),
        password,
        cleanTotpCode(twoFactorCode),
        { maintenanceMode },
      );

      if (result.failureReason === 'inactive') {
        await AuditLogModel.create({
          actorId: result.account?.id || null,
          actorName: result.account?.displayName || cleanString(email, 255),
          action: 'auth.login_failed',
          entityType: 'session',
          entityId: result.account?.id || null,
          details: JSON.stringify({ email: normalizeEmail(email), reason: 'inactive' }),
          ...requestAuditFields(req),
        });
        return res.status(403).json({ error: 'This account is inactive. Contact an administrator to restore access.' });
      }

      if (result.failureReason === 'maintenance') {
        await AuditLogModel.create({
          actorId: result.account?.id || null,
          actorName: result.account?.displayName || cleanString(email, 255),
          action: 'auth.login_failed',
          entityType: 'session',
          entityId: result.account?.id || null,
          details: JSON.stringify({ email: normalizeEmail(email), reason: 'maintenance' }),
          ...requestAuditFields(req),
        });
        return res.status(503).json({ error: 'SHIELD is in maintenance mode. Only administrators can sign in right now.' });
      }

      if (result.requiresTwoFactor) {
        return res.status(202).json({ requiresTwoFactor: true });
      }

      if (!result.account) {
        await AuditLogModel.create({
          actorId: null,
          actorName: normalizeEmail(email),
          action: 'auth.login_failed',
          entityType: 'session',
          entityId: null,
          details: JSON.stringify({ email: normalizeEmail(email), reason: 'invalid_credentials' }),
          ...requestAuditFields(req),
        });
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = await AuthSessionModel.createSession(result.account.id);
      await AuditLogModel.create({
        actorId: result.account.id,
        actorName: result.account.displayName || result.account.email,
        action: 'auth.login',
        entityType: 'session',
        entityId: result.account.id,
        details: JSON.stringify({ email: result.account.email, twoFactor: Boolean(result.account.twoFactorEnabled) }),
        ...requestAuditFields(req),
      });
      res.json({ account: await withPermissions(result.account), token });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to sign in' });
    }
  }

  static async getMicrosoftSsoStatus(req: Request, res: Response) {
    try {
      res.json({ enabled: getMicrosoftSsoConfig(req).enabled });
    } catch (error) {
      console.error('Microsoft SSO status error:', error);
      res.status(500).json({ error: 'Failed to load Microsoft SSO status' });
    }
  }

  static async startMicrosoftSso(req: Request, res: Response) {
    try {
      const config = getMicrosoftSsoConfig(req);
      if (!config.enabled) {
        return res.status(503).json({ error: 'Microsoft SSO is not configured' });
      }

      const returnTo = getSafeReturnTo(req.query.returnTo);
      const state = createSsoState(returnTo);
      const authorizationUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`);
      authorizationUrl.searchParams.set('client_id', config.clientId);
      authorizationUrl.searchParams.set('response_type', 'code');
      authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
      authorizationUrl.searchParams.set('response_mode', 'query');
      authorizationUrl.searchParams.set('scope', 'openid profile email User.Read');
      authorizationUrl.searchParams.set('state', state);
      authorizationUrl.searchParams.set('prompt', 'select_account');

      return res.redirect(authorizationUrl.toString());
    } catch (error) {
      console.error('Microsoft SSO start error:', error);
      res.status(500).json({ error: 'Failed to start Microsoft SSO' });
    }
  }

  static async completeMicrosoftSso(req: Request, res: Response) {
    const appBaseUrl = await getAppBaseUrl(req);
    const verifiedState = verifySsoState(req.query.state);
    const returnTo = getSafeReturnTo(verifiedState?.returnTo);
    const redirectWithError = (message: string) => res.redirect(`${appBaseUrl}/?ssoError=${encodeURIComponent(message)}`);

    try {
      if (!verifiedState) {
        return redirectWithError('Microsoft sign in expired. Try again.');
      }

      const code = cleanString(req.query.code, 2000);
      if (!code) {
        return redirectWithError('Microsoft sign in was cancelled or did not return a code.');
      }

      const maintenanceMode = await SystemSettingModel.getString('maintenanceMode', 'false') === 'true';
      const profile = await exchangeMicrosoftCode(code, req);
      const account = await AuthAccountModel.findOrLinkMicrosoftAccount({ id: profile.id, email: profile.email });

      if (!account) {
        await AuditLogModel.create({
          actorId: null,
          actorName: profile.email,
          action: 'auth.sso_failed',
          entityType: 'session',
          entityId: null,
          details: JSON.stringify({ provider: 'microsoft', email: profile.email, reason: 'no_matching_user' }),
          ...requestAuditFields(req),
        });
        return redirectWithError('No active SHIELD user is linked to that Microsoft account.');
      }

      if (!account.isActive) {
        return redirectWithError('This SHIELD account is inactive. Contact an administrator.');
      }

      if (maintenanceMode && account.role !== 'administrator') {
        return redirectWithError('SHIELD is in maintenance mode. Only administrators can sign in right now.');
      }

      const token = await AuthSessionModel.createSession(account.id);
      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.sso_login',
        entityType: 'session',
        entityId: account.id,
        details: JSON.stringify({ provider: 'microsoft', email: account.email, microsoftUserId: profile.id }),
        ...requestAuditFields(req),
      });

      return res.redirect(`${appBaseUrl}${appendQueryParam(returnTo || '/', 'ssoToken', token)}`);
    } catch (error) {
      console.error('Microsoft SSO callback error:', error);
      return redirectWithError('Microsoft sign in failed. Use local login or contact an administrator.');
    }
  }

  static async requestPasswordReset(req: Request, res: Response) {
    try {
      const { email } = req.body as { email?: string };
      const cleanEmail = normalizeEmail(email);

      if (!cleanEmail || !isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      const account = await AuthAccountModel.getAccountByEmail(cleanEmail);
      if (account) {
        const reset = await AuthPasswordResetModel.create(account.id, account.email);
        const appBaseUrl = await getAppBaseUrl(req);
        const resetUrl = `${appBaseUrl}/?reset=${encodeURIComponent(reset.token)}`;
        const didSend = await sendEmail({
          to: account.email,
          subject: 'Reset your SHIELD password',
          text: [
            `Hello ${account.displayName || account.email},`,
            '',
            'Use the secure link below to reset your SHIELD password. This link expires in 1 hour.',
            '',
            resetUrl,
            '',
            'If you did not request this reset, you can ignore this message.',
          ].join('\n'),
        });

        if (!didSend && process.env.ALLOW_CONSOLE_RESET_LINKS === 'true') {
          console.log(`SHIELD password reset for ${account.email}: ${resetUrl}`);
        }

        await AuditLogModel.create({
          actorId: account.id,
          actorName: account.displayName || account.email,
          action: 'auth.password_reset_requested',
          entityType: 'user',
          entityId: account.id,
          details: JSON.stringify({ email: account.email, emailQueued: didSend }),
          ...requestAuditFields(req),
        });
      }

      res.json({ message: 'If that email has a SHIELD login, a reset link has been sent.' });
    } catch (error) {
      console.error('Request password reset error:', error);
      res.status(500).json({ error: 'Failed to request password reset' });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const { token, password } = req.body as { token?: string; password?: string };
      const cleanToken = cleanString(token, 200);

      if (!cleanToken || !password) {
        return res.status(400).json({ error: 'Reset token and new password are required' });
      }

      if (!isStrongPassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, and a number' });
      }

      const reset = await AuthPasswordResetModel.getValidReset(cleanToken);
      if (!reset) {
        return res.status(400).json({ error: 'Password reset link is invalid or expired' });
      }

      const updated = await AuthAccountModel.resetPassword(reset.userId, password);
      if (!updated) {
        return res.status(404).json({ error: 'Account not found' });
      }

      await AuthPasswordResetModel.markUsed(reset.id);
      await AuthSessionModel.revokeAllSessions(reset.userId);
      broadcastAppEvent({ type: 'user-updated', entityId: reset.userId });
      await AuditLogModel.create({
        actorId: reset.userId,
        actorName: reset.email,
        action: 'auth.password_reset_completed',
        entityType: 'user',
        entityId: reset.userId,
        details: JSON.stringify({ email: reset.email, sessionsRevoked: true }),
        ...requestAuditFields(req),
      });
      res.json({ message: 'Password reset successfully. Sign in with your new password.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }

  static async adminResetPassword(req: Request, res: Response) {
    try {
      const cleanAccountId = cleanString(req.params.accountId, 36);

      if (!cleanAccountId) {
        return res.status(400).json({ error: 'Account id is required' });
      }

      const account = await AuthAccountModel.getAccountById(cleanAccountId);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const temporaryPassword = generateTemporaryPassword();
      const updated = await AuthAccountModel.adminResetPassword(cleanAccountId, temporaryPassword);

      if (!updated) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const actor = await getSessionAccount(req);
      await AuthSessionModel.revokeAllSessions(cleanAccountId);
      broadcastAppEvent({ type: 'user-updated', entityId: cleanAccountId });
      await AuditLogModel.create({
        actorId: actor?.id || cleanAccountId,
        actorName: actor?.displayName || actor?.email || 'Administrator',
        action: 'auth.admin_password_reset',
        entityType: 'user',
        entityId: cleanAccountId,
        details: JSON.stringify({ email: account.email, sessionsRevoked: true, mustChangePassword: true }),
        ...requestAuditFields(req),
      });

      return res.json({ message: 'Temporary password generated successfully', password: temporaryPassword });
    } catch (error) {
      console.error('Admin reset password error:', error);
      return res.status(500).json({ error: 'Failed to reset user password' });
    }
  }

  static async changePassword(req: Request, res: Response) {
    try {
      const { accountId, currentPassword, newPassword } = req.body as {
        accountId?: string;
        currentPassword?: string;
        newPassword?: string;
      };

      const cleanAccountId = cleanString(accountId, 36);

      if (!cleanAccountId || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Account, current password, and new password are required' });
      }

      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({ error: 'New password must be at least 8 characters and include uppercase, lowercase, and a number' });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'New password must be different from the current password' });
      }

      const changed = await AuthAccountModel.changePassword(cleanAccountId, currentPassword, newPassword);

      if (!changed) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      await AuditLogModel.create({
        actorId: cleanAccountId,
        actorName: cleanAccountId,
        action: 'auth.password_changed',
        entityType: 'user',
        entityId: cleanAccountId,
        details: JSON.stringify({ selfService: true }),
        ...requestAuditFields(req),
      });
      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to update password' });
    }
  }

  static async getSession(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({ error: 'Failed to load session' });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      const token = getBearerToken(req);
      const account = await getSessionAccount(req);

      if (token) {
        await AuthSessionModel.revokeToken(token);
      }

      await AuditLogModel.create({
        actorId: account?.id || null,
        actorName: account?.displayName || account?.email || null,
        action: 'auth.logout',
        entityType: 'session',
        entityId: account?.id || null,
        details: JSON.stringify({ tokenRevoked: Boolean(token) }),
        ...requestAuditFields(req),
      });
      res.json({ message: 'Signed out' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Failed to sign out' });
    }
  }

  static async listSessions(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const token = getBearerToken(req);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const sessions = await AuthSessionModel.listActiveSessions(account.id, token || undefined);
      res.json(sessions);
    } catch (error) {
      console.error('List sessions error:', error);
      res.status(500).json({ error: 'Failed to load sessions' });
    }
  }

  static async revokeSession(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const revoked = await AuthSessionModel.revokeSession(req.params.sessionId, account.id);
      if (!revoked) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.session_revoked',
        entityType: 'session',
        entityId: req.params.sessionId,
        details: JSON.stringify({ accountId: account.id }),
        ...requestAuditFields(req),
      });
      res.json({ message: 'Session revoked' });
    } catch (error) {
      console.error('Revoke session error:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  }

  static async revokeOtherSessions(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const token = getBearerToken(req);
      if (!account || !token) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const revokedCount = await AuthSessionModel.revokeOtherSessions(account.id, token);
      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.sessions_revoked',
        entityType: 'session',
        entityId: account.id,
        details: JSON.stringify({ revokedCount }),
        ...requestAuditFields(req),
      });
      res.json({ revokedCount });
    } catch (error) {
      console.error('Revoke other sessions error:', error);
      res.status(500).json({ error: 'Failed to revoke other sessions' });
    }
  }

  static async setupTwoFactor(req: Request, res: Response) {
    try {
      const { accountId } = req.body as { accountId?: string };
      const cleanAccountId = cleanString(accountId, 36);

      if (!cleanAccountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const setup = await AuthAccountModel.createTwoFactorSetup(cleanAccountId);

      if (!setup) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json(setup);
    } catch (error) {
      console.error('Setup 2FA error:', error);
      res.status(500).json({ error: 'Failed to set up 2FA' });
    }
  }

  static async enableTwoFactor(req: Request, res: Response) {
    try {
      const { accountId, code } = req.body as { accountId?: string; code?: string };
      const cleanAccountId = cleanString(accountId, 36);
      const cleanCode = cleanTotpCode(code);

      if (!cleanAccountId || !cleanCode) {
        return res.status(400).json({ error: 'Account and verification code are required' });
      }

      const account = await AuthAccountModel.enableTwoFactor(cleanAccountId, cleanCode);

      if (!account) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.2fa_enabled',
        entityType: 'user',
        entityId: account.id,
        details: JSON.stringify({ email: account.email }),
        ...requestAuditFields(req),
      });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Enable 2FA error:', error);
      res.status(500).json({ error: 'Failed to enable 2FA' });
    }
  }

  static async disableTwoFactor(req: Request, res: Response) {
    try {
      const { accountId, password } = req.body as { accountId?: string; password?: string };
      const cleanAccountId = cleanString(accountId, 36);

      if (!cleanAccountId || !password) {
        return res.status(400).json({ error: 'Account and password are required' });
      }

      const account = await AuthAccountModel.disableTwoFactor(cleanAccountId, password);

      if (!account) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.2fa_disabled',
        entityType: 'user',
        entityId: account.id,
        details: JSON.stringify({ email: account.email }),
        ...requestAuditFields(req),
      });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Disable 2FA error:', error);
      res.status(500).json({ error: 'Failed to disable 2FA' });
    }
  }

  static async listAccounts(req: Request, res: Response) {
    try {
      const requester = await getSessionAccount(req);

      if (!(await canListAccounts(requester))) {
        return res.status(403).json({ error: 'Account list permission required' });
      }

      const accounts = await AuthAccountModel.listAccounts();
      res.json(accounts);
    } catch (error) {
      console.error('List accounts error:', error);
      res.status(500).json({ error: 'Failed to load accounts' });
    }
  }

  static async getRegistrationSettings(req: Request, res: Response) {
    try {
      res.json({
        mode: await getRegistrationMode(),
        appBaseUrl: await getAppBaseUrl(req),
        maintenanceMode: await SystemSettingModel.getString('maintenanceMode', 'false') === 'true',
        loginWarningEnabled: await SystemSettingModel.getString('loginWarningEnabled', 'true') === 'true',
        loginWarningMessage: await SystemSettingModel.getString('loginWarningMessage', DEFAULT_LOGIN_WARNING_MESSAGE),
        sessionTimeoutMinutes: Math.max(0, Number(await SystemSettingModel.getString('sessionTimeoutMinutes', '0')) || 0),
      });
    } catch (error) {
      console.error('Get registration settings error:', error);
      res.status(500).json({ error: 'Failed to load registration settings' });
    }
  }

  static async updateRegistrationSettings(req: Request, res: Response) {
    try {
      const { mode, appBaseUrl, maintenanceMode, loginWarningEnabled, loginWarningMessage, sessionTimeoutMinutes } = req.body as { mode?: string; appBaseUrl?: string; maintenanceMode?: boolean; loginWarningEnabled?: boolean; loginWarningMessage?: string; sessionTimeoutMinutes?: number };
      const normalizedMode = normalizeRegistrationMode(cleanString(mode, 40));
      const normalizedUrl = cleanString(appBaseUrl, 300).replace(/\/+$/u, '');
      const normalizedWarningMessage = cleanMultiline(loginWarningMessage, 2000) || DEFAULT_LOGIN_WARNING_MESSAGE;
      const normalizedSessionTimeoutMinutes = Math.max(0, Math.min(1440, Number(sessionTimeoutMinutes) || 0));

      if (normalizedUrl && !/^https?:\/\//iu.test(normalizedUrl)) {
        return res.status(400).json({ error: 'App URL must start with http:// or https://' });
      }

      await SystemSettingModel.setString('registrationMode', normalizedMode);
      await SystemSettingModel.setString('maintenanceMode', maintenanceMode === true ? 'true' : 'false');
      await SystemSettingModel.setString('loginWarningEnabled', loginWarningEnabled === false ? 'false' : 'true');
      await SystemSettingModel.setString('loginWarningMessage', normalizedWarningMessage);
      await SystemSettingModel.setString('sessionTimeoutMinutes', String(normalizedSessionTimeoutMinutes));
      if (normalizedUrl) {
        await SystemSettingModel.setString('appBaseUrl', normalizedUrl);
      }

      broadcastAppEvent({ type: 'permission-updated' });
      const account = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: account?.id || null,
        actorName: account?.displayName || account?.email || null,
        action: 'settings.registration_updated',
        entityType: 'settings',
        entityId: 'registration',
        details: JSON.stringify({
          mode: normalizedMode,
          maintenanceMode: maintenanceMode === true,
          loginWarningEnabled: loginWarningEnabled !== false,
          sessionTimeoutMinutes: normalizedSessionTimeoutMinutes,
          appBaseUrl: normalizedUrl || undefined,
        }),
        ...requestAuditFields(req),
      });
      res.json({
        mode: normalizedMode,
        appBaseUrl: normalizedUrl,
        maintenanceMode: maintenanceMode === true,
        loginWarningEnabled: loginWarningEnabled !== false,
        loginWarningMessage: normalizedWarningMessage,
        sessionTimeoutMinutes: normalizedSessionTimeoutMinutes,
      });
    } catch (error) {
      console.error('Update registration settings error:', error);
      res.status(500).json({ error: 'Failed to update registration settings' });
    }
  }

  static async listInvites(req: Request, res: Response) {
    try {
      const invites = await AuthInviteModel.list();
      res.json(invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        invitedBy: invite.invitedBy,
        invitedByName: invite.invitedByName,
        acceptedAt: invite.acceptedAt,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })));
    } catch (error) {
      console.error('List invites error:', error);
      res.status(500).json({ error: 'Failed to load invites' });
    }
  }

  static async createInvite(req: Request, res: Response) {
    try {
      const { email } = req.body as { email?: string; requesterId?: string };
      const account = await getSessionAccount(req);

      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail || !isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Enter a valid invite email' });
      }

      const appBaseUrl = await getAppBaseUrl(req);
      const invite = await AuthInviteModel.create(
        cleanEmail,
        account?.id || null,
        account?.displayName || account?.email || null,
      );
      const inviteUrl = `${appBaseUrl}/?invite=${encodeURIComponent(invite.token)}`;

      console.log(`SHIELD invite for ${cleanEmail}: ${inviteUrl}`);
      await AuditLogModel.create({
        actorId: account?.id || null,
        actorName: account?.displayName || account?.email || null,
        action: 'auth.invite_created',
        entityType: 'invite',
        entityId: invite.id,
        details: JSON.stringify({ email: cleanEmail, expiresAt: invite.expiresAt }),
        ...requestAuditFields(req),
      });
      res.status(201).json(publicInvite(invite, inviteUrl));
    } catch (error) {
      console.error('Create invite error:', error);
      res.status(500).json({ error: 'Failed to create invite' });
    }
  }

  static async updateRole(req: Request, res: Response) {
    try {
      const { role } = req.body as { role?: string };
      const { accountId } = req.params;
      const requester = await getSessionAccount(req);
      const cleanRole = cleanRoleName(role);

      if (!(await canManageRoles(requester))) {
        return res.status(403).json({ error: 'Role management permission required' });
      }

      if (!cleanRole || !(await AuthAccountModel.roleExists(cleanRole))) {
        return res.status(400).json({ error: 'Choose an existing role' });
      }

      const accounts = await AuthAccountModel.listAccounts();
      const administratorCount = accounts.filter((account) => account.role === 'administrator').length;
      const targetAccount = accounts.find((account) => account.id === accountId);

      if (!targetAccount) {
        return res.status(404).json({ error: 'Account not found' });
      }

      if (targetAccount.role === 'administrator' && cleanRole !== 'administrator' && administratorCount <= 1) {
        return res.status(400).json({ error: 'At least one administrator account is required' });
      }

      const account = await AuthAccountModel.updateRole(accountId, cleanRole);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      broadcastAppEvent({ type: 'permission-updated', entityId: accountId });
      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      await AuditLogModel.create({
        actorId: requester?.id || null,
        actorName: requester?.displayName || requester?.email || null,
        action: 'roles.assigned',
        entityType: 'user',
        entityId: accountId,
        details: JSON.stringify({ previousRole: targetAccount.role, newRole: cleanRole }),
        ...requestAuditFields(req),
      });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Update account role error:', error);
      res.status(500).json({ error: 'Failed to update account role' });
    }
  }

  static async updateMessagePreferences(req: Request, res: Response) {
    try {
      const { receiveMessages } = req.body as { receiveMessages?: boolean };
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only update your own message preferences' });
      }

      if (typeof receiveMessages !== 'boolean') {
        return res.status(400).json({ error: 'Message preference is required' });
      }

      const account = await AuthAccountModel.updateMessagePreferences(accountId, receiveMessages);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Update message preferences error:', error);
      res.status(500).json({ error: 'Failed to update message preferences' });
    }
  }

  static async updateTrooperDailyPreferences(req: Request, res: Response) {
    try {
      const { hiddenSections } = req.body as { hiddenSections?: unknown };
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only update your own Trooper Daily preferences' });
      }

      if (!Array.isArray(hiddenSections)) {
        return res.status(400).json({ error: 'Hidden sections are required' });
      }

      const cleanedSections = hiddenSections
        .map((section) => cleanString(section, 80))
        .filter(Boolean);
      const account = await AuthAccountModel.updateTrooperDailyPreferences(accountId, cleanedSections);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Update Trooper Daily preferences error:', error);
      res.status(500).json({ error: 'Failed to update Trooper Daily preferences' });
    }
  }

  static async completeOnboarding(req: Request, res: Response) {
    try {
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only complete your own guide' });
      }

      const account = await AuthAccountModel.completeOnboarding(accountId);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Complete onboarding error:', error);
      res.status(500).json({ error: 'Failed to complete guide' });
    }
  }

  static async listRoles(req: Request, res: Response) {
    try {
      const requester = await getSessionAccount(req);

      if (!(await canManageRoles(requester))) {
        return res.status(403).json({ error: 'Role management permission required' });
      }

      const roles = await AuthAccountModel.listRoles();
      res.json(roles);
    } catch (error) {
      console.error('List roles error:', error);
      res.status(500).json({ error: 'Failed to load roles' });
    }
  }

  static async createRole(req: Request, res: Response) {
    try {
      const { name, permissions } = req.body as {
        name?: string;
        permissions?: string[];
      };
      const requester = await getSessionAccount(req);

      if (!(await canManageRoles(requester))) {
        return res.status(403).json({ error: 'Role management permission required' });
      }

      const cleanName = cleanRoleName(name);
      const cleanPermissions = normalizePermissions(permissions);

      if (!cleanName) {
        return res.status(400).json({ error: 'Role name is required' });
      }

      const role = await AuthAccountModel.createRole(cleanName, cleanPermissions);
      broadcastAppEvent({ type: 'permission-updated', entityId: role.id });
      await AuditLogModel.create({
        actorId: requester?.id || null,
        actorName: requester?.displayName || requester?.email || null,
        action: 'roles.created',
        entityType: 'role',
        entityId: role.id,
        details: JSON.stringify({ name: role.name, permissions: cleanPermissions }),
        ...requestAuditFields(req),
      });
      res.status(201).json(role);
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: 'A role with that name already exists' });
      }

      console.error('Create role error:', error);
      res.status(500).json({ error: 'Failed to create role' });
    }
  }

  static async updateRoleDefinition(req: Request, res: Response) {
    try {
      const { name, permissions } = req.body as {
        name?: string;
        permissions?: string[];
      };
      const requester = await getSessionAccount(req);

      if (!(await canManageRoles(requester))) {
        return res.status(403).json({ error: 'Role management permission required' });
      }

      const cleanName = cleanRoleName(name);
      const cleanPermissions = normalizePermissions(permissions);

      if (!cleanName) {
        return res.status(400).json({ error: 'Role name is required' });
      }

      const role = await AuthAccountModel.updateRoleDefinition(req.params.roleId, cleanName, cleanPermissions);
      if (!role) {
        return res.status(404).json({ error: 'Role not found' });
      }

      broadcastAppEvent({ type: 'permission-updated', entityId: role.id });
      await AuditLogModel.create({
        actorId: requester?.id || null,
        actorName: requester?.displayName || requester?.email || null,
        action: 'roles.updated',
        entityType: 'role',
        entityId: role.id,
        details: JSON.stringify({ name: role.name, permissions: cleanPermissions }),
        ...requestAuditFields(req),
      });
      res.json(role);
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: 'A role with that name already exists' });
      }

      console.error('Update role error:', error);
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
}
