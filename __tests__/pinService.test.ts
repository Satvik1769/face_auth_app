import { PinService, validatePinStrength } from '../src/security/PinService';
import { Pbkdf2PinHasher } from '../src/security/PinHasher';
import { InMemorySecureStorage } from '../src/storage/SecureStorageService';

describe('validatePinStrength', () => {
  test('accepts a reasonable 4–8 digit PIN', () => {
    expect(validatePinStrength('5823').ok).toBe(true);
    expect(validatePinStrength('905172').ok).toBe(true);
  });

  test('rejects non-numeric, too short, too long', () => {
    expect(validatePinStrength('12a4').ok).toBe(false);
    expect(validatePinStrength('123').ok).toBe(false);
    expect(validatePinStrength('123456789').ok).toBe(false);
  });

  test('rejects all-same-digit and simple sequences', () => {
    expect(validatePinStrength('1111').ok).toBe(false);
    expect(validatePinStrength('1234').ok).toBe(false);
    expect(validatePinStrength('4321').ok).toBe(false);
  });
});

describe('Pbkdf2PinHasher', () => {
  const hasher = new Pbkdf2PinHasher(10_000); // fewer rounds keeps the test fast

  test('hash is self-describing and not the plaintext', async () => {
    const h = await hasher.hash('5823');
    expect(h.startsWith('pbkdf2$')).toBe(true);
    expect(h).not.toContain('5823');
  });

  test('verify accepts the right PIN and rejects wrong ones', async () => {
    const h = await hasher.hash('5823');
    expect(await hasher.verify('5823', h)).toBe(true);
    expect(await hasher.verify('5824', h)).toBe(false);
  });

  test('verify rejects a malformed stored hash', async () => {
    expect(await hasher.verify('5823', 'garbage')).toBe(false);
  });
});

describe('PinService', () => {
  const mk = () => new PinService(new InMemorySecureStorage(), new Pbkdf2PinHasher(10_000));

  test('setPin then verifyPin round-trips', async () => {
    const svc = mk();
    await svc.setPin('rizul', '5823');
    expect(await svc.isPinSet('rizul')).toBe(true);
    expect(await svc.verifyPin('rizul', '5823')).toBe(true);
    expect(await svc.verifyPin('rizul', '0000')).toBe(false);
  });

  test('setPin enforces policy', async () => {
    const svc = mk();
    await expect(svc.setPin('rizul', '1111')).rejects.toThrow();
  });

  test('verifyPin returns false when no PIN is set (never throws)', async () => {
    const svc = mk();
    expect(await svc.verifyPin('nobody', '5823')).toBe(false);
  });

  test('changing the PIN invalidates the old one', async () => {
    const svc = mk();
    await svc.setPin('rizul', '5823');
    await svc.setPin('rizul', '9071');
    expect(await svc.verifyPin('rizul', '5823')).toBe(false);
    expect(await svc.verifyPin('rizul', '9071')).toBe(true);
  });
});
