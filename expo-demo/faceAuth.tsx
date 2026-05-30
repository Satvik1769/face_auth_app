/**
 * Thin FaceAuth wiring for the Expo demo. Constructs the SAME tested engine the
 * laptop demo + Jest suite use (orchestrator, multi-template enrollment, match,
 * PIN service) with mock inference + in-memory storage, and exposes it via context.
 *
 * It deliberately does NOT reuse src/providers/FaceAuthProvider, because that file
 * defaults to the Node-PBKDF2 hasher (node:crypto) which can't bundle in RN. Here we
 * inject ExpoPinHasher instead.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { AuthOrchestrator } from './lib/core/AuthOrchestrator';
import { AuthState, AuthContext, initialContext } from './lib/core/AuthStateMachine';
import { MatchEngine } from './lib/core/MatchEngine';
import { EnrollmentService } from './lib/core/EnrollmentService';
import { PinService } from './lib/security/PinService';
import { InMemorySecureStorage } from './lib/storage/SecureStorageService';
import { MockEmbedding } from './lib/native/mockInference';
import { ExpoPinHasher } from './ExpoPinHasher';

export interface FaceAuthValue {
  state: AuthState;
  context: AuthContext;
  orchestrator: AuthOrchestrator;
  enrollment: EnrollmentService;
  pin: PinService;
  userId: string;
}

const Ctx = createContext<FaceAuthValue | null>(null);

const nowIso = () => new Date().toISOString();
let uuidN = 0;
const uuid = () => `log-${Date.now()}-${++uuidN}`;

export const FaceAuthProvider: React.FC<{ userId: string; children: React.ReactNode }> = ({
  userId,
  children,
}) => {
  const [state, setState] = useState<AuthState>('IDLE');
  const [context, setContext] = useState<AuthContext>(() => initialContext());

  const value = useMemo<FaceAuthValue>(() => {
    const storage = new InMemorySecureStorage();
    const embedding = new MockEmbedding();
    const match = new MatchEngine();
    const orchestrator = new AuthOrchestrator({
      embedding,
      storage,
      match,
      userId,
      nowIso,
      uuid,
      onStateChange: (s, c) => {
        setState(s);
        setContext(c);
      },
    });
    const enrollment = new EnrollmentService(embedding, storage, nowIso);
    const pin = new PinService(storage, new ExpoPinHasher());
    return { state, context, orchestrator, enrollment, pin, userId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return <Ctx.Provider value={{ ...value, state, context }}>{children}</Ctx.Provider>;
};

export function useFaceAuth(): FaceAuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFaceAuth must be used inside <FaceAuthProvider>');
  return v;
}
