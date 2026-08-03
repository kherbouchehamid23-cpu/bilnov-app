'use client';

// Amelioration UI/UX (doc 13) - bascule theme clair / sombre.
// Ecrit data-theme sur <html> ; le CSS (html[data-theme="light"] .lg-app{...})
// dans globals.css bascule les variables. Choix memorise (localStorage).
// Defaut = sombre (comportement actuel) tant que l'utilisateur ne bascule pas.

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const KEY = 'bilnov-theme';

function applyTheme(theme: 'light' | 'dark') {
  const el = document.documentElement;
  if (theme === 'light') el.setAttribute('data-theme', 'light');
  else el.removeAttribute('data-theme');
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* stockage indisponible : on reste en sombre */
    }
    const initial: 'light' | 'dark' = saved === 'light' ? 'light' : 'dark';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggle = () => {
    const next: 'light' | 'dark' = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };

  // Rien tant que le thème n'est pas résolu côté client (évite tout écart d'hydratation).
  if (theme === null) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
      title={theme === 'light' ? 'Mode sombre' : 'Mode clair'}
      className="rounded-lg flex items-center justify-center"
      style={{ width: 40, height: 40, color: 'var(--text-muted)', background: 'transparent', border: 0, cursor: 'pointer' }}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
