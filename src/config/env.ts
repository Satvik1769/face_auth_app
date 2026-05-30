/**
 * Runtime configuration (TRD §10.2). Values come from the app's env/secrets at
 * build time; sensible defaults keep the offline auth path working with zero config.
 */
import { DEFAULT_MATCH_THRESHOLD } from '../core/MatchEngine';
import { DEFAULT_LIVENESS_TIMEOUT_MS } from '../liveness/LivenessSession';

function num(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export interface FaceAuthConfig {
  apiBaseUrl: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  matchThreshold: number;
  livenessTimeoutMs: number;
}

declare const process: { env: Record<string, string | undefined> };

export function loadConfig(): FaceAuthConfig {
  const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
  return {
    apiBaseUrl: env.FACEAUTH_API_BASE_URL ?? 'https://api.datalake.example.com/v1/faceauth',
    cognitoUserPoolId: env.COGNITO_USER_POOL_ID ?? '',
    cognitoClientId: env.COGNITO_CLIENT_ID ?? '',
    matchThreshold: num(env.FACEAUTH_MATCH_THRESHOLD, DEFAULT_MATCH_THRESHOLD),
    livenessTimeoutMs: num(env.FACEAUTH_LIVENESS_TIMEOUT_MS, DEFAULT_LIVENESS_TIMEOUT_MS),
  };
}
