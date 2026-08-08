'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Anomalie 3 : viewer immersif pour un panorama équirectangulaire BRUT (fichier IMAGE_360
// détecté automatiquement à l'upload par son ratio ~2:1). Page isolée et additive : elle réutilise
// le même moteur Photo Sphere Viewer que les visites, chargé via <script type="module"> (imports CDN
// dans une string -> jamais résolus par le bundler -> build Vercel toujours vert). Zéro impact sur
// les viewers existants (aucun fichier partagé modifié).
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { detectLayoutFromRatio, eyeRect, type StereoLayout, type Eye } from '@/lib/stereoCrop';

const V = '5.11.5';
const D = `deps=three@0.160.0`;
const DC = `deps=@photo-sphere-viewer/core@${V},three@0.160.0`;
const DG = `deps=@photo-sphere-viewer/core@${V},@photo-sphere-viewer/gyroscope-plugin@${V},three@0.160.0`;
const PKG = {
  core: `https://esm.sh/@photo-sphere-viewer/core@${V}?${D}`,
  gyro: `https://esm.sh/@photo-sphere-viewer/gyroscope-plugin@${V}?${DC}`,
  stereo: `https://esm.sh/@photo-sphere-viewer/stereo-plugin@${V}?${DG}`,
  autorotate: `https://esm.sh/@photo-sphere-viewer/autorotate-plugin@${V}?${DC}`,
};
const PSV_CSS = [`https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@${V}/index.css`];

// Charge PSV + plugins une seule fois (partagé avec le viewer de visites via la même clé window.__psv).
function loadPSV(): Promise<any> {
  const w = window as any;
  if (w.__psv) return Promise.resolve(w.__psv);
  if (w.__psvPromise) return w.__psvPromise;
  w.__psvPromise = new Promise((resolve, reject) => {
    for (const href of PSV_CSS) {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
      }
    }
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent =
      `import { Viewer } from '${PKG.core}';\n` +
      `import { GyroscopePlugin } from '${PKG.gyro}';\n` +
      `import { StereoPlugin } from '${PKG.stereo}';\n` +
      `import { AutorotatePlugin } from '${PKG.autorotate}';\n` +
      `window.__psv = { Viewer, GyroscopePlugin, StereoPlugin, AutorotatePlugin };\n` +
      `window.dispatchEvent(new Event('psv-ready'));`;
    window.addEventListener('psv-ready', () => resolve(w.__psv), { once: true });
    s.onerror = () => reject(new Error('psv-load-failed'));
    document.head.appendChild(s);
    setTimeout(() => { if (!w.__psv) reject(new Error('psv-timeout')); }, 15000);
  });
  return w.__psvPromise;
}

// panoData PSV pour une disposition stéréo + un œil (aligné sur le viewer de visites). MONO -> image
// entière (undefined). Sinon on indique à PSV la région d'UN œil à mapper sur toute la sphère.
function panoDataFor(layout: StereoLayout, eye: Eye): ((img: any) => any) | undefined {
  if (layout === 'MONO') return undefined;
  return (img: any) => {
    const r = eyeRect(layout, eye, img.width, img.height)!;
    const fullWidth = (layout === 'LR' || layout === 'RL') ? img.width / 2 : img.width;
    const fullHeight = (layout === 'TB' || layout === 'BT') ? img.height / 2 : img.width / 2;
    return { fullWidth, fullHeight, croppedWidth: r.cw, croppedHeight: r.ch, croppedX: r.x, croppedY: r.y };
  };
}

export default function FilePanoViewerPage() {
  const params = useParams();
  const id = params.id as string;
  const fileId = params.fileId as string;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [layout, setLayout] = useState<StereoLayout>('MONO');
  const [eye, setEye] = useState<Eye>('left');

  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const layoutRef = useRef<StereoLayout>('MONO');
  const eyeRef = useRef<Eye>('left');
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  useEffect(() => { eyeRef.current = eye; }, [eye]);

  const getToken = (): string => typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';
  const src = `/api/file-proxy/${fileId}?token=${encodeURIComponent(getToken())}`;

  // 1) Mesure le ratio de l'image pour auto-détecter mono/stéréo (corrige d'éventuelles métadonnées).
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (cancelled) return; const lay = detectLayoutFromRatio(img.naturalWidth, img.naturalHeight); layoutRef.current = lay; setLayout(lay); };
    img.onerror = () => { /* la garde du viewer gère l'échec */ };
    img.src = src;
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // 2) Init PSV une seule fois.
  useEffect(() => {
    if (!hostRef.current || viewerRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { Viewer, GyroscopePlugin, StereoPlugin, AutorotatePlugin } = await loadPSV();
        if (cancelled || !hostRef.current) return;
        const viewer = new Viewer({
          container: hostRef.current,
          panorama: src,
          panoData: panoDataFor(layoutRef.current, eyeRef.current),
          navbar: ['zoom', 'move', 'fullscreen'],
          defaultZoomLvl: 30, minFov: 30, maxFov: 100,
          plugins: [
            [AutorotatePlugin, { autostartDelay: null, autorotateSpeed: '0.3rpm' }],
            [GyroscopePlugin, {}],
            [StereoPlugin, {}],
          ],
        });
        viewerRef.current = viewer;
        setStatus('ready');
      } catch {
        if (!cancelled) { setStatus('error'); setErrMsg('Le moteur 360° n\'a pas pu se charger.'); }
      }
    })();
    return () => {
      cancelled = true;
      if (viewerRef.current) { try { viewerRef.current.destroy(); } catch { /* noop */ } viewerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) Ré-applique la disposition/œil ACTIFS (le ratio mesuré arrive après l'init, ou l'utilisateur
  //    inverse le relief). setPanorama reconstruit réellement la texture d'un seul œil.
  useEffect(() => {
    if (!viewerRef.current) return;
    try { void viewerRef.current.setPanorama(src, { showLoader: false, transition: false, panoData: panoDataFor(layout, eye) }); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, eye]);

  const isStereo = layout !== 'MONO';

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
      <div className="flex items-center justify-between px-4 py-2 gap-3" style={{ background: 'var(--text)' }}>
        <Link href={`/projects/${id}`} className="rounded-md px-3 text-sm text-white whitespace-nowrap" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,.15)' }}>← Retour</Link>
        <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,.7)' }}>{isStereo ? 'Stéréo (relief)' : 'Mono'}</span>
        {isStereo && (
          <button type="button" onClick={() => setEye(e => e === 'left' ? 'right' : 'left')} className="rounded-md px-3 text-sm text-white whitespace-nowrap" style={{ minHeight: 40, background: 'rgba(255,255,255,.15)' }}>⇄ Inverser le relief</button>
        )}
      </div>
      <div className="relative flex-1">
        <div ref={hostRef} className="absolute inset-0" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(255,255,255,.8)' }}>Chargement du panorama…</div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: 'rgba(255,255,255,.85)' }}>
            <p className="text-sm">{errMsg}</p>
            <a href={src} target="_blank" rel="noreferrer" className="rounded-md px-4 text-sm text-white" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,.15)' }}>Ouvrir l&apos;image d&apos;origine</a>
          </div>
        )}
      </div>
    </div>
  );
}
