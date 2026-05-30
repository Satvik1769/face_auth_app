/**
 * AuthStateMachine — orchestrates the auth pipeline (TRD §7).
 *
 * The transition logic is a pure reducer: (state, context, event) -> { state, context }.
 * Keeping it pure makes every transition + guard in TRD §7.2 unit-testable with no
 * camera, model, or timer. An orchestrator (separate file) wires real services to it.
 */
import { DEFAULT_MATCH_THRESHOLD } from './MatchEngine';

export type AuthState =
  | 'IDLE'
  | 'CAMERA_STARTING'
  | 'DETECTING_FACE'
  | 'LIVENESS_CHALLENGE'
  | 'EMBEDDING'
  | 'MATCHING'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAIL'
  | 'FALLBACK_PIN'
  | 'LOCKED_OUT'
  | 'ENROLLING'
  | 'ERROR';

export const MAX_FACE_RETRIES = 3; // TRD §7.2: fallback after 3 consecutive failures
export const MAX_PIN_FAILURES = 5; // TRD §7.2: lockout after 5 PIN failures
export const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes (TRD §7.1 LOCKED_OUT)

export interface AuthContext {
  retryCount: number; // consecutive face-auth failures
  pinFailCount: number; // consecutive PIN failures
  matchThreshold: number;
  enrollmentExists: boolean;
  cameraPermission: boolean;
  lockedUntilMs: number | null; // wall-clock ms; null when not locked
  lastScore: number | null;
}

export type AuthEvent =
  | { type: 'APP_FOREGROUND' }
  | { type: 'CAMERA_READY' }
  | { type: 'MODEL_LOAD_FAILURE' }
  | { type: 'FACE_DETECTED'; confidence: number }
  | { type: 'LIVENESS_PASSED' }
  | { type: 'LIVENESS_FAILED' } // timeout or failed gesture
  | { type: 'EMBEDDING_GENERATED' }
  | { type: 'EMBEDDING_ERROR' }
  | { type: 'MATCH_COMPUTED'; score: number }
  | { type: 'DISMISS_RETRY' }
  | { type: 'PIN_SUBMITTED'; correct: boolean }
  | { type: 'START_ENROLLMENT' }
  | { type: 'ENROLLMENT_DONE' }
  | { type: 'NOW'; nowMs: number }; // clock tick to clear an expired lockout

export const FACE_CONFIDENCE_THRESHOLD = 0.75; // BlazeFace (TRD §3.1)

export function initialContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    retryCount: 0,
    pinFailCount: 0,
    matchThreshold: DEFAULT_MATCH_THRESHOLD,
    enrollmentExists: true,
    cameraPermission: true,
    lockedUntilMs: null,
    lastScore: null,
    ...overrides,
  };
}

export interface Transition {
  state: AuthState;
  context: AuthContext;
}

/**
 * Pure transition reducer. Unknown (state, event) pairs are no-ops that return the
 * current state unchanged — defensive against out-of-order events from the camera.
 */
export function transition(state: AuthState, context: AuthContext, event: AuthEvent): Transition {
  const ctx = { ...context };

  switch (state) {
    case 'IDLE':
      if (event.type === 'APP_FOREGROUND') {
        return ctx.cameraPermission
          ? { state: 'CAMERA_STARTING', context: ctx }
          : { state: 'ERROR', context: ctx };
      }
      if (event.type === 'START_ENROLLMENT') {
        return { state: 'ENROLLING', context: ctx };
      }
      break;

    case 'CAMERA_STARTING':
      if (event.type === 'CAMERA_READY') {
        return { state: 'DETECTING_FACE', context: ctx };
      }
      if (event.type === 'MODEL_LOAD_FAILURE') {
        return { state: 'ERROR', context: ctx };
      }
      break;

    case 'DETECTING_FACE':
      if (event.type === 'FACE_DETECTED' && event.confidence >= FACE_CONFIDENCE_THRESHOLD) {
        return { state: 'LIVENESS_CHALLENGE', context: ctx };
      }
      break;

    case 'LIVENESS_CHALLENGE':
      if (event.type === 'LIVENESS_PASSED') {
        return { state: 'EMBEDDING', context: ctx };
      }
      if (event.type === 'LIVENESS_FAILED') {
        return registerFailure(ctx);
      }
      break;

    case 'EMBEDDING':
      if (event.type === 'EMBEDDING_GENERATED') {
        return { state: 'MATCHING', context: ctx };
      }
      if (event.type === 'EMBEDDING_ERROR') {
        return { state: 'ERROR', context: ctx };
      }
      break;

    case 'MATCHING':
      if (event.type === 'MATCH_COMPUTED') {
        ctx.lastScore = event.score;
        if (event.score >= ctx.matchThreshold && ctx.enrollmentExists) {
          ctx.retryCount = 0;
          return { state: 'AUTH_SUCCESS', context: ctx };
        }
        return registerFailure(ctx);
      }
      break;

    case 'AUTH_FAIL':
      if (event.type === 'DISMISS_RETRY') {
        // registerFailure already routed to FALLBACK_PIN when retryCount hit 3,
        // so reaching here means retryCount < 3 -> allow another attempt.
        return { state: 'DETECTING_FACE', context: ctx };
      }
      break;

    case 'FALLBACK_PIN':
      if (event.type === 'PIN_SUBMITTED') {
        if (event.correct) {
          ctx.pinFailCount = 0;
          ctx.retryCount = 0;
          return { state: 'AUTH_SUCCESS', context: ctx };
        }
        ctx.pinFailCount += 1;
        if (ctx.pinFailCount >= MAX_PIN_FAILURES) {
          ctx.lockedUntilMs = null; // set on NOW event when wall-clock is known
          return { state: 'LOCKED_OUT', context: ctx };
        }
        return { state: 'FALLBACK_PIN', context: ctx };
      }
      break;

    case 'LOCKED_OUT':
      if (event.type === 'NOW') {
        if (ctx.lockedUntilMs === null) {
          ctx.lockedUntilMs = event.nowMs + LOCKOUT_MS;
          return { state: 'LOCKED_OUT', context: ctx };
        }
        if (event.nowMs >= ctx.lockedUntilMs) {
          ctx.pinFailCount = 0;
          ctx.retryCount = 0;
          ctx.lockedUntilMs = null;
          return { state: 'FALLBACK_PIN', context: ctx };
        }
      }
      break;

    case 'ENROLLING':
      if (event.type === 'ENROLLMENT_DONE') {
        ctx.enrollmentExists = true;
        return { state: 'AUTH_SUCCESS', context: ctx };
      }
      break;

    case 'ERROR':
      // TRD §7.2: ERROR -> FALLBACK_PIN (immediate fallback)
      return { state: 'FALLBACK_PIN', context: ctx };

    case 'AUTH_SUCCESS':
      if (event.type === 'APP_FOREGROUND') {
        return { state: 'CAMERA_STARTING', context: initialContext(ctx) };
      }
      break;
  }

  return { state, context: ctx };
}

/** Increment the face-failure counter and route to retry or PIN fallback. */
function registerFailure(ctx: AuthContext): Transition {
  ctx.retryCount += 1;
  if (ctx.retryCount >= MAX_FACE_RETRIES) {
    return { state: 'FALLBACK_PIN', context: ctx };
  }
  return { state: 'AUTH_FAIL', context: ctx };
}
