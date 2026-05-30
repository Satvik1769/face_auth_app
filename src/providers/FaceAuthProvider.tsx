/**
 * FaceAuthProvider — initialises models + DB on app start and exposes auth state
 * to the tree (TRD §10.1 step 4). Wrap the root navigator with this provider and
 * gate navigation on `state === 'AUTH_SUCCESS'`.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { AuthOrchestrator } from '../core/AuthOrchestrator';
import { AuthState, AuthContext } from '../core/AuthStateMachine';
import { MatchEngine } from '../core/MatchEngine';
import { EnrollmentService } from '../core/EnrollmentService';
import { Embedding, FaceDetector, isUsingMockInference } from '../native';
import { loadConfig } from '../config/env';
import { PinService } from '../security/PinService';
import { PinHasher, Pbkdf2PinHasher } from '../security/PinHasher';

// The on-device build injects NativeSecureStorage here; see src/native/secureStorageBridge.
import { ISecureStorage } from '../storage/SecureStorageService';

export interface FaceAuthContextValue {
  state: AuthState;
  context: AuthContext;
  usingMock: boolean;
  orchestrator: AuthOrchestrator;
  enrollment: EnrollmentService;
  pin: PinService;
}

const Ctx = createContext<FaceAuthContextValue | null>(null);

export interface FaceAuthProviderProps {
  userId: string;
  storage: ISecureStorage;
  /** Inject the native bcrypt-backed hasher on device; defaults to PBKDF2 reference. */
  pinHasher?: PinHasher;
  nowIso?: () => string;
  uuid?: () => string;
  triggerSync?: () => void;
  children: React.ReactNode;
}

export const FaceAuthProvider: React.FC<FaceAuthProviderProps> = ({
  userId,
  storage,
  pinHasher,
  nowIso = () => new Date().toISOString(),
  uuid = defaultUuid,
  triggerSync,
  children,
}) => {
  const cfg = useMemo(loadConfig, []);
  const match = useMemo(() => new MatchEngine(cfg.matchThreshold), [cfg.matchThreshold]);

  const [state, setState] = useState<AuthState>('IDLE');
  const [context, setContext] = useState<AuthContext>(() => ({} as AuthContext));

  const orchestrator = useMemo(
    () =>
      new AuthOrchestrator({
        embedding: Embedding,
        storage,
        match,
        userId,
        nowIso,
        uuid,
        triggerSync,
        onStateChange: (s, c) => {
          setState(s);
          setContext(c);
        },
      }),
    [storage, match, userId, nowIso, uuid, triggerSync],
  );

  const enrollment = useMemo(
    () => new EnrollmentService(Embedding, storage, nowIso),
    [storage, nowIso],
  );

  const pin = useMemo(
    () => new PinService(storage, pinHasher ?? new Pbkdf2PinHasher()),
    [storage, pinHasher],
  );

  // Kick the state machine on foreground (TRD §7.2 IDLE -> CAMERA_STARTING).
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        orchestrator.dispatch({ type: 'APP_FOREGROUND' });
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', onChange);
    orchestrator.dispatch({ type: 'APP_FOREGROUND' }); // initial launch
    return () => sub.remove();
  }, [orchestrator]);

  const value: FaceAuthContextValue = {
    state,
    context,
    usingMock: isUsingMockInference(),
    orchestrator,
    enrollment,
    pin,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useFaceAuth(): FaceAuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFaceAuth must be used within <FaceAuthProvider>');
  return v;
}

// Keeps FaceDetector imported for the camera frame processor in FaceAuthScreen.
export const _FaceDetector = FaceDetector;

/** RFC4122-ish v4 generator without a native dep (sufficient as a log idempotency key). */
function defaultUuid(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10, 16).join('')}`;
}
