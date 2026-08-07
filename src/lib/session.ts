'use client';
// Rafraichissement du token d'acces via le cookie refresh_token (HttpOnly).
// Deduplique les rafraichissements concurrents : un seul appel /api/auth/refresh a la fois.
let inflight: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (inflight) return inflight;
  const p = (async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const token: string | null = data?.data?.accessToken ?? null;
      if (token) localStorage.setItem('bilnov_token', token);
      return token;
    } catch {
      return null;
    }
  })();
  inflight = p;
  void p.finally(() => { if (inflight === p) inflight = null; });
  return p;
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('bilnov_token');
  localStorage.removeItem('bilnov-auth');
}

// Session expiree (>4h d'inactivite ou deconnexion) : on nettoie et on oriente vers la
// reconnexion avec un motif clair affiche sur la page de connexion.
export function sessionExpiredRedirect(): void {
  if (typeof window === 'undefined') return;
  clearSession();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login?expired=idle';
  }
}
