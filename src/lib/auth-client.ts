'use client';
import { refreshAccessToken, clearSession } from '@/lib/session';

export async function fetchWithAuth(url: string, options: RequestInit = {}, _retry = false): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') : null;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token ?? ''}`,
    },
  });

  // 401 : token court expiré — on rafraîchit et on rejoue une fois avant d'abandonner.
  if (res.status === 401 && !_retry && typeof window !== 'undefined') {
    const nt = await refreshAccessToken();
    if (nt) return fetchWithAuth(url, options, true);
    clearSession();
    window.location.href = '/login';
  }

  return res;
}
