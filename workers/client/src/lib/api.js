/**
 * Talking to the API.
 *
 * The sign-in token lives in localStorage under its own key — this app is on
 * its own subdomain, so it never sees the website's tokens or the other way
 * round. The server renews it now and then (GET /me hands back a fresh one);
 * a response that carries a token replaces the stored one, as long as the
 * request went out with the token still stored (or with none, to sign in).
 */

const TOKEN_KEY = 'hpc_workers_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (token) => {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
};
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};

/** An API refusal: `message` is written for the person, `field` names the input it is about. */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || (status === 0 ? 'Can’t reach the server. Check your connection and try again.' : 'Something went wrong. Please try again.'));
    this.status = status;
    this.code   = body?.code;
    this.field  = body?.field;
    this.body   = body;
  }
}

// Screens that react to the account's state (signed out, waiting, suspended…)
// listen for this instead of every page checking.
const listeners = new Set();
export const onAccountProblem = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const ACCOUNT_CODES = new Set(['SIGNED_OUT', 'TEMP_PASSWORD_EXPIRED', 'PENDING_APPROVAL', 'DECLINED', 'SUSPENDED', 'PASSWORD_CHANGE_REQUIRED']);

export async function request(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0);
  }
  const data = await response.json().catch(() => ({}));
  // An answer about the sign-in this request was sent with. If that has
  // changed while it was on its way — signed out, or signed in as someone
  // else — the answer is out of date and mustn't touch the new one.
  const sameSession = !auth || getToken() === token;
  if (!response.ok) {
    const error = new ApiError(response.status, data);
    if (auth && sameSession && ACCOUNT_CODES.has(error.code)) listeners.forEach((fn) => fn(error));
    throw error;
  }
  if (data?.token && sameSession) setToken(data.token);
  return data;
}

export const api = {
  get:   (path, opts)       => request('GET', path, undefined, opts),
  post:  (path, body, opts) => request('POST', path, body ?? {}, opts),
  put:   (path, body, opts) => request('PUT', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  del:   (path, opts)       => request('DELETE', path, undefined, opts),
};

/** Query string from an object, skipping empty values. */
export const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const text = s.toString();
  return text ? `?${text}` : '';
};

/**
 * Download a file the API makes (a CSV export) with the sign-in attached,
 * which a plain link can't carry. Resolves once the browser has it.
 */
export async function download(path, fallbackName) {
  const token = getToken();
  let response;
  try {
    response = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0);
  }
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => ({})));
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
