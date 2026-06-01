'use client';

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') : null;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token ?? ''}`,
    },
  });

  // Si 401 — token expiré, rediriger vers login
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bilnov_token');
      localStorage.removeItem('bilnov-auth');
      window.location.href = '/login';
    }
  }

  return res;
}
