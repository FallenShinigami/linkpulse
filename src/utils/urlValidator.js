const RESERVED_ALIASES = new Set([
  'api',
  'health',
  'links',
  'public',
  'assets',
  'favicon.ico',
  'robots.txt',
  'welcome',
  'dashboard'
]);

/**
 * Validates that a destination URL is a valid HTTP or HTTPS URL.
 * @param {string} urlString
 * @returns {{ valid: boolean, error?: string, sanitizedUrl?: string }}
 */
export function validateDestinationUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'Destination URL is required and must be a string' };
  }

  const trimmed = urlString.trim();
  if (!trimmed) {
    return { valid: false, error: 'Destination URL cannot be empty' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Destination URL must use http:// or https://' };
    }

    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { valid: false, error: 'Destination URL has an invalid hostname' };
    }

    return { valid: true, sanitizedUrl: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates a custom short alias.
 * @param {string} alias
 * @returns {{ valid: boolean, error?: string, sanitizedAlias?: string }}
 */
export function validateCustomAlias(alias) {
  if (!alias) {
    return { valid: true, sanitizedAlias: null };
  }

  if (typeof alias !== 'string') {
    return { valid: false, error: 'Custom alias must be a string' };
  }

  const trimmed = alias.trim();
  if (trimmed.length < 3 || trimmed.length > 30) {
    return { valid: false, error: 'Custom alias must be between 3 and 30 characters' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Custom alias can only contain letters, numbers, hyphens, and underscores' };
  }

  if (RESERVED_ALIASES.has(trimmed.toLowerCase())) {
    return { valid: false, error: `The alias "${trimmed}" is reserved by the system` };
  }

  return { valid: true, sanitizedAlias: trimmed };
}

/**
 * Validates an optional expiration date.
 * @param {string|null|undefined} expiresAt
 * @returns {{ valid: boolean, error?: string, sanitizedExpiresAt?: string|null }}
 */
export function validateExpiresAt(expiresAt) {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    return { valid: true, sanitizedExpiresAt: null };
  }

  const parsed = new Date(expiresAt);
  if (isNaN(parsed.getTime())) {
    return { valid: false, error: 'Expiration date must be a valid date' };
  }

  if (parsed.getTime() <= Date.now()) {
    return { valid: false, error: 'Expiration date must be in the future' };
  }

  return { valid: true, sanitizedExpiresAt: parsed.toISOString() };
}

/**
 * Validates an optional click limit.
 * @param {number|string|null|undefined} clickLimit
 * @returns {{ valid: boolean, error?: string, sanitizedLimit?: number|null }}
 */
export function validateClickLimit(clickLimit) {
  if (clickLimit === null || clickLimit === undefined || clickLimit === '') {
    return { valid: true, sanitizedLimit: null };
  }

  const num = Number(clickLimit);
  if (!Number.isInteger(num) || num < 1) {
    return { valid: false, error: 'Click limit must be a positive integer (at least 1)' };
  }

  return { valid: true, sanitizedLimit: num };
}
