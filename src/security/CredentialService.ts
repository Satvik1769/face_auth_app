import { ISecureStorage } from '../storage/SecureStorageService';
import { PinHasher } from './PinHasher';

export interface PasswordPolicyResult {
  ok: boolean;
  reason?: string;
}

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  if (password.length < 8) return { ok: false, reason: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { ok: false, reason: 'Must contain at least one uppercase letter' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'Must contain at least one digit' };
  return { ok: true };
}

export class CredentialService {
  constructor(
    private readonly storage: ISecureStorage,
    private readonly hasher: PinHasher,
  ) {}

  async register(userId: string, username: string, password: string, nowIso: string): Promise<void> {
    const policy = validatePasswordStrength(password);
    if (!policy.ok) throw new Error(policy.reason);
    const existing = await this.storage.getUserByUsername(username.toLowerCase().trim());
    if (existing) throw new Error('Username already taken');
    const hash = await this.hasher.hash(password);
    await this.storage.saveUserCredential(userId, username.toLowerCase().trim(), hash, nowIso);
  }

  async login(username: string, password: string): Promise<{ userId: string } | null> {
    const cred = await this.storage.getUserByUsername(username.toLowerCase().trim());
    if (!cred) return null;
    const valid = await this.hasher.verify(password, cred.passwordHash);
    return valid ? { userId: cred.userId } : null;
  }
}