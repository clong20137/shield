import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getSecretValue(name: string): string {
  return (process.env[name] || '').trim();
}

function deriveKey(secret: string): Buffer | null {
  if (!secret) {
    return null;
  }

  if (/^[a-f0-9]{64}$/iu.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  try {
    const decoded = Buffer.from(secret, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall back to deriving a key from the provided secret.
  }

  return crypto.createHash('sha256').update(secret).digest();
}

function getEncryptionKey(): Buffer | null {
  return deriveKey(getSecretValue('DATA_ENCRYPTION_KEY'));
}

function getIndexKey(): Buffer | null {
  return deriveKey(getSecretValue('DATA_INDEX_KEY')) || getEncryptionKey();
}

export function isEncryptedFieldValue(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptFieldValue(value: string | null | undefined): string {
  const plainText = typeof value === 'string' ? value : '';
  if (!plainText || isEncryptedFieldValue(plainText)) {
    return plainText;
  }

  const key = getEncryptionKey();
  if (!key) {
    return plainText;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

export function decryptFieldValue(value: string | null | undefined): string {
  const encryptedValue = typeof value === 'string' ? value : '';
  if (!encryptedValue || !isEncryptedFieldValue(encryptedValue)) {
    return encryptedValue;
  }

  const key = getEncryptionKey();
  if (!key) {
    return encryptedValue;
  }

  try {
    const payload = Buffer.from(encryptedValue.slice(ENCRYPTED_PREFIX.length), 'base64');
    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return encryptedValue;
  }
}

export function createBlindIndex(value: string | null | undefined): string | null {
  const cleanValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!cleanValue) {
    return null;
  }

  const key = getIndexKey();
  if (!key) {
    return null;
  }

  return crypto.createHmac('sha256', key).update(cleanValue).digest('hex');
}

export function normalizePhoneIndexValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\D/gu, '') : '';
}

export function createPhoneBlindIndex(value: string | null | undefined): string | null {
  return createBlindIndex(normalizePhoneIndexValue(value));
}

export function isFieldEncryptionConfigured(): boolean {
  return Boolean(getEncryptionKey());
}

