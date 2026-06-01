import {
  transition,
  initialContext,
  AuthState,
  AuthContext,
  AuthEvent,
  LOCKOUT_MS,
} from '../src/core/AuthStateMachine';

/** Drive a sequence of events from a starting state/context. */
function run(state: AuthState, context: AuthContext, events: AuthEvent[]) {
  let cur = { state, context };
  for (const e of events) cur = transition(cur.state, cur.context, e);
  return cur;
}

describe('AuthStateMachine — happy path', () => {
  test('IDLE -> ... -> AUTH_SUCCESS on a good match', () => {
    const r = run('IDLE', initialContext(), [
      { type: 'APP_FOREGROUND' },
      { type: 'CAMERA_READY' },
      { type: 'FACE_DETECTED', confidence: 0.9 },
      { type: 'LIVENESS_PASSED' },
      { type: 'EMBEDDING_GENERATED' },
      { type: 'MATCH_COMPUTED', score: 0.91 },
    ]);
    expect(r.state).toBe('AUTH_SUCCESS');
    expect(r.context.retryCount).toBe(0);
  });
});

describe('AuthStateMachine — guards', () => {
  test('low face confidence does not advance', () => {
    const r = run('DETECTING_FACE', initialContext(), [{ type: 'FACE_DETECTED', confidence: 0.5 }]);
    expect(r.state).toBe('DETECTING_FACE');
  });

  test('no camera permission routes to ERROR', () => {
    const r = run('IDLE', initialContext({ cameraPermission: false }), [{ type: 'APP_FOREGROUND' }]);
    expect(r.state).toBe('ERROR');
  });

  test('model load failure routes to ERROR, then ERROR falls back to PIN', () => {
    let r = run('CAMERA_STARTING', initialContext(), [{ type: 'MODEL_LOAD_FAILURE' }]);
    expect(r.state).toBe('ERROR');
    r = transition(r.state, r.context, { type: 'NOW', nowMs: 0 });
    expect(r.state).toBe('FALLBACK_PIN');
  });
});

describe('AuthStateMachine — retry + fallback', () => {
  test('low score increments retry and shows AUTH_FAIL until the 3rd failure', () => {
    let cur = run('MATCHING', initialContext(), [{ type: 'MATCH_COMPUTED', score: 0.4 }]);
    expect(cur.state).toBe('AUTH_FAIL');
    expect(cur.context.retryCount).toBe(1);

    // dismiss retry -> back to detecting, fail again
    cur = transition(cur.state, cur.context, { type: 'DISMISS_RETRY' });
    expect(cur.state).toBe('DETECTING_FACE');
    cur = run(cur.state, cur.context, [
      { type: 'FACE_DETECTED', confidence: 0.9 },
      { type: 'LIVENESS_PASSED' },
      { type: 'EMBEDDING_GENERATED' },
      { type: 'MATCH_COMPUTED', score: 0.3 },
    ]);
    expect(cur.state).toBe('AUTH_FAIL');
    expect(cur.context.retryCount).toBe(2);

    // third failure -> FALLBACK_PIN
    cur = transition(cur.state, cur.context, { type: 'DISMISS_RETRY' });
    cur = run(cur.state, cur.context, [
      { type: 'FACE_DETECTED', confidence: 0.9 },
      { type: 'LIVENESS_PASSED' },
      { type: 'EMBEDDING_GENERATED' },
      { type: 'MATCH_COMPUTED', score: 0.2 },
    ]);
    expect(cur.state).toBe('FALLBACK_PIN');
    expect(cur.context.retryCount).toBe(3);
  });

  test('liveness failure also counts toward the retry budget', () => {
    const r = run('LIVENESS_CHALLENGE', initialContext(), [{ type: 'LIVENESS_FAILED' }]);
    expect(r.state).toBe('AUTH_FAIL');
    expect(r.context.retryCount).toBe(1);
  });

  test('no enrollment forces failure even on a high score', () => {
    const r = run('MATCHING', initialContext({ enrollmentExists: false }), [
      { type: 'MATCH_COMPUTED', score: 0.99 },
    ]);
    expect(r.state).toBe('AUTH_FAIL');
  });
});

describe('AuthStateMachine — PIN lockout', () => {
  test('correct PIN succeeds and resets counters', () => {
    const r = run('FALLBACK_PIN', initialContext({ retryCount: 3 }), [
      { type: 'PIN_SUBMITTED', correct: true },
    ]);
    expect(r.state).toBe('AUTH_SUCCESS');
    expect(r.context.pinFailCount).toBe(0);
    expect(r.context.retryCount).toBe(0);
  });

  test('5 wrong PINs -> LOCKED_OUT, timer expiry routes to CREDENTIAL_LOGIN', () => {
    let cur = { state: 'FALLBACK_PIN' as AuthState, context: initialContext() };
    for (let i = 0; i < 5; i++) {
      cur = transition(cur.state, cur.context, { type: 'PIN_SUBMITTED', correct: false });
    }
    expect(cur.state).toBe('LOCKED_OUT');
    expect(cur.context.pinFailCount).toBe(5);

    // NOW sets the deadline
    cur = transition(cur.state, cur.context, { type: 'NOW', nowMs: 1_000 });
    expect(cur.state).toBe('LOCKED_OUT');
    expect(cur.context.lockedUntilMs).toBe(1_000 + LOCKOUT_MS);

    // still locked before the deadline
    cur = transition(cur.state, cur.context, { type: 'NOW', nowMs: 1_000 + LOCKOUT_MS - 1 });
    expect(cur.state).toBe('LOCKED_OUT');

    // released at/after the deadline -> credential login (not PIN)
    cur = transition(cur.state, cur.context, { type: 'NOW', nowMs: 1_000 + LOCKOUT_MS });
    expect(cur.state).toBe('CREDENTIAL_LOGIN');
    expect(cur.context.pinFailCount).toBe(0);
  });

  test('USE_PASSWORD skips the lockout timer and goes to CREDENTIAL_LOGIN', () => {
    let cur = { state: 'FALLBACK_PIN' as AuthState, context: initialContext() };
    for (let i = 0; i < 5; i++) {
      cur = transition(cur.state, cur.context, { type: 'PIN_SUBMITTED', correct: false });
    }
    expect(cur.state).toBe('LOCKED_OUT');
    cur = transition(cur.state, cur.context, { type: 'USE_PASSWORD' });
    expect(cur.state).toBe('CREDENTIAL_LOGIN');
    expect(cur.context.lockedUntilMs).toBeNull();
  });

  test('CREDENTIAL_SUCCESS resets all counters and unlocks', () => {
    const cur = transition('CREDENTIAL_LOGIN', initialContext({ credentialFailCount: 1 }), {
      type: 'CREDENTIAL_SUCCESS',
    });
    expect(cur.state).toBe('AUTH_SUCCESS');
    expect(cur.context.credentialFailCount).toBe(0);
    expect(cur.context.pinFailCount).toBe(0);
    expect(cur.context.retryCount).toBe(0);
  });

  test('3 CREDENTIAL_FAILs re-lock', () => {
    let cur = { state: 'CREDENTIAL_LOGIN' as AuthState, context: initialContext() };
    for (let i = 0; i < 3; i++) {
      cur = transition(cur.state, cur.context, { type: 'CREDENTIAL_FAIL' });
    }
    expect(cur.state).toBe('LOCKED_OUT');
    expect(cur.context.credentialFailCount).toBe(0);
  });
});

describe('AuthStateMachine — enrollment', () => {
  test('enrollment completes into AUTH_SUCCESS', () => {
    const r = run('IDLE', initialContext({ enrollmentExists: false }), [
      { type: 'START_ENROLLMENT' },
      { type: 'ENROLLMENT_DONE' },
    ]);
    expect(r.state).toBe('AUTH_SUCCESS');
    expect(r.context.enrollmentExists).toBe(true);
  });
});
