/**
 * PinService — fallback PIN setup + verification (PRD §2.2, TRD §7, §8.1).
 *
 * Replaces the placeholder `pin.length >= 4` check with a real, hashed credential:
 *   - enforces a minimum-strength policy,
 *   - stores only the hash (never the PIN) via SecureStorage,
 *   - verifies in (hasher-)constant time.
 *
 * Lockout/retry counting lives in the AuthStateMachine; this service is the
 * credential authority it consults.
 */
import { ISecureStorage } from '../storage/SecureStorageService';
import { PinHasher } from './PinHasher';

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;

export interface PinPolicyResult {
  ok: boolean;
  reason?: string;
}

/** Reject empty, too-short/long, non-numeric, all-same-digit, and trivial sequences. */
export function validatePinStrength(pin: string): PinPolicyResult {
  if (!/^\d+$/.test(pin)) return { ok: false, reason: 'PIN must be digits only' };
  if (pin.length < MIN_PIN_LENGTH) return { ok: false, reason: `PIN must be at least ${MIN_PIN_LENGTH} digits` };
  if (pin.length > MAX_PIN_LENGTH) return { ok: false, reason: `PIN must be at most ${MAX_PIN_LENGTH} digits` };
  if (/^(\d)\1+$/.test(pin)) return { ok: false, reason: 'PIN cannot be all the same digit' };
  if (isSequential(pin)) return { ok: false, reason: 'PIN cannot be a simple sequence' };
  return { ok: true };
}

function isSequential(pin: string): boolean {
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i++) {
    const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

export class PinService {
  constructor(
    private readonly storage: ISecureStorage,
    private readonly hasher: PinHasher,
  ) {}

  /** Set or change the fallback PIN. Throws on a policy violation. */
  async setPin(userId: string, pin: string): Promise<void> {
    const policy = validatePinStrength(pin);
    if (!policy.ok) throw new Error(policy.reason);
    const hash = await this.hasher.hash(pin);
    await this.storage.savePINHash(userId, hash);
  }

  async isPinSet(userId: string): Promise<boolean> {
    return (await this.storage.getPINHash(userId)) !== null;
  }

  /** Verify a candidate PIN. Returns false (never throws) if no PIN is set. */
  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const stored = await this.storage.getPINHash(userId);
    if (!stored) return false;
    return this.hasher.verify(pin, stored);
  }
}
