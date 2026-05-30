/**
 * PinHasher — pluggable password hashing for the fallback PIN (TRD §4.2, §8.1).
 *
 * Production on-device uses **bcrypt (cost 12)** inside the native SecureStorage
 * module (TRD spec). This interface lets the JS PinService stay platform-agnostic:
 * inject the native bcrypt hasher on device, and the portable PBKDF2 reference here
 * for the laptop demo / CI tests. Both produce a self-describing hash string so
 * verify() needs no out-of-band parameters.
 */
export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, stored: string): Promise<boolean>;
}

/**
 * Pbkdf2PinHasher — portable reference hasher using PBKDF2-HMAC-SHA256.
 * Format: `pbkdf2$<iterations>$<saltB64>$<hashB64>`. Constant-time comparison.
 *
 * Note: `node:crypto` is available in the test/demo (Node) environment. On a real
 * device, inject a native bcrypt-backed hasher instead (see NATIVE.md) — the PIN
 * never needs to be hashed in JS in production.
 */
export class Pbkdf2PinHasher implements PinHasher {
  constructor(private readonly iterations = 120_000, private readonly keyLen = 32) {}

  async hash(pin: string): Promise<string> {
    const crypto = await loadCrypto();
    const salt = crypto.randomBytes(16);
    const dk = crypto.pbkdf2Sync(pin, salt, this.iterations, this.keyLen, 'sha256');
    return `pbkdf2$${this.iterations}$${salt.toString('base64')}$${dk.toString('base64')}`;
  }

  async verify(pin: string, stored: string): Promise<boolean> {
    const crypto = await loadCrypto();
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = Number(parts[1]);
    const salt = Buffer.from(parts[2], 'base64');
    const expected = Buffer.from(parts[3], 'base64');
    const actual = crypto.pbkdf2Sync(pin, salt, iterations, expected.length, 'sha256');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
}

// Lazy import so bundlers targeting RN don't try to resolve node:crypto eagerly.
async function loadCrypto(): Promise<typeof import('crypto')> {
  return import('crypto');
}
