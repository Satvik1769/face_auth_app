import * as Crypto from 'expo-crypto';
import { PinHasher } from './lib/security/PinHasher';

/**
 * ExpoPinHasher — RN-safe PIN hasher for the Expo demo (expo-crypto, no node:crypto).
 *
 * DEMO-GRADE: salted SHA-256. The PRODUCTION device build injects bcrypt(12) via the
 * native SecureStorage module (TRD §4.2). The point demonstrated here is the same:
 * the PIN is never stored in plaintext, a per-PIN salt is used, and verify recomputes.
 * Format: `sha256$<saltHex>$<hashHex>`.
 */
export class ExpoPinHasher implements PinHasher {
  async hash(pin: string): Promise<string> {
    const saltBytes = await Crypto.getRandomBytesAsync(16);
    const saltHex = toHex(saltBytes);
    const digest = await this.digest(saltHex, pin);
    return `sha256$${saltHex}$${digest}`;
  }

  async verify(pin: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'sha256') return false;
    const saltHex = parts[1];
    const expected = parts[2];
    const actual = await this.digest(saltHex, pin);
    return constantTimeEqual(expected, actual);
  }

  private digest(saltHex: string, pin: string): Promise<string> {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`, {
      encoding: Crypto.CryptoEncoding.HEX,
    });
  }
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** Length-constant comparison of two equal-length hex strings. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
