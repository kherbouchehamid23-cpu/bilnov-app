'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Viewer 360 (V2→V6) : moteur Photo Sphere Viewer (three.js) en ACCÈS OPT-IN.
// Route séparée : le viewer Pannellum de prod n'est PAS modifié (zéro régression par construction).
// PSV + plugins chargés via <script type="module"> (imports CDN dans une string -> le bundler
// ne les résout jamais -> build Vercel toujours vert, même si le runtime PSV échoue).
//   V2 moteur PSV + hotspots (direction / info)
//   V3 transitions fondu sans overlay (setPanorama transition, showLoader:false)
//   V4 mono / stéréo (over-under & side-by-side) via panoData — réglage viewer, aucune migration DB
//   V5 VR / WebXR : gyroscope (mobile) + mode casque cardboard (StereoPlugin)
//   V6 finitions : autorotation au repos, plein écran, barre de scènes, garde d'erreur -> viewer classique
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { isDirection } from '@/lib/tour';

interface Scene { id: string; name: string; imageUrl: string; isInitial: boolean; position: number; panoramaProxy?: string; }
interface Hotspot { id: string; type: string; positionYaw: number; positionPitch: number; targetSceneId: string | null; content: Record<string, unknown>; }
interface ApiResponse<T> { data: T; success: boolean; }
type Projection = 'mono' | 'ou' | 'sbs';

const V = '5.11.5';
const D = `deps=three@0.160.0`;
const DC = `deps=@photo-sphere-viewer/core@${V},three@0.160.0`;
const DG = `deps=@photo-sphere-viewer/core@${V},@photo-sphere-viewer/gyroscope-plugin@${V},three@0.160.0`;
const PKG = {
  core: `https://esm.sh/@photo-sphere-viewer/core@${V}?${D}`,
  markers: `https://esm.sh/@photo-sphere-viewer/markers-plugin@${V}?${DC}`,
  gyro: `https://esm.sh/@photo-sphere-viewer/gyroscope-plugin@${V}?${DC}`,
  stereo: `https://esm.sh/@photo-sphere-viewer/stereo-plugin@${V}?${DG}`,
  autorotate: `https://esm.sh/@photo-sphere-viewer/autorotate-plugin@${V}?${DC}`,
};
const PSV_CSS = [
  `https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@${V}/index.css`,
  `https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/markers-plugin@${V}/index.css`,
];

// Charge PSV + plugins une seule fois. Les URLs vivent dans une string -> invisibles au bundler.
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
      `import { MarkersPlugin } from '${PKG.markers}';\n` +
      `import { GyroscopePlugin } from '${PKG.gyro}';\n` +
      `import { StereoPlugin } from '${PKG.stereo}';\n` +
      `import { AutorotatePlugin } from '${PKG.autorotate}';\n` +
      `window.__psv = { Viewer, MarkersPlugin, GyroscopePlugin, StereoPlugin, AutorotatePlugin };\n` +
      `window.dispatchEvent(new Event('psv-ready'));`;
    window.addEventListener('psv-ready', () => resolve(w.__psv), { once: true });
    s.onerror = () => reject(new Error('psv-load-failed'));
    document.head.appendChild(s);
    setTimeout(() => { if (!w.__psv) reject(new Error('psv-timeout')); }, 15000);
  });
  return w.__psvPromise;
}

// V4 mono/stéréo : forme fonction de panoData (reçoit l'image chargée -> dimensions natives).
// mono = sphère complète ; ou = moitié haute ; sbs = moitié gauche. Aucun champ DB requis.
function panoDataFor(proj: Projection): ((img: any) => any) | undefined {
  if (proj === 'ou') return (img: any) => ({ fullWidth: img.width, fullHeight: img.width / 2, croppedWidth: img.width, croppedHeight: img.height / 2, croppedX: 0, croppedY: 0 });
  if (proj === 'sbs') return (img: any) => ({ fullWidth: img.width / 2, fullHeight: img.height, croppedWidth: img.width / 2, croppedHeight: img.height, croppedX: 0, croppedY: 0 });
  return undefined;
}

export default function TourViewerPsvPage() {
  const params = useParams();
  const id = params.id as string;
  const tourId = params.tourId as string;

  const [tourName, setTourName] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [info, setInfo] = useState<Hotspot | null>(null);
  const [projection, setProjection] = useState<Projection>('mono');
  const [vrOn, setVrOn] = useState(false);
  const [autorotate, setAutorotate] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const stereoRef = useRef<any>(null);
  const autoRef = useRef<any>(null);
  const dataRef = useRef<{ scenes: Scene[]; hs: Record<string, Hotspot[]> }>({ scenes: [], hs: {} });
  const curRef = useRef<string | null>(null);
  const projRef = useRef<Projection>('mono');
  useEffect(() => { projRef.current = projection; }, [projection]);

  const getToken = (): string => typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';
  const panoUrl = (s: Scene): string => s.panoramaProxy ? `${s.panoramaProxy}?token=${getToken()}` : s.imageUrl;

  const markersFor = useCallback((sceneId: string) => {
    const hs = dataRef.current.hs[sceneId] ?? [];
    return hs.map((h) => {
      const dir = isDirection(h.type);
      const title = typeof h.content?.title === 'string' ? h.content.title as string : '';
      return {
        id: h.id,
        position: { yaw: `${h.positionYaw}deg`, pitch: `${h.positionPitch}deg` },
        html: dir ? '<div class="psv-hs psv-dir">›</div>' : '<div class="psv-hs psv-info">i</div>',
        anchor: 'center center',
        tooltip: title || (dir ? 'Aller à la scène' : 'Information'),
        data: { dir, targetSceneId: h.targetSceneId, hid: h.id },
      };
    });
  }, []);

  // V3 : transition fondu, aucun overlay de chargement entre scènes.
  const goScene = useCallback(async (sceneId: string) => {
    const s = dataRef.current.scenes.find((x) => x.id === sceneId);
    if (!s || !viewerRef.current) return;
    try {
      await viewerRef.current.setPanorama(panoUrl(s), { showLoader: false, transition: true, panoData: panoDataFor(projRef.current) });
      markersRef.current?.setMarkers(markersFor(sceneId));
      curRef.current = sceneId;
      setCurrentSceneId(sceneId);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersFor]);

  // 1) Données (scènes + hotspots), mêmes endpoints que le viewer existant.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = { headers: { Authorization: `Bearer ${getToken()}` } };
        const [tRes, sRes] = await Promise.all([
          fetch(`/api/projects/${id}/tours/${tourId}`, auth),
          fetch(`/api/projects/${id}/tours/${tourId}/scenes`, auth),
        ]);
        const tData = await tRes.json() as ApiResponse<{ name: string }>;
        const sData = await sRes.json() as ApiResponse<{ scenes: Scene[] }>;
        const list = (sData.data?.scenes ?? []).slice().sort((a, b) => a.position - b.position);
        const entries = await Promise.all(list.map(async (s) => {
          try {
            const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${s.id}/hotspots`, auth);
            const d = await r.json() as ApiResponse<{ hotspots: Hotspot[] }>;
            return [s.id, d.data?.hotspots ?? []] as const;
          } catch { return [s.id, [] as Hotspot[]] as const; }
        }));
        if (cancelled) return;
        const hs = Object.fromEntries(entries);
        dataRef.current = { scenes: list, hs };
        setTourName(tData.data?.name ?? '');
        setScenes(list);
        const initial = list.find((s) => s.isInitial) ?? list[0] ?? null;
        curRef.current = initial?.id ?? null;
        setCurrentSceneId(initial?.id ?? null);
        if (!initial) { setStatus('error'); setErrMsg('Cette visite ne contient aucune scène.'); }
      } catch {
        if (!cancelled) { setStatus('error'); setErrMsg('Chargement des scènes impossible.'); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tourId]);

  // 2) Init PSV une seule fois quand une scène initiale est disponible.
  useEffect(() => {
    if (!currentSceneId || !hostRef.current || viewerRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { Viewer, MarkersPlugin, GyroscopePlugin, StereoPlugin, AutorotatePlugin } = await loadPSV();
        if (cancelled || !hostRef.current) return;
        const s0 = dataRef.current.scenes.find((x) => x.id === curRef.current);
        if (!s0) return;
        const viewer = new Viewer({
          container: hostRef.current,
          panorama: panoUrl(s0),
          panoData: panoDataFor(projRef.current),
          navbar: ['zoom', 'move', 'fullscreen'],
          defaultZoomLvl: 30, minFov: 30, maxFov: 100,
          plugins: [
            [MarkersPlugin, {}],
            [AutorotatePlugin, { autostartDelay: null, autorotateSpeed: '0.3rpm' }],
            [GyroscopePlugin, {}],
            [StereoPlugin, {}],
          ],
        });
        viewerRef.current = viewer;
        const markers = viewer.getPlugin(MarkersPlugin);
        markersRef.current = markers;
        stereoRef.current = viewer.getPlugin(StereoPlugin);
        autoRef.current = viewer.getPlugin(AutorotatePlugin);
        markers.setMarkers(markersFor(curRef.current!));
        markers.addEventListener('select-marker', (e: any) => {
          const d = e?.marker?.config?.data ?? e?.marker?.data;
          if (!d) return;
          if (d.dir && d.targetSceneId) { void goScene(d.targetSceneId); }
          else {
            const hs = dataRef.current.hs[curRef.current ?? ''] ?? [];
            const h = hs.find((x) => x.id === d.hid);
            if (h) setInfo(h);
          }
        });
        try { stereoRef.current?.addEventListener?.('stereo-updated', (e: any) => setVrOn(Boolean(e?.stereoEnabled ?? e?.enabled))); } catch { /* noop */ }
        setStatus('ready');
      } catch {
        if (!cancelled) { setStatus('error'); setErrMsg('Le moteur Photo Sphere Viewer n\'a pas pu se charger (validation en cours).'); }
      }
    })();
    return () => {
      cancelled = true;
      if (viewerRef.current) { try { viewerRef.current.destroy(); } catch { /* noop */ } viewerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSceneId]);

  // V4 : ré-applique la projection en direct sur la scène courante.
  useEffect(() => {
    const s = dataRef.current.scenes.find((x) => x.id === curRef.current);
    if (!s || !viewerRef.current) return;
    try { void viewerRef.current.setPanorama(panoUrl(s), { showLoader: false, transition: false, panoData: panoDataFor(projection) }); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection]);

  const toggleVr = () => { try { stereoRef.current?.toggle(); } catch { /* noop */ } };
  const toggleAuto = () => {
    try {
      if (autorotate) { autoRef.current?.stop(); setAutorotate(false); }
      else { autoRef.current?.start(); setAutorotate(true); }
    } catch { /* noop */ }
  };

  const infoTitle = info && typeof info.content?.title === 'string' ? info.content.title as string : 'Information';
  const infoText = info && typeof info.content?.text === 'string' ? info.content.text as string
    : info && typeof info.content?.url === 'string' ? info.content.url as string : '';

  const chip = (active: boolean): CSSProperties => ({
    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '4px 10px', borderRadius: 9999,
    cursor: 'pointer', border: '1px solid rgba(255,255,255,.18)',
    background: active ? 'rgba(126,240,255,.18)' : 'rgba(255,255,255,.06)',
    color: active ? '#7ef0ff' : '#c7d3e6',
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#05060c' }}>
      <style>{`
        .psv-hs{display:flex;align-items:center;justify-content:center;border-radius:9999px;color:#eaf3ff;font-weight:700;
          background:rgba(255,255,255,.14);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
          border:1.5px solid rgba(255,255,255,.7);box-shadow:0 4px 16px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.35);cursor:pointer;transition:transform .15s}
        .psv-hs:hover{transform:scale(1.12);background:rgba(255,255,255,.28)}
        .psv-dir{width:40px;height:40px;font-size:24px;line-height:1}
        .psv-info{width:28px;height:28px;font-size:15px;font-style:italic;font-family:Georgia,serif}
      `}</style>

      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b flex-wrap" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/projects/${id}/tours/${tourId}/view`} className="text-sm whitespace-nowrap" style={{ color: '#9fb0c9' }}>&larr; Viewer classique</Link>
          <span className="font-bold truncate" style={{ fontFamily: 'Syne, sans-serif', color: '#f4f7fd' }}>{tourName || 'Visite 360°'}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setProjection('mono')} style={chip(projection === 'mono')} title="Panorama monoscopique">Mono</button>
          <button onClick={() => setProjection('ou')} style={chip(projection === 'ou')} title="Stéréo haut/bas (over-under)">Stéréo ⬍</button>
          <button onClick={() => setProjection('sbs')} style={chip(projection === 'sbs')} title="Stéréo côte à côte (side-by-side)">Stéréo ⬌</button>
          <button onClick={toggleAuto} style={chip(autorotate)} title="Rotation automatique">Auto</button>
          <button onClick={toggleVr} style={chip(vrOn)} title="Mode casque VR / cardboard (mobile)">VR</button>
          <span className="text-xs px-2 py-1 rounded-full" style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(124,109,255,.18)', color: '#a493ff' }}>PSV bêta</span>
        </div>
      </header>

      <div className="relative flex-1">
        <div ref={hostRef} className="absolute inset-0" style={{ background: '#000' }} />

        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(5,6,12,.85)' }}>
            {status === 'error' ? (
              <div className="text-center max-w-sm px-6">
                <p className="text-sm mb-3" style={{ color: '#ffb4ab' }}>{errMsg}</p>
                <Link href={`/projects/${id}/tours/${tourId}/view`} className="text-sm underline" style={{ color: '#7ef0ff' }}>Ouvrir le viewer classique</Link>
              </div>
            ) : (
              <span className="text-sm" style={{ color: '#9fb0c9' }}>Chargement du moteur 360…</span>
            )}
          </div>
        )}

        {info && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(5,6,12,.6)' }} onClick={() => setInfo(null)}>
            <div className="rounded-2xl p-5 max-w-md w-full" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', backdropFilter: 'blur(20px)' }} onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#f4f7fd' }}>{infoTitle}</h3>
              {infoText && <p className="text-sm break-words" style={{ color: '#9fb0c9' }}>{infoText}</p>}
              <button onClick={() => setInfo(null)} className="mt-4 w-full rounded-lg py-2 text-sm" style={{ background: 'rgba(255,255,255,.1)', color: '#f4f7fd' }}>Fermer</button>
            </div>
          </div>
        )}
      </div>

      {scenes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' }}>
          {scenes.map((s) => (
            <button key={s.id} onClick={() => void goScene(s.id)}
              className="relative shrink-0 rounded-lg overflow-hidden"
              style={{ width: 96, height: 56, border: s.id === currentSceneId ? '2px solid #7ef0ff' : '1px solid rgba(255,255,255,.18)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" />
              <span className="absolute left-1 bottom-1 text-[10px] px-1 rounded" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
