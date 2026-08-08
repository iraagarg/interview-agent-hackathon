/**
 * The backend base URL comes from the environment, never a hardcoded host.
 * Vite inlines VITE_* at build time, so changing it in Vercel requires a
 * redeploy rather than just a restart.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

export const apiBaseUrl = BASE;

/**
 * The one endpoint the contract defines. `body` is either
 * { sessionId, candidate } to start or { sessionId, message } to take a turn —
 * the server tells them apart by payload.
 */
export async function postInterview(body, { timeoutMs = 60_000 } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api/interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Network-level failure: wrong URL, server down, CORS, or timeout. The
    // message the browser gives is useless on its own, so say something the
    // user can act on.
    const reason = err?.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
    throw new Error(`The interview server ${reason} at ${BASE}. Check that it is running.`);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed with status ${res.status}.`);
    error.code = data?.code;
    error.status = res.status;
    throw error;
  }

  return data;
}

export const newSessionId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
