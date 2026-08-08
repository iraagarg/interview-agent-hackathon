const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

/**
 * Single call against the one endpoint the contract defines.
 * `body` is either { sessionId, candidate } to start or { sessionId, message }
 * to take a turn — the server distinguishes them by payload.
 */
export async function postInterview(body) {
  const res = await fetch(`${BASE}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.error || `Request failed with status ${res.status}`;
    const err = new Error(message);
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }

  return data;
}

export const newSessionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
