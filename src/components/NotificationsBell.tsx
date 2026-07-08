'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';

interface Notif {
  id: string; type: string; message: string; readAt: string | null; createdAt: string;
  actor: { firstName: string; lastName: string } | null;
}

// Cloche de notifications (§13) : compteur de non-lus + liste déroulante.
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ data: { notifications: Notif[]; unreadCount: number } }>('/api/notifications');
      setItems(r.data.notifications); setUnread(r.data.unreadCount);
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => { void load(); const t = setInterval(() => void load(), 60000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function markAll() {
    try { await api.patch('/api/notifications', { all: true }); setUnread(0); setItems((p) => p.map((n) => ({ ...n, readAt: new Date().toISOString() }))); } catch { /* noop */ }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen((o) => !o); if (!open) void load(); }} className="relative rounded-lg flex items-center justify-center"
        style={{ width: 40, height: 40, color: 'var(--text-muted)' }} title="Notifications">
        <span style={{ fontSize: 18 }}>🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold"
            style={{ minWidth: 16, height: 16, padding: '0 3px' }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg bg-white shadow-xl border z-50" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-semibold text-slate-700">Notifications</span>
            {unread > 0 && <button onClick={() => void markAll()} className="text-xs text-violet-600 hover:underline">Tout marquer lu</button>}
          </div>
          {items.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-400">Aucune notification.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id} className={`px-3 py-2 border-b text-xs ${n.readAt ? 'text-slate-500' : 'text-slate-800 bg-violet-50'}`} style={{ borderColor: 'var(--border)' }}>
                <p>{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {n.actor ? `${n.actor.firstName} ${n.actor.lastName} · ` : ''}{new Date(n.createdAt).toLocaleString('fr-FR')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
