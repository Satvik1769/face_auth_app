/**
 * AuthOrchestrator — drives the pure AuthStateMachine reducer with real services.
 *
 * It owns the {state, context} pair, feeds events through transition(), and on each
 * resulting state performs the side effect that produces the next event (run the
 * embedding model, query storage, compute the match, write the log). The UI
 * subscribes to state changes; it does not contain pipeline logic.
 */
import {
  AuthState,
  AuthContext,
  AuthEvent,
  transition,
  initialContext,
} from './AuthStateMachine';
import { MatchEngine } from './MatchEngine';
import { IEmbedding } from '../native/bridgeTypes';
import { ISecureStorage } from '../storage/SecureStorageService';
import { AuthLogEntry, FailureReason } from './types';

export interface OrchestratorDeps {
  embedding: IEmbedding;
  storage: ISecureStorage;
  match: MatchEngine;
  nowIso: () => string;
  uuid: () => string;
  onStateChange?: (state: AuthState, context: AuthContext) => void;
  onUserIdentified?: (userId: string) => void;
  triggerSync?: () => void; // fire-and-forget; never blocks unlock (TRD §2.4 step 11)
}

export class AuthOrchestrator {
  private state: AuthState = 'IDLE';
  private context: AuthContext;
  private resolvedUserId: string | null = null;

  constructor(private readonly deps: OrchestratorDeps) {
    this.context = initialContext({ matchThreshold: deps.match.getThreshold() });
  }

  getState(): AuthState {
    return this.state;
  }
  getContext(): AuthContext {
    return { ...this.context };
  }
  getResolvedUserId(): string | null {
    return this.resolvedUserId;
  }

  /** Apply an event and notify subscribers. */
  dispatch(event: AuthEvent): void {
    const next = transition(this.state, this.context, event);
    const changed = next.state !== this.state;
    this.state = next.state;
    this.context = next.context;
    if (changed) {
      this.deps.onStateChange?.(this.state, this.context);
    }
  }

  /**
   * Run the embed → match → decide tail once liveness has passed.
   * `liveFrame` is the cropped 112×112 face passed to MobileFaceNet.
   * Returns the final state for the caller's convenience.
   */
  async completeAuth(liveFrame: string): Promise<AuthState> {
    this.dispatch({ type: 'LIVENESS_PASSED' });

    let score: number | null = null;
    let failure: FailureReason = null;
    try {
      const { embedding } = await this.deps.embedding.generateEmbedding(liveFrame);
      this.dispatch({ type: 'EMBEDDING_GENERATED' });

      const allEnrollments = await this.deps.storage.listEnrollments();
      const match = this.deps.match.identifyBest(embedding, allEnrollments);
      if (match) {
        this.resolvedUserId = match.userId;
        this.deps.onUserIdentified?.(match.userId);
        score = match.score;
        this.dispatch({ type: 'MATCH_COMPUTED', score: match.score });
      } else {
        failure = 'low_score';
        this.dispatch({ type: 'MATCH_COMPUTED', score: 0 });
      }
    } catch {
      failure = 'error';
      this.dispatch({ type: 'EMBEDDING_ERROR' });
    }

    await this.writeLog(score, failure);
    this.deps.triggerSync?.();
    return this.state;
  }

  /** Authenticate via username + password after face/PIN lockout. */
  async loginWithCredentials(userId: string): Promise<void> {
    this.resolvedUserId = userId;
    this.deps.onUserIdentified?.(userId);
    this.dispatch({ type: 'CREDENTIAL_SUCCESS' });
    this.deps.triggerSync?.();
  }

  /** Signal a failed credential attempt so the state machine can count and lock. */
  failCredentials(): void {
    this.dispatch({ type: 'CREDENTIAL_FAIL' });
  }

  /** Liveness timed out / failed before any comparison. */
  async failLiveness(): Promise<AuthState> {
    this.dispatch({ type: 'LIVENESS_FAILED' });
    await this.writeLog(null, 'liveness_fail');
    return this.state;
  }

  private async writeLog(score: number | null, failure: FailureReason): Promise<void> {
    const result =
      this.state === 'AUTH_SUCCESS' ? 'success' : this.state === 'FALLBACK_PIN' ? 'fallback' : 'fail';
    const log: Omit<AuthLogEntry, 'synced_to_aws'> = {
      log_id: this.deps.uuid(),
      user_id: this.resolvedUserId ?? 'unknown',
      attempted_at: this.deps.nowIso(),
      result,
      match_score: score,
      failure_reason: result === 'success' ? null : failure,
    };
    try {
      await this.deps.storage.writeAuthLog(log);
    } catch {
      // logging must never block auth; swallow and continue
    }
  }
}
