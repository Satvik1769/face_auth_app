import { HttpSyncApi, SyncApiError, MAX_LOG_BATCH } from '../src/sync/api';
import { AuthLogEntry } from '../src/core/types';
import { mockEmbeddingFor } from '../src/native/mockInference';

const ISO = '2026-05-29T00:00:00.000Z';

/** Build a fake fetch that records calls and returns a scripted response. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = (async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const api = (impl: typeof fetch) =>
  new HttpSyncApi({
    baseUrl: 'https://api.example.com/v1/faceauth/',
    getToken: async () => 'jwt-token-123',
    fetchImpl: impl,
  });

const mkLog = (id: string): AuthLogEntry => ({
  log_id: id,
  user_id: 'rizul',
  attempted_at: ISO,
  result: 'success',
  match_score: 0.9,
  failure_reason: null,
  synced_to_aws: 0,
});

describe('HttpSyncApi', () => {
  test('postEnrollment sends bearer token, JSON body, and strips trailing slash', async () => {
    const { impl, calls } = fakeFetch(200, { user_id: 'rizul', synced_at: ISO });
    await api(impl).postEnrollment({
      user_id: 'rizul',
      embedding: mockEmbeddingFor('rizul'),
      enrolled_at: ISO,
      enrollment_version: 1,
    });
    expect(calls[0].url).toBe('https://api.example.com/v1/faceauth/enrollments');
    expect(calls[0].init.headers.Authorization).toBe('Bearer jwt-token-123');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body).user_id).toBe('rizul');
  });

  test('postAuthLogs returns confirmed ids', async () => {
    const { impl } = fakeFetch(200, { confirmed_log_ids: ['a', 'b'] });
    const res = await api(impl).postAuthLogs([mkLog('a'), mkLog('b')]);
    expect(res.confirmed_log_ids).toEqual(['a', 'b']);
  });

  test('postAuthLogs guards the batch cap client-side', async () => {
    const { impl } = fakeFetch(200, {});
    const logs = Array.from({ length: MAX_LOG_BATCH + 1 }, (_, i) => mkLog(`l${i}`));
    await expect(api(impl).postAuthLogs(logs)).rejects.toThrow(SyncApiError);
  });

  test('getWipeCommand encodes the user id into the query', async () => {
    const { impl, calls } = fakeFetch(200, { wipe_pending: true, issued_at: ISO });
    const res = await api(impl).getWipeCommand('user/with space');
    expect(calls[0].url).toContain('wipe-commands?user_id=user%2Fwith%20space');
    expect(res.wipe_pending).toBe(true);
  });

  test('non-2xx responses throw SyncApiError with the status', async () => {
    const { impl } = fakeFetch(401, { message: 'unauthorized' });
    await expect(api(impl).getWipeCommand('rizul')).rejects.toMatchObject({ status: 401 });
  });

  test('empty response body is tolerated (confirmWipe)', async () => {
    const { impl } = fakeFetch(204, undefined);
    await expect(api(impl).confirmWipe('rizul')).resolves.toBeUndefined();
  });
});
