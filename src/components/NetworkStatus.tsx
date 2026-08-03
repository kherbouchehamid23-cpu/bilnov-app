'use client';

// Amelioration UI/UX responsive (doc 15) - Etat "connexion perdue".
// Bandeau discret, non bloquant : informe l'utilisateur quand le reseau tombe,
// et confirme brievement le retour en ligne. Additif pur : ne modifie aucune
// page existante, ne capture aucun evenement, se monte une seule fois via le layout.

import { useEffect, useState } from 'react';

export default function NetworkStatus() {
  const [online, setOnline] = useState<boolean | undefined>(undefined);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    let backTimer: ReturnType<typeof setTimeout> | undefined;

    const goOffline = () => {
      setOnline(false);
      setJustBack(false);
    };
    const goOnline = () => {
      setOnline(true);
      setJustBack(true);
      if (backTimer) clearTimeout(backTimer);
      backTimer = setTimeout(() => setJustBack(false), 3200);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      if (backTimer) clearTimeout(backTimer);
    };
  }, []);

  if (online === undefined) return null;

  if (online === false) {
    return (
      <div className="bilnov-netstatus bilnov-netstatus-off" role="status" aria-live="polite">
        <span className="bilnov-netstatus-dot" aria-hidden />
        Connexion perdue - vos modifications reprendront au retour en ligne.
      </div>
    );
  }

  if (justBack) {
    return (
      <div className="bilnov-netstatus bilnov-netstatus-on" role="status" aria-live="polite">
        <span className="bilnov-netstatus-dot" aria-hidden />
        Connexion retablie.
      </div>
    );
  }

  return null;
}
