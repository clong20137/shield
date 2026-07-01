import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthInviteModel } from '../models/AuthInvite';
import { AuthPasswordResetModel } from '../models/AuthPasswordReset';
import { AuthSessionModel } from '../models/AuthSession';
import { AuditLogModel } from '../models/AuditLog';
import { SystemSettingModel } from '../models/SystemSetting';
import { AUTH_SESSION_COOKIE_NAME, getSessionAccount, getSessionToken } from '../middleware/authSession';
import { broadcastAppEvent } from '../services/appEvents';
import { broadcastMessageEventToAll } from '../services/messageEvents';
import { sendEmail } from '../services/emailService';
import { cleanMultiline, cleanString, isOneOf, isStrongPassword, isValidEmail, normalizeEmail, strongPasswordMessage } from '../utils/validation';

const DEFAULT_LOGIN_WARNING_MESSAGE = 'This is a Indiana State Police computer application system that is for Official use only. This system is subject to monitoring. Therefore, no expectation of privacy is to be assumed. Individuals found performing unauthorized activities may be subject to disciplinary action including criminal prosecution.';
const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const temporaryPasswordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

// Keep this list as the server-side source of truth for assignable permissions; UI role editors should not invent new flags.
const allowedPermissions = [
  'users:view',
  'users:create',
  'users:edit',
  'users:view-hidden',
  'users:profile-picture',
  'account:profile-picture',
  'presence:incognito',
  'presence:view-incognito',
  'media:view',
  'media:upload',
  'media:edit',
  'media:delete',
  'devices:manage',
  'calendar:manage',
  'calendar:view-profiles',
  'reports:trooper-dailies',
  'reports:cpar',
  'audit:view',
  'roles:manage',
  'messages:receive',
  'messages:send',
  'desktop:start-with-windows',
  'desktop:minimize-to-tray',
  'alerts:send',
  'dashboard:manage',
  'dashboard:create',
  'dashboard:edit',
  'dashboard:delete',
  'district-feed:post',
  'bugs:manage',
  'admin:access',
  'admin:general',
  'admin:permissions',
  'admin:achievements',
  'admin:create-user',
  'admin:media',
  'admin:alerts',
  'admin:bugs',
  'admin:audit',
  'admin:errors',
] as const;

function isDuplicateEmailError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

function generateTemporaryPassword(): string {
  const randomPart = Array.from(crypto.randomBytes(16), (byte) => temporaryPasswordAlphabet[byte % temporaryPasswordAlphabet.length]).join('');
  return `Sh1eld!${randomPart}`;
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

async function canViewHiddenUsers(account?: { id: string; role: string } | null): Promise<boolean> {
  if (!account) {
    return false;
  }

  if (account.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('users:view-hidden');
}

async function withPermissions<T extends { id: string; role: string }>(account: T): Promise<T & { permissions: string[] }> {
  // Administrators receive the full permission surface even if the roles table has not caught up during an upgrade.
  const permissions = account.role === 'administrator'
    ? [...allowedPermissions]
    : await AuthAccountModel.getPermissionsForAccount(account.id);

  return { ...account, permissions };
}

const registrationModes = ['public', 'invite-only', 'disabled'] as const;
type RegistrationMode = typeof registrationModes[number];
const DEFAULT_APP_NAME = 'Blueline';
const DEFAULT_SITE_NAME = 'Blueline Workspace';
const DEFAULT_PRIMARY_COLOR = '#1a365d';
const DEFAULT_SECONDARY_COLOR = '#9C865C';
const seasonalThemes = ['auto', 'default', 'christmas', 'summer', 'thanksgiving', 'fall', 'spring', 'winter', 'patriotic'] as const;
const setupFeatureKeys = [
  'dashboardWidgets',
  'messaging',
  'mediaLibrary',
  'calendarReminders',
  'deviceManagement',
  'reportsAudit',
  'urgentAlerts',
  'performanceEvaluations',
] as const;
const setupEnvironmentKeys = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'ALLOWED_ORIGINS',
  'APP_BASE_URL',
  'API_BASE_URL',
  'SESSION_COOKIE_SECURE',
  'SESSION_COOKIE_SAMESITE',
  'TRUST_PROXY',
  'SETUP_ENV_LOCKED',
] as const;

function normalizeRegistrationMode(value: string): RegistrationMode {
  return registrationModes.includes(value as RegistrationMode) ? value as RegistrationMode : 'public';
}

function normalizeSeasonalTheme(value: unknown): typeof seasonalThemes[number] {
  const cleanValue = cleanString(value, 40);
  return seasonalThemes.includes(cleanValue as typeof seasonalThemes[number]) ? cleanValue as typeof seasonalThemes[number] : 'auto';
}

async function getThemeSettingsPayload() {
  return {
    seasonalTheme: normalizeSeasonalTheme(await SystemSettingModel.getString('seasonalTheme', 'auto')),
  };
}

function cleanFeatureSelection(value: unknown): string[] {
  const selected = Array.isArray(value) ? value : [];
  const allowed = new Set<string>(setupFeatureKeys);
  return selected.filter((item): item is string => typeof item === 'string' && allowed.has(item));
}

function normalizeUrl(value: unknown, maxLength = 300): string {
  return cleanString(value, maxLength).replace(/\/+$/u, '');
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const cleanValue = cleanString(value, 20);
  return /^#[0-9a-f]{6}$/iu.test(cleanValue) ? cleanValue : fallback;
}

function normalizeLogoDataUrl(value: unknown): string {
  const cleanValue = cleanString(value, 250000);
  if (!cleanValue) {
    return '';
  }

  if (!/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/u.test(cleanValue)) {
    return '';
  }

  return cleanValue;
}

function getBackendEnvPath(): string {
  return path.resolve(__dirname, '../../.env');
}

function parseEnvFile(value: string): Record<string, string> {
  return value
    .split(/\r?\n/u)
    .reduce<Record<string, string>>((settings, line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return settings;
      }

      const equalsIndex = trimmedLine.indexOf('=');
      if (equalsIndex <= 0) {
        return settings;
      }

      const key = trimmedLine.slice(0, equalsIndex).trim();
      let rawValue = trimmedLine.slice(equalsIndex + 1).trim();
      if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
        rawValue = rawValue.slice(1, -1);
      }
      settings[key] = rawValue.replace(/\\n/gu, '\n');
      return settings;
    }, {});
}

function formatEnvValue(value: string): string {
  if (!value) {
    return '';
  }

  if (/[\s#"']/u.test(value)) {
    return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\n/gu, '\\n')}"`;
  }

  return value;
}

function serializeEnvFile(settings: Record<string, string>): string {
  const orderedKeys = [
    ...setupEnvironmentKeys,
    ...Object.keys(settings).filter((key) => !(setupEnvironmentKeys as readonly string[]).includes(key)).sort(),
  ];

  return `${orderedKeys
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .map((key) => `${key}=${formatEnvValue(settings[key] || '')}`)
    .join('\n')}\n`;
}

async function canWriteSetupEnvironment(): Promise<boolean> {
  const envPath = getBackendEnvPath();
  if (!fs.existsSync(envPath)) {
    return true;
  }

  const fileSettings = parseEnvFile(await fs.promises.readFile(envPath, 'utf8'));
  if (fileSettings.SETUP_ENV_LOCKED !== 'true') {
    return true;
  }

  try {
    // A locked env can still be changed during first-run setup before any account exists.
    return await AuthAccountModel.countAccounts() === 0;
  } catch {
    return false;
  }
}

async function updateBackendEnv(values: Record<string, string>): Promise<void> {
  const envPath = getBackendEnvPath();
  const currentSettings = fs.existsSync(envPath) ? parseEnvFile(await fs.promises.readFile(envPath, 'utf8')) : {};
  await fs.promises.writeFile(envPath, serializeEnvFile({ ...currentSettings, ...values }), { encoding: 'utf8' });
}

function getSetupDatabaseSettings(input: Record<string, unknown>, fallbackPassword = '') {
  const inputPassword = typeof input.DB_PASSWORD === 'string' ? input.DB_PASSWORD.slice(0, 500) : '';
  return {
    host: cleanString(input.DB_HOST, 255) || 'localhost',
    port: Math.max(1, Math.min(65535, Number(input.DB_PORT) || 3306)),
    user: cleanString(input.DB_USER, 255) || 'root',
    password: inputPassword || fallbackPassword,
    database: cleanString(input.DB_NAME, 120) || 'shield',
  };
}

function quoteDatabaseName(databaseName: string): string {
  return `\`${databaseName.replace(/`/gu, '``')}\``;
}

async function isInstallerClosed(): Promise<boolean> {
  const accountCount = await AuthAccountModel.countAccounts().catch(() => 0);
  const setupCompleted = await SystemSettingModel.getString('setupCompleted', accountCount > 0 ? 'true' : 'false').catch(() => accountCount > 0 ? 'true' : 'false') === 'true';
  return accountCount > 0 || setupCompleted;
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
  // State carries only the local return path; the HMAC prevents tampering with the post-login destination.
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

function getSessionCookieSameSite(): 'lax' | 'strict' | 'none' {
  const value = (process.env.SESSION_COOKIE_SAMESITE || 'lax').trim().toLowerCase();
  return value === 'strict' || value === 'none' ? value : 'lax';
}

function shouldUseSecureSessionCookie(req: Request): boolean {
  const configuredSecureCookie = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (configuredSecureCookie === 'true' || configuredSecureCookie === 'false') {
    return configuredSecureCookie === 'true';
  }

  // Default to secure cookies in production while still allowing local HTTP setup and testing.
  return process.env.NODE_ENV === 'production' || req.secure;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const sameSite = getSessionCookieSameSite();
  res.cookie(AUTH_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: sameSite === 'none' ? true : shouldUseSecureSessionCookie(req),
    sameSite,
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

function clearSessionCookie(req: Request, res: Response) {
  const sameSite = getSessionCookieSameSite();
  res.clearCookie(AUTH_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: sameSite === 'none' ? true : shouldUseSecureSessionCookie(req),
    sameSite,
    path: '/',
  });
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
  static async getSetupEnvironment(_req: Request, res: Response) {
    try {
      if (await isInstallerClosed()) {
        return res.status(410).json({ error: 'Installer environment settings are no longer available after installation' });
      }

      const envPath = getBackendEnvPath();
      const fileSettings = fs.existsSync(envPath) ? parseEnvFile(await fs.promises.readFile(envPath, 'utf8')) : {};
      res.json({
        canWrite: await canWriteSetupEnvironment(),
        envFileExists: fs.existsSync(envPath),
        requiresRestart: false,
        values: {
          NODE_ENV: fileSettings.NODE_ENV || process.env.NODE_ENV || 'development',
          PORT: fileSettings.PORT || process.env.PORT || '5000',
          DB_HOST: fileSettings.DB_HOST || process.env.DB_HOST || 'localhost',
          DB_PORT: fileSettings.DB_PORT || process.env.DB_PORT || '3306',
          DB_USER: fileSettings.DB_USER || process.env.DB_USER || 'root',
          DB_PASSWORD: '',
          DB_NAME: fileSettings.DB_NAME || process.env.DB_NAME || 'shield',
          ALLOWED_ORIGINS: fileSettings.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '',
          APP_BASE_URL: fileSettings.APP_BASE_URL || process.env.APP_BASE_URL || '',
          API_BASE_URL: fileSettings.API_BASE_URL || process.env.API_BASE_URL || '',
          SESSION_COOKIE_SECURE: fileSettings.SESSION_COOKIE_SECURE || process.env.SESSION_COOKIE_SECURE || 'false',
          SESSION_COOKIE_SAMESITE: fileSettings.SESSION_COOKIE_SAMESITE || process.env.SESSION_COOKIE_SAMESITE || 'lax',
          TRUST_PROXY: fileSettings.TRUST_PROXY || process.env.TRUST_PROXY || 'false',
          SETUP_ENV_LOCKED: fileSettings.SETUP_ENV_LOCKED || process.env.SETUP_ENV_LOCKED || 'false',
        },
      });
    } catch (error) {
      console.error('Get setup environment error:', error);
      res.status(500).json({ error: 'Failed to load environment settings' });
    }
  }

  static async saveSetupEnvironment(req: Request, res: Response) {
    try {
      if (await isInstallerClosed()) {
        return res.status(410).json({ error: 'Installer environment settings are no longer available after installation' });
      }

      if (!await canWriteSetupEnvironment()) {
        return res.status(403).json({ error: 'Environment setup is locked after installation begins' });
      }

      const input = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
      const cleanPort = String(Math.max(1, Math.min(65535, Number(input.PORT) || 5000)));
      const cleanDbPort = String(Math.max(1, Math.min(65535, Number(input.DB_PORT) || 3306)));
      const cleanAllowedOrigins = cleanMultiline(input.ALLOWED_ORIGINS, 1000).replace(/\s+/gu, '');
      const cleanAppBaseUrl = normalizeUrl(input.APP_BASE_URL);
      const cleanApiBaseUrl = normalizeUrl(input.API_BASE_URL);

      if (cleanAppBaseUrl && !/^https?:\/\//iu.test(cleanAppBaseUrl)) {
        return res.status(400).json({ error: 'Application URL must start with http:// or https://' });
      }

      if (cleanApiBaseUrl && !/^https?:\/\//iu.test(cleanApiBaseUrl)) {
        return res.status(400).json({ error: 'API URL must start with http:// or https://' });
      }

      const envPath = getBackendEnvPath();
      const currentSettings = fs.existsSync(envPath) ? parseEnvFile(await fs.promises.readFile(envPath, 'utf8')) : {};
      const nextDbPassword = typeof input.DB_PASSWORD === 'string' && input.DB_PASSWORD.length > 0
        ? input.DB_PASSWORD.slice(0, 500)
        : currentSettings.DB_PASSWORD || process.env.DB_PASSWORD || '';
      const cleanNodeEnv = cleanString(input.NODE_ENV, 40);
      const cleanSameSite = cleanString(input.SESSION_COOKIE_SAMESITE, 20).toLowerCase();
      const nextSettings = {
        ...currentSettings,
        NODE_ENV: isOneOf(cleanNodeEnv, ['development', 'production', 'test']) ? cleanNodeEnv : 'development',
        PORT: cleanPort,
        DB_HOST: cleanString(input.DB_HOST, 255) || 'localhost',
        DB_PORT: cleanDbPort,
        DB_USER: cleanString(input.DB_USER, 255) || 'root',
        DB_PASSWORD: nextDbPassword,
        DB_NAME: cleanString(input.DB_NAME, 120) || 'shield',
        ALLOWED_ORIGINS: cleanAllowedOrigins,
        APP_BASE_URL: cleanAppBaseUrl,
        API_BASE_URL: cleanApiBaseUrl,
        SESSION_COOKIE_SECURE: input.SESSION_COOKIE_SECURE === true || input.SESSION_COOKIE_SECURE === 'true' ? 'true' : 'false',
        SESSION_COOKIE_SAMESITE: isOneOf(cleanSameSite, ['lax', 'strict', 'none']) ? cleanSameSite : 'lax',
        TRUST_PROXY: input.TRUST_PROXY === true || input.TRUST_PROXY === 'true' ? 'true' : 'false',
        SETUP_ENV_LOCKED: 'false',
      };

      await fs.promises.writeFile(envPath, serializeEnvFile(nextSettings), { encoding: 'utf8' });
      res.json({
        saved: true,
        canWrite: true,
        envFileExists: true,
        requiresRestart: true,
        envFile: '.env',
        values: { ...nextSettings, DB_PASSWORD: '' },
        message: `${DEFAULT_APP_NAME} environment saved. Restart the backend so the API can reconnect with these values.`,
      });
    } catch (error) {
      console.error('Save setup environment error:', error);
      res.status(500).json({ error: 'Failed to save environment settings' });
    }
  }

  static async testSetupDatabase(req: Request, res: Response) {
    let connection: mysql.Connection | null = null;
    try {
      if (await isInstallerClosed()) {
        return res.status(410).json({ error: 'Installer database testing is no longer available after installation' });
      }

      const input = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
      const envPath = getBackendEnvPath();
      const fileSettings = fs.existsSync(envPath) ? parseEnvFile(await fs.promises.readFile(envPath, 'utf8')) : {};
      const settings = getSetupDatabaseSettings(input, fileSettings.DB_PASSWORD || process.env.DB_PASSWORD || '');
      if (!/^[A-Za-z0-9_$-]+$/u.test(settings.database)) {
        return res.status(400).json({ error: 'Database name can only include letters, numbers, underscore, dollar sign, or hyphen' });
      }

      connection = await mysql.createConnection({
        host: settings.host,
        port: settings.port,
        user: settings.user,
        password: settings.password,
        connectTimeout: 7000,
        multipleStatements: false,
      });

      const [existingRows] = await connection.query(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1',
        [settings.database]
      );
      const existed = (existingRows as unknown[]).length > 0;
      if (!existed) {
        await connection.query(`CREATE DATABASE ${quoteDatabaseName(settings.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }

      await connection.query(`USE ${quoteDatabaseName(settings.database)}`);
      await connection.query('SELECT 1');

      res.json({
        connected: true,
        database: settings.database,
        created: !existed,
        message: existed
          ? `Connected to ${settings.database}.`
          : `Created and connected to ${settings.database}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown database connection error';
      res.status(400).json({
        connected: false,
        error: message,
        message: 'Database connection failed. Check the host, port, username, password, and database permissions.',
      });
    } finally {
      await connection?.end().catch(() => {});
    }
  }

  static async getSetupStatus(req: Request, res: Response) {
    try {
      const accountCount = await AuthAccountModel.countAccounts();
      const setupCompleted = await SystemSettingModel.getString('setupCompleted', accountCount > 0 ? 'true' : 'false') === 'true';
      res.json({
        setupRequired: accountCount === 0 && !setupCompleted,
        installed: accountCount > 0 || setupCompleted,
        setupCompleted,
        accountCount,
        database: {
          connected: true,
          initialized: true,
          name: process.env.DB_NAME || 'shield',
        },
        appName: await SystemSettingModel.getString('appName', DEFAULT_APP_NAME),
        siteName: await SystemSettingModel.getString('siteName', DEFAULT_SITE_NAME),
        brandLogoDataUrl: await SystemSettingModel.getString('brandLogoDataUrl', ''),
        primaryColor: await SystemSettingModel.getString('primaryColor', DEFAULT_PRIMARY_COLOR),
        secondaryColor: await SystemSettingModel.getString('secondaryColor', DEFAULT_SECONDARY_COLOR),
        apiUrl: await SystemSettingModel.getString('appApiUrl', `${req.protocol}://${req.get('host')}/api`),
        appBaseUrl: await getAppBaseUrl(req),
        registrationMode: await getRegistrationMode(),
        features: cleanFeatureSelection(JSON.parse(await SystemSettingModel.getString('enabledFeatures', '[]'))),
      });
    } catch (error) {
      console.error('Get setup status error:', error);
      const envPath = getBackendEnvPath();
      const fileSettings = fs.existsSync(envPath) ? parseEnvFile(await fs.promises.readFile(envPath, 'utf8').catch(() => '')) : {};
      const setupLocked = fileSettings.SETUP_ENV_LOCKED === 'true' || process.env.SETUP_ENV_LOCKED === 'true';
      res.status(200).json({
        setupRequired: !setupLocked,
        installed: setupLocked,
        setupCompleted: setupLocked,
        accountCount: 0,
        database: {
          connected: false,
          initialized: false,
          name: fileSettings.DB_NAME || process.env.DB_NAME || 'shield',
        },
        error: 'Failed to inspect setup status',
      });
    }
  }

  static async completeSetup(req: Request, res: Response) {
    try {
      const existingAccountCount = await AuthAccountModel.countAccounts();
      if (existingAccountCount > 0) {
        return res.status(409).json({ error: 'Setup is already complete' });
      }

      const {
        appName,
        siteName,
        brandLogoDataUrl,
        primaryColor,
        secondaryColor,
        appBaseUrl,
        apiUrl,
        registrationMode,
        maintenanceMode,
        loginWarningEnabled,
        loginWarningMessage,
        sessionTimeoutMinutes,
        features,
        admin,
      } = req.body as {
        appName?: unknown;
        siteName?: unknown;
        brandLogoDataUrl?: unknown;
        primaryColor?: unknown;
        secondaryColor?: unknown;
        appBaseUrl?: unknown;
        apiUrl?: unknown;
        registrationMode?: unknown;
        maintenanceMode?: boolean;
        loginWarningEnabled?: boolean;
        loginWarningMessage?: unknown;
        sessionTimeoutMinutes?: number;
        features?: unknown;
        admin?: {
          firstName?: unknown;
          lastName?: unknown;
          email?: unknown;
          password?: string;
          confirmPassword?: string;
        };
      };

      const cleanAppName = cleanString(appName, 80) || DEFAULT_APP_NAME;
      const cleanSiteName = cleanString(siteName, 120) || `${cleanAppName} Workspace`;
      const cleanBrandLogoDataUrl = normalizeLogoDataUrl(brandLogoDataUrl);
      const cleanPrimaryColor = normalizeHexColor(primaryColor, DEFAULT_PRIMARY_COLOR);
      const cleanSecondaryColor = normalizeHexColor(secondaryColor, DEFAULT_SECONDARY_COLOR);
      const cleanAppBaseUrl = normalizeUrl(appBaseUrl);
      const cleanApiUrl = normalizeUrl(apiUrl);
      const normalizedRegistrationMode = normalizeRegistrationMode(cleanString(registrationMode, 40));
      const normalizedWarningMessage = cleanMultiline(loginWarningMessage, 2000) || DEFAULT_LOGIN_WARNING_MESSAGE;
      const normalizedSessionTimeoutMinutes = Math.max(0, Math.min(1440, Number(sessionTimeoutMinutes) || 0));
      const cleanFeatures = cleanFeatureSelection(features);
      const cleanEmail = normalizeEmail(cleanString(admin?.email, 255));
      const cleanFirstName = cleanString(admin?.firstName, 100);
      const cleanLastName = cleanString(admin?.lastName, 100);
      const password = typeof admin?.password === 'string' ? admin.password : '';
      const confirmPassword = typeof admin?.confirmPassword === 'string' ? admin.confirmPassword : '';

      if (cleanAppBaseUrl && !/^https?:\/\//iu.test(cleanAppBaseUrl)) {
        return res.status(400).json({ error: 'Application URL must start with http:// or https://' });
      }

      if (cleanApiUrl && !/^https?:\/\//iu.test(cleanApiUrl)) {
        return res.status(400).json({ error: 'API URL must start with http:// or https://' });
      }

      if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Enter a valid admin email address' });
      }

      if (!cleanFirstName || !cleanLastName) {
        return res.status(400).json({ error: 'Admin first and last name are required' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Admin passwords do not match' });
      }

      if (!isStrongPassword(password)) {
        return res.status(400).json({ error: `Admin ${strongPasswordMessage.charAt(0).toLowerCase()}${strongPasswordMessage.slice(1)}` });
      }

      await SystemSettingModel.setString('appName', cleanAppName);
      await SystemSettingModel.setString('siteName', cleanSiteName);
      await SystemSettingModel.setString('brandLogoDataUrl', cleanBrandLogoDataUrl);
      await SystemSettingModel.setString('primaryColor', cleanPrimaryColor);
      await SystemSettingModel.setString('secondaryColor', cleanSecondaryColor);
      if (cleanAppBaseUrl) {
        await SystemSettingModel.setString('appBaseUrl', cleanAppBaseUrl);
      }
      if (cleanApiUrl) {
        await SystemSettingModel.setString('appApiUrl', cleanApiUrl);
      }
      await SystemSettingModel.setString('registrationMode', normalizedRegistrationMode);
      await SystemSettingModel.setString('maintenanceMode', maintenanceMode === true ? 'true' : 'false');
      await SystemSettingModel.setString('loginWarningEnabled', loginWarningEnabled === false ? 'false' : 'true');
      await SystemSettingModel.setString('loginWarningMessage', normalizedWarningMessage);
      await SystemSettingModel.setString('sessionTimeoutMinutes', String(normalizedSessionTimeoutMinutes));
      await SystemSettingModel.setString('enabledFeatures', JSON.stringify(cleanFeatures));

      const account = await AuthAccountModel.createAccount(cleanEmail, password, cleanFirstName, cleanLastName);
      await SystemSettingModel.setString('setupCompleted', 'true');
      await SystemSettingModel.setString('setupCompletedAt', new Date().toISOString());
      await updateBackendEnv({ SETUP_ENV_LOCKED: 'true' });

      const token = await AuthSessionModel.createSession(account.id);
      setSessionCookie(req, res, token);
      broadcastAppEvent({ type: 'permission-updated' });
      broadcastAppEvent({ type: 'user-updated', entityId: account.id });
      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'setup.completed',
        entityType: 'system',
        entityId: 'setup',
        details: JSON.stringify({
          appName: cleanAppName,
          siteName: cleanSiteName,
          primaryColor: cleanPrimaryColor,
          secondaryColor: cleanSecondaryColor,
          registrationMode: normalizedRegistrationMode,
          features: cleanFeatures,
        }),
        ...requestAuditFields(req),
      });

      res.status(201).json({
        account: await withPermissions(account),
        settings: {
          appName: cleanAppName,
          siteName: cleanSiteName,
          brandLogoDataUrl: cleanBrandLogoDataUrl,
          primaryColor: cleanPrimaryColor,
          secondaryColor: cleanSecondaryColor,
          appBaseUrl: cleanAppBaseUrl,
          apiUrl: cleanApiUrl,
          registrationMode: normalizedRegistrationMode,
          maintenanceMode: maintenanceMode === true,
          loginWarningEnabled: loginWarningEnabled !== false,
          sessionTimeoutMinutes: normalizedSessionTimeoutMinutes,
          features: cleanFeatures,
        },
      });
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: 'An account already exists for that email' });
      }

      console.error('Complete setup error:', error);
      res.status(500).json({ error: 'Failed to complete setup' });
    }
  }

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
        return res.status(400).json({ error: strongPasswordMessage });
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
      setSessionCookie(req, res, token);
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
      res.status(201).json({ account: await withPermissions(account) });
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
        const appName = await SystemSettingModel.getString('appName', DEFAULT_APP_NAME);
        return res.status(503).json({ error: `${appName} is in maintenance mode. Only administrators can sign in right now.` });
      }

      if (result.requiresTwoFactor) {
        await AuditLogModel.create({
          actorId: result.account?.id || null,
          actorName: result.account?.displayName || result.account?.email || normalizeEmail(email),
          action: 'auth.2fa_required',
          entityType: 'session',
          entityId: result.account?.id || null,
          details: JSON.stringify({ email: normalizeEmail(email) }),
          ...requestAuditFields(req),
        });
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
      setSessionCookie(req, res, token);
      await AuditLogModel.create({
        actorId: result.account.id,
        actorName: result.account.displayName || result.account.email,
        action: 'auth.login',
        entityType: 'session',
        entityId: result.account.id,
        details: JSON.stringify({ email: result.account.email, twoFactor: Boolean(result.account.twoFactorEnabled) }),
        ...requestAuditFields(req),
      });
      res.json({ account: await withPermissions(result.account) });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to sign in' });
    }
  }

  static async verifyPassword(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }

      const unlockEmail = typeof req.body?.email === 'string' ? req.body.email : '';
      const unlockAccountId = typeof req.body?.accountId === 'string' ? req.body.accountId : '';
      let verifiedAccount = account ? await AuthAccountModel.verifyCurrentPassword(account.id, password) : null;
      let refreshedSession = false;
      if (!verifiedAccount && unlockEmail && unlockAccountId) {
        verifiedAccount = await AuthAccountModel.verifyPasswordByEmail(unlockEmail, password);
        if (verifiedAccount?.id !== unlockAccountId) {
          verifiedAccount = null;
        }
      }

      if (!verifiedAccount) {
        await AuditLogModel.create({
          actorId: account?.id || unlockAccountId || null,
          actorName: account?.displayName || account?.email || normalizeEmail(unlockEmail) || null,
          action: 'auth.unlock_failed',
          entityType: 'session',
          entityId: account?.id || unlockAccountId || null,
          details: JSON.stringify({
            email: unlockEmail ? normalizeEmail(unlockEmail) : account?.email,
            sessionPresent: Boolean(account),
            reason: 'invalid_password',
          }),
          ...requestAuditFields(req),
        });
        return res.status(401).json({ error: 'Password was not accepted' });
      }

      if (account && verifiedAccount.id !== account.id) {
        await AuditLogModel.create({
          actorId: account.id,
          actorName: account.displayName || account.email,
          action: 'auth.unlock_failed',
          entityType: 'session',
          entityId: account.id,
          details: JSON.stringify({
            attemptedAccountId: verifiedAccount.id,
            reason: 'account_mismatch',
          }),
          ...requestAuditFields(req),
        });
        return res.status(401).json({ error: 'Password was not accepted' });
      }

      if (unlockEmail) {
        const token = await AuthSessionModel.createSession(verifiedAccount.id);
        setSessionCookie(req, res, token);
        refreshedSession = true;
      }

      if (refreshedSession) {
        await AuditLogModel.create({
          actorId: verifiedAccount.id,
          actorName: verifiedAccount.displayName || verifiedAccount.email,
          action: 'auth.unlock',
          entityType: 'session',
          entityId: verifiedAccount.id,
          details: JSON.stringify({ email: verifiedAccount.email }),
          ...requestAuditFields(req),
        });
      }

      res.json({ account: await withPermissions(verifiedAccount) });
    } catch (error) {
      console.error('Verify password error:', error);
      res.status(500).json({ error: 'Failed to verify password' });
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
        const appName = await SystemSettingModel.getString('appName', DEFAULT_APP_NAME);
        return redirectWithError(`No active ${appName} user is linked to that Microsoft account.`);
      }

      if (!account.isActive) {
        await AuditLogModel.create({
          actorId: account.id,
          actorName: account.displayName || account.email,
          action: 'auth.sso_failed',
          entityType: 'session',
          entityId: account.id,
          details: JSON.stringify({ provider: 'microsoft', email: account.email, reason: 'inactive' }),
          ...requestAuditFields(req),
        });
        const appName = await SystemSettingModel.getString('appName', DEFAULT_APP_NAME);
        return redirectWithError(`This ${appName} account is inactive. Contact an administrator.`);
      }

      if (maintenanceMode && account.role !== 'administrator') {
        await AuditLogModel.create({
          actorId: account.id,
          actorName: account.displayName || account.email,
          action: 'auth.sso_failed',
          entityType: 'session',
          entityId: account.id,
          details: JSON.stringify({ provider: 'microsoft', email: account.email, reason: 'maintenance' }),
          ...requestAuditFields(req),
        });
        const appName = await SystemSettingModel.getString('appName', DEFAULT_APP_NAME);
        return redirectWithError(`${appName} is in maintenance mode. Only administrators can sign in right now.`);
      }

      const token = await AuthSessionModel.createSession(account.id);
      setSessionCookie(req, res, token);
      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'auth.sso_login',
        entityType: 'session',
        entityId: account.id,
        details: JSON.stringify({ provider: 'microsoft', email: account.email, microsoftUserId: profile.id }),
        ...requestAuditFields(req),
      });

      return res.redirect(`${appBaseUrl}${returnTo || '/'}`);
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
          subject: `Reset your ${await SystemSettingModel.getString('appName', DEFAULT_APP_NAME)} password`,
          text: [
            `Hello ${account.displayName || account.email},`,
            '',
            `Use the secure link below to reset your ${await SystemSettingModel.getString('appName', DEFAULT_APP_NAME)} password. This link expires in 1 hour.`,
            '',
            resetUrl,
            '',
            'If you did not request this reset, you can ignore this message.',
          ].join('\n'),
        });

        if (!didSend && process.env.ALLOW_CONSOLE_RESET_LINKS === 'true') {
          console.log(`${await SystemSettingModel.getString('appName', DEFAULT_APP_NAME)} password reset for ${account.email}: ${resetUrl}`);
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

      res.json({ message: `If that email has a ${await SystemSettingModel.getString('appName', DEFAULT_APP_NAME)} login, a reset link has been sent.` });
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
        return res.status(400).json({ error: strongPasswordMessage });
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

  static async changePassword(req: Request, res: Response) {
    try {
      const requester = await getSessionAccount(req);
      const { accountId, currentPassword, newPassword } = req.body as {
        accountId?: string;
        currentPassword?: string;
        newPassword?: string;
      };

      const submittedAccountId = cleanString(accountId, 36);
      const cleanAccountId = submittedAccountId || requester?.id || '';

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }

      if (!cleanAccountId) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (!requester) {
        const targetAccount = await AuthAccountModel.getAccountById(cleanAccountId);
        if (!targetAccount?.mustChangePassword) {
          return res.status(401).json({ error: 'Sign in required' });
        }
      } else if (requester.id !== cleanAccountId && !(await canManageRoles(requester))) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      if (requester?.mustChangePassword && requester.id !== cleanAccountId) {
        return res.status(403).json({ error: 'Password change required before continuing', mustChangePassword: true });
      }

      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({ error: `New ${strongPasswordMessage.charAt(0).toLowerCase()}${strongPasswordMessage.slice(1)}` });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'New password must be different from the current password' });
      }

      const changed = await AuthAccountModel.changePassword(cleanAccountId, currentPassword, newPassword);

      if (!changed) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      await AuditLogModel.create({
        actorId: requester?.id || cleanAccountId,
        actorName: requester?.displayName || requester?.email || cleanAccountId,
        action: 'auth.password_changed',
        entityType: 'user',
        entityId: cleanAccountId,
        details: JSON.stringify({ selfService: !requester || requester.id === cleanAccountId }),
        ...requestAuditFields(req),
      });
      const updatedAccount = await AuthAccountModel.getAccountById(cleanAccountId);
      if (updatedAccount) {
        if (!requester) {
          const token = await AuthSessionModel.createSession(cleanAccountId);
          setSessionCookie(req, res, token);
        }
        broadcastAppEvent({ type: 'user-updated', entityId: cleanAccountId });
      }
      res.json({
        account: updatedAccount ? await withPermissions(updatedAccount) : undefined,
        message: 'Password updated successfully',
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to update password' });
    }
  }

  static async adminResetPassword(req: Request, res: Response) {
    try {
      const requester = await getSessionAccount(req);
      if (!requester) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const cleanAccountId = cleanString(req.params.accountId, 36);
      if (!cleanAccountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const temporaryPassword = generateTemporaryPassword();
      const account = await AuthAccountModel.resetPasswordByAdmin(cleanAccountId, temporaryPassword);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const currentToken = getSessionToken(req);
      const isSelfReset = requester.id === cleanAccountId;
      if (isSelfReset && currentToken) {
        await AuthSessionModel.revokeOtherSessions(cleanAccountId, currentToken);
      } else {
        await AuthSessionModel.revokeAllSessions(cleanAccountId);
      }
      broadcastAppEvent({ type: 'user-updated', entityId: cleanAccountId });
      await AuditLogModel.create({
        actorId: requester.id,
        actorName: requester.displayName || requester.email,
        action: 'auth.password_admin_reset',
        entityType: 'user',
        entityId: cleanAccountId,
        details: JSON.stringify({
          temporaryPasswordAssigned: true,
          mustChangePassword: true,
          currentSessionPreserved: isSelfReset && Boolean(currentToken),
        }),
        ...requestAuditFields(req),
      });

      res.json({
        account: await withPermissions(account),
        temporaryPassword,
        message: 'Password reset successfully',
      });
    } catch (error) {
      console.error('Admin password reset error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }

  static async getSession(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const token = getSessionToken(req);

      if (!account) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      if (token) {
        setSessionCookie(req, res, token);
      }

      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({ error: 'Failed to load session' });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      const token = getSessionToken(req);
      const account = await getSessionAccount(req);

      if (token) {
        await AuthSessionModel.revokeToken(token);
      }
      clearSessionCookie(req, res);

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
      const token = getSessionToken(req);

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
      const token = getSessionToken(req);
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

      const account = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: account?.id || cleanAccountId,
        actorName: account?.displayName || account?.email || cleanAccountId,
        action: 'auth.2fa_setup_started',
        entityType: 'user',
        entityId: cleanAccountId,
        details: JSON.stringify({ accountId: cleanAccountId }),
        ...requestAuditFields(req),
      });
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

      const result = await AuthAccountModel.enableTwoFactor(cleanAccountId, cleanCode);

      if (!result) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      await AuditLogModel.create({
        actorId: result.account.id,
        actorName: result.account.displayName || result.account.email,
        action: 'auth.2fa_enabled',
        entityType: 'user',
        entityId: result.account.id,
        details: JSON.stringify({ email: result.account.email, recoveryCodesIssued: result.recoveryCodes.length }),
        ...requestAuditFields(req),
      });
      res.json({ account: await withPermissions(result.account), recoveryCodes: result.recoveryCodes });
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

      const accounts = await AuthAccountModel.listAccounts(await canViewHiddenUsers(requester));
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
        appName: await SystemSettingModel.getString('appName', DEFAULT_APP_NAME),
        siteName: await SystemSettingModel.getString('siteName', DEFAULT_SITE_NAME),
        brandLogoDataUrl: await SystemSettingModel.getString('brandLogoDataUrl', ''),
        primaryColor: await SystemSettingModel.getString('primaryColor', DEFAULT_PRIMARY_COLOR),
        secondaryColor: await SystemSettingModel.getString('secondaryColor', DEFAULT_SECONDARY_COLOR),
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
      const { mode, appBaseUrl, appName, siteName, brandLogoDataUrl, maintenanceMode, loginWarningEnabled, loginWarningMessage, sessionTimeoutMinutes } = req.body as { mode?: string; appBaseUrl?: string; appName?: unknown; siteName?: unknown; brandLogoDataUrl?: unknown; maintenanceMode?: boolean; loginWarningEnabled?: boolean; loginWarningMessage?: string; sessionTimeoutMinutes?: number };
      const normalizedMode = normalizeRegistrationMode(cleanString(mode, 40));
      const normalizedUrl = cleanString(appBaseUrl, 300).replace(/\/+$/u, '');
      const cleanAppName = cleanString(appName, 80) || DEFAULT_APP_NAME;
      const cleanSiteName = cleanString(siteName, 120) || `${cleanAppName} Workspace`;
      const cleanBrandLogoDataUrl = normalizeLogoDataUrl(brandLogoDataUrl);
      const normalizedWarningMessage = cleanMultiline(loginWarningMessage, 2000) || DEFAULT_LOGIN_WARNING_MESSAGE;
      const normalizedSessionTimeoutMinutes = Math.max(0, Math.min(1440, Number(sessionTimeoutMinutes) || 0));

      if (normalizedUrl && !/^https?:\/\//iu.test(normalizedUrl)) {
        return res.status(400).json({ error: 'App URL must start with http:// or https://' });
      }

      await SystemSettingModel.setString('registrationMode', normalizedMode);
      await SystemSettingModel.setString('appName', cleanAppName);
      await SystemSettingModel.setString('siteName', cleanSiteName);
      await SystemSettingModel.setString('brandLogoDataUrl', cleanBrandLogoDataUrl);
      await SystemSettingModel.setString('maintenanceMode', maintenanceMode === true ? 'true' : 'false');
      await SystemSettingModel.setString('loginWarningEnabled', loginWarningEnabled === false ? 'false' : 'true');
      await SystemSettingModel.setString('loginWarningMessage', normalizedWarningMessage);
      await SystemSettingModel.setString('sessionTimeoutMinutes', String(normalizedSessionTimeoutMinutes));
      if (normalizedUrl) {
        await SystemSettingModel.setString('appBaseUrl', normalizedUrl);
      }

      broadcastAppEvent({ type: 'settings-updated', appName: cleanAppName, siteName: cleanSiteName, brandLogoDataUrl: cleanBrandLogoDataUrl });
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
          appName: cleanAppName,
          siteName: cleanSiteName,
          brandLogoUpdated: Boolean(cleanBrandLogoDataUrl),
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
        appName: cleanAppName,
        siteName: cleanSiteName,
        brandLogoDataUrl: cleanBrandLogoDataUrl,
        primaryColor: await SystemSettingModel.getString('primaryColor', DEFAULT_PRIMARY_COLOR),
        secondaryColor: await SystemSettingModel.getString('secondaryColor', DEFAULT_SECONDARY_COLOR),
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

  static async getThemeSettings(_req: Request, res: Response) {
    try {
      res.json(await getThemeSettingsPayload());
    } catch (error) {
      console.error('Get theme settings error:', error);
      res.status(500).json({ error: 'Failed to load theme settings' });
    }
  }

  static async updateThemeSettings(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (account?.role !== 'administrator') {
        return res.status(403).json({ error: 'Administrator access required' });
      }

      const { seasonalTheme } = req.body as { seasonalTheme?: unknown };
      const cleanSeasonalTheme = normalizeSeasonalTheme(seasonalTheme);
      const payload = {
        seasonalTheme: cleanSeasonalTheme,
      };

      await SystemSettingModel.setString('seasonalTheme', cleanSeasonalTheme);

      broadcastAppEvent({ type: 'settings-updated', ...payload });
      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email || null,
        action: 'settings.seasonal_theme_updated',
        entityType: 'settings',
        entityId: 'seasonalTheme',
        details: JSON.stringify(payload),
        ...requestAuditFields(req),
      });

      res.json(payload);
    } catch (error) {
      console.error('Update theme settings error:', error);
      res.status(500).json({ error: 'Failed to update theme settings' });
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

      console.log(`${await SystemSettingModel.getString('appName', DEFAULT_APP_NAME)} invite for ${cleanEmail}: ${inviteUrl}`);
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

      const accounts = await AuthAccountModel.listAccounts(await canViewHiddenUsers(requester));
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

      if (sessionAccount.role !== 'administrator') {
        const permissions = await AuthAccountModel.getPermissionsForAccount(sessionAccount.id);
        if (!permissions.includes('messages:receive')) {
          return res.status(403).json({ error: 'Receive messages permission required' });
        }
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

  static async updateCalendarPreferences(req: Request, res: Response) {
    try {
      const { calendarHidden } = req.body as { calendarHidden?: boolean };
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only update your own calendar preferences' });
      }

      if (sessionAccount.role !== 'administrator') {
        const permissions = await AuthAccountModel.getPermissionsForAccount(sessionAccount.id);
        if (!permissions.includes('calendar:manage')) {
          return res.status(403).json({ error: 'Calendar permission required' });
        }
      }

      if (typeof calendarHidden !== 'boolean') {
        return res.status(400).json({ error: 'Calendar preference is required' });
      }

      const account = await AuthAccountModel.updateCalendarPreferences(accountId, calendarHidden);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Update calendar preferences error:', error);
      res.status(500).json({ error: 'Failed to update calendar preferences' });
    }
  }

  static async updatePresencePreference(req: Request, res: Response) {
    try {
      const { presenceHidden } = req.body as { presenceHidden?: boolean };
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only update your own presence preference' });
      }

      if (typeof presenceHidden !== 'boolean') {
        return res.status(400).json({ error: 'Presence preference is required' });
      }

      if (presenceHidden && sessionAccount.role !== 'administrator') {
        const permissions = await AuthAccountModel.getPermissionsForAccount(sessionAccount.id);
        if (!permissions.includes('presence:incognito')) {
          return res.status(403).json({ error: 'Incognito mode permission required' });
        }
      }

      const account = await AuthAccountModel.updatePresencePreference(accountId, presenceHidden);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      broadcastMessageEventToAll({
        type: 'presence-updated',
        actorAccountId: accountId,
        actorOnline: true,
        actorAway: false,
        actorLastSeenAt: new Date().toISOString(),
      });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Update presence preference error:', error);
      res.status(500).json({ error: 'Failed to update presence preference' });
    }
  }

  static async updateAppScalePreference(req: Request, res: Response) {
    try {
      const { appScale } = req.body as { appScale?: unknown };
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only update your own app scale preference' });
      }

      if (appScale !== 'compact' && appScale !== 'comfortable' && appScale !== 'large') {
        return res.status(400).json({ error: 'App scale preference is required' });
      }

      const account = await AuthAccountModel.updateAppScalePreference(accountId, appScale);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Update app scale preference error:', error);
      res.status(500).json({ error: 'Failed to update app scale preference' });
    }
  }

  static async updateDefaultDutyHoursPreference(req: Request, res: Response) {
    try {
      const { defaultDutyHours } = req.body as { defaultDutyHours?: unknown };
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only update your own default duty hours preference' });
      }

      const hours = Number(defaultDutyHours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        return res.status(400).json({ error: 'Default duty hours must be between 0 and 24' });
      }

      const account = await AuthAccountModel.updateDefaultDutyHoursPreference(accountId, Math.round(hours * 100) / 100);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: accountId });
      res.json({ account: await withPermissions(account) });
    } catch (error) {
      console.error('Update default duty hours preference error:', error);
      res.status(500).json({ error: 'Failed to update default duty hours preference' });
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
