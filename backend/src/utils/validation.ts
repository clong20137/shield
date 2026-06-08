export interface ValidationResult<T> {
  value?: T;
  error?: string;
}

export function cleanString(value: unknown, maxLength = 255): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ').slice(0, maxLength) : '';
}

export function cleanMultiline(value: unknown, maxLength = 5000): string {
  return typeof value === 'string' ? value.trim().replace(/\r\n/gu, '\n').slice(0, maxLength) : '';
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function normalizeEmail(value: unknown): string {
  return cleanString(value, 255).toLowerCase();
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizePhone(value: unknown): string {
  const text = cleanString(value, 50);
  if (!text) return '';
  const digits = text.replace(/\D/gu, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return text;
}

export function isValidPhone(value: string): boolean {
  if (!value) return true;
  const digits = value.replace(/\D/gu, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/iu.test(value);
}

export function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return options.includes(value as T);
}

export function cleanRecord(value: unknown, maxKeys = 120, maxValueLength = 500): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>)
    .slice(0, maxKeys)
    .reduce<Record<string, string>>((record, [key, entryValue]) => {
      const cleanKey = cleanString(key, 80);
      if (cleanKey) {
        record[cleanKey] = typeof entryValue === 'string' || typeof entryValue === 'number'
          ? cleanString(String(entryValue), maxValueLength)
          : '';
      }

      return record;
    }, {});
}

export const strongPasswordMessage = 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol';

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/u.test(password) &&
    /[a-z]/u.test(password) &&
    /\d/u.test(password) &&
    /[^A-Za-z0-9]/u.test(password)
  );
}
