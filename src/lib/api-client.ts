import { refreshAccessToken, sessionExpiredRedirect } from '@/lib/session';

const BASE = '';  // Même domaine — pas besoin d'URL externe

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  _retry = false,
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') : null;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Token court expire : rafraichissement transparent puis rejeu unique.
  if (res.status === 401 && !_retry && typeof window !== 'undefined') {
    const nt = await refreshAccessToken();
    if (nt) return apiFetch<T>(path, options, true);
    sessionExpiredRedirect();
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message ?? data.message ?? 'Erreur serveur');
  }

  return data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
