import { randomBytes } from 'node:crypto';

/**
 * Generates a 48-char hex SDK key from 24 crypto-random bytes. Stored
 * plaintext (like a password-reset token): it authenticates SDK evaluate
 * calls, so treat it as a secret.
 */
export function newSdkKey(): string {
  return randomBytes(24).toString('hex');
}
