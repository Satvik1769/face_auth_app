/**
 * PinHasher interface (RN-safe copy for the Expo app).
 *
 * The repo's src/security/PinHasher.ts also ships a Node-PBKDF2 reference hasher
 * that imports `node:crypto` — which doesn't exist in React Native. The Expo app
 * therefore depends only on this interface and injects ExpoPinHasher (expo-crypto).
 * On a production device build you inject the native bcrypt(12) hasher (see NATIVE.md).
 */
export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, stored: string): Promise<boolean>;
}
