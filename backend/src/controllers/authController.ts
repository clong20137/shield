import { Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthInviteModel } from '../models/AuthInvite';
import { AuthPasswordResetModel } from '../models/AuthPasswordReset';
import { AuthSessionModel } from '../models/AuthSession';
import { SystemSettingModel } from '../models/SystemSetting';
import { getBearerToken, getSessionAccount } from '../middleware/authSession';
import { broadcastAppEvent } from '../services/appEvents';
import { sendEmail } from '../services/emailService';
import { cleanString, isOneOf, isStrongPassword, isValidEmail, normalizeEmail } from '../utils/validation';

const allowedPermissions = [
  'users:view',
  'users:create',
  'users:edit',
  'devices:manage',
  'calendar:manage',
  'audit:view',
  'roles:manage',
  'messages:send',
  'dashboard:manage',
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
      const { email, password, displayName, inviteToken } = req.body as {
        email?: string;
        password?: string;
        displayName?: string;
        inviteToken?: string;
      };

      if (!email || !password || !displayName) {
        return res.status(400).json({ error: 'Email, password, and display name are required' });
      }

      const cleanEmail = normalizeEmail(email);
      const cleanDisplayName = cleanString(displayName, 100);

      if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      if (cleanDisplayName.length < 2) {
        return res.status(400).json({ error: 'Display name must be at least 2 characters' });
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

      const account = await AuthAccountModel.createAccount(cleanEmail, password, cleanDisplayName);
      if (inviteId) {
        await AuthInviteModel.markAccepted(inviteId);
      }
      const token = await AuthSessionModel.createSession(account.id);
      broadcastAppEvent({ type: 'user-updated', entityId: account.id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: account.id });
      res.status(201).json({ account, token });
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

      const result = await AuthAccountModel.verifyLogin(normalizeEmail(email), password, cleanTotpCode(twoFactorCode));

      if (result.requiresTwoFactor) {
        return res.status(202).json({ requiresTwoFactor: true });
      }

      if (!result.account) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = await AuthSessionModel.createSession(result.account.id);
      res.json({ account: result.account, token });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to sign in' });
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
      res.json({ message: 'Password reset successfully. Sign in with your new password.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
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

      const changed = await AuthAccountModel.changePassword(cleanAccountId, currentPassword, newPassword);

      if (!changed) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

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

      res.json({ account });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({ error: 'Failed to load session' });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      const token = getBearerToken(req);

      if (token) {
        await AuthSessionModel.revokeToken(token);
      }

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

      res.json({ account });
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

      res.json({ account });
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
      });
    } catch (error) {
      console.error('Get registration settings error:', error);
      res.status(500).json({ error: 'Failed to load registration settings' });
    }
  }

  static async updateRegistrationSettings(req: Request, res: Response) {
    try {
      const { mode, appBaseUrl } = req.body as { mode?: string; appBaseUrl?: string };
      const normalizedMode = normalizeRegistrationMode(cleanString(mode, 40));
      const normalizedUrl = cleanString(appBaseUrl, 300).replace(/\/+$/u, '');

      if (normalizedUrl && !/^https?:\/\//iu.test(normalizedUrl)) {
        return res.status(400).json({ error: 'App URL must start with http:// or https://' });
      }

      await SystemSettingModel.setString('registrationMode', normalizedMode);
      if (normalizedUrl) {
        await SystemSettingModel.setString('appBaseUrl', normalizedUrl);
      }

      broadcastAppEvent({ type: 'permission-updated' });
      res.json({ mode: normalizedMode, appBaseUrl: normalizedUrl });
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
      broadcastAppEvent({ type: 'permission-updated', entityId: accountId });
      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      res.json({ account });
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
      res.json({ account });
    } catch (error) {
      console.error('Update message preferences error:', error);
      res.status(500).json({ error: 'Failed to update message preferences' });
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

      res.json({ account });
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
      res.status(201).json(role);
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: 'A role with that name already exists' });
      }

      console.error('Create role error:', error);
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
}
