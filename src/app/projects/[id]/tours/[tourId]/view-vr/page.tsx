'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Viewer 360 §8 : VR WebXR IMMERSIF RÉEL, en three.js pur (route opt-in).
// Contrairement au viewer PSV (qui abstrait le renderer), ici on pilote directement
// WebGLRenderer.xr → vraie session `immersive-vr` (casque Quest / WebXR), pose de tête
// native, contrôleurs, navigation au regard (réticule + dwell). Repli automatique
// (§8.6) : WebXR si dispo → sinon gyroscope mobile → sinon souris/tactile (OrbitControls).
// three.js chargé via <script type="module"> (imports CDN dans une string → le bundler ne
// les résout pas → build Vercel toujours vert, même si le runtime three échoue).
//
// NB recette : l'alignement fin yaw/pitch des hotspots et le comportement sur casque réel
// se valident sur appareil (impossible à tester hors casque). YAW_OFFSET expose le calage.
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { isDirection } from '@/lib/tour';

interface Scene { id: string; name: string; imageUrl: string; isInitial: boolean; position: number; panoramaProxy?: string; previewUrl?: string | null; hidden?: boolean; panoramaType?: string | null; stereoLayout?: string | null; }
interface Hotspot { id: string; type: string; positionYaw: number; positionPitch: number; targetSceneId: string | null; content: Record<string, unknown>; iconColor?: string | null; visible?: boolean; }
interface ApiResponse<T> { data: T; success: boolean; }

const V = '0.160.1';
const PKG = {
  three: `https://esm.sh/three@${V}`,
  vrbutton: `https://esm.sh/three@${V}/examples/jsm/webxr/VRButton.js`,
  orbit: `https://esm.sh/three@${V}/examples/jsm/controls/OrbitControls.js`,
};
const SPHERE_R = 500;
const YAW_OFFSET = 0;        // calage yaw (deg) si décalage vs Pannellum/PSV — à ajuster en recette
const GAZE_DWELL_MS = 1500;  // temps de regard pour déclencher un hotspot en VR

function loadThree(): Promise<any> {
  const w = window as any;
  if (w.__three) return Promise.resolve(w.__three);
  if (w.__threePromise) return w.__threePromise;
  w.__threePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent =
      `import * as THREE from '${PKG.three}';\n` +
      `import { VRButton } from '${PKG.vrbutton}';\n` +
      `import { OrbitControls } from '${PKG.orbit}';\n` +
      `window.__three = { THREE, VRButton, OrbitControls };\n` +
      `window.dispatchEvent(new Event('three-ready'));`;
    window.addEventListener('three-ready', () => resolve(w.__three), { once: true });
    s.onerror = () => reject(new Error('three-load-failed'));
    document.head.appendChild(s);
    setTimeout(() => { if (!w.__three) reject(new Error('three-timeout')); }, 15000);
  });
  return w.__threePromise;
}

// yaw/pitch (degrés) → position sur la sphère (mapping équirectangulaire standard).
function yawPitchToVec3(THREE: any, yaw: number, pitch: number, r: number): any {
  const phi = THREE.MathUtils.degToRad(90 - pitch);
  const theta = THREE.MathUtils.degToRad(yaw + YAW_OFFSET);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

export default function TourViewerVrPage() {
  const params = useParams();
  const id = params.id as string;
  const tourId = params.tourId as string;

  const [tourName, setTourName] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [info, setInfo] = useState<Hotspot | null>(null);
  const [xrSupported, setXrSupported] = useState<boolean | null>(null);
  const [gyroOn, setGyroOn] = useState(false);
  const [invertEyes, setInvertEyes] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const vrBtnRef = useRef<HTMLDivElement>(null);
  const T = useRef<any>(null);                 // module three
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const sphereGroupRef = useRef<any>(null);   // §8 stéréo — contient 1 (mono) ou 2 (par œil) sphères
  const curTexRef = useRef<any>(null);        // texture courante (à libérer au changement)
  const invertEyesRef = useRef(false);
  const hsGroupRef = useRef<any>(null);
  const reticleRef = useRef<any>(null);
  const raycasterRef = useRef<any>(null);
  const controllersRef = useRef<any[]>([]);
  const gazeRef = useRef<{ mesh: any; t: number } | null>(null);
  const dataRef = useRef<{ scenes: Scene[]; hs: Record<string, Hotspot[]> }>({ scenes: [], hs: {} });
  const curRef = useRef<string | null>(null);

  const getToken = (): string => typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';
  const panoUrl = (s: Scene): string => s.panoramaProxy ? `${s.panoramaProxy}?token=${getToken()}` : s.imageUrl;

  // Construit les meshes de hotspots de la scène (disque coloré + repère).
  const buildHotspots = useCallback((sceneId: string) => {
    const THREE = T.current; const grp = hsGroupRef.current;
    if (!THREE || !grp) return;
    while (grp.children.length) { const c = grp.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
    const hs = (dataRef.current.hs[sceneId] ?? []).filter((h) => h.visible !== false);
    for (const h of hs) {
      const dir = isDirection(h.type);
      const color = new THREE.Color(h.iconColor || (dir ? '#7ef0ff' : '#a493ff'));
      const geo = new THREE.CircleGeometry(dir ? 26 : 18, 32);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat);
      const pos = yawPitchToVec3(THREE, h.positionYaw, h.positionPitch, SPHERE_R * 0.9);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);
      mesh.renderOrder = 10;
      mesh.userData = { dir, targetSceneId: h.targetSceneId, hid: h.id, base: (dir ? 26 : 18) };
      grp.add(mesh);
    }
  }, []);

  // §8 — fabrique une sphère équirectangulaire ; si `region` est fourni, les UV ne couvrent
  // qu'une moitié (haut/bas pour TB, gauche/droite pour SBS) → rendu par œil.
  const buildSphere = (THREE: any, tex: any, region: { axis: 'u' | 'v'; offset: number } | null): any => {
    const geo = new THREE.SphereGeometry(SPHERE_R, 64, 40);
    geo.scale(-1, 1, 1);
    if (region) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        let u = uv.getX(i), v = uv.getY(i);
        if (region.axis === 'v') v = region.offset + v * 0.5; else u = region.offset + u * 0.5;
        uv.setXY(i, u, v);
      }
      uv.needsUpdate = true;
    }
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
  };

  // Charge la texture d'une scène et (re)construit la/les sphère(s) selon mono/stéréo.
  const applyScene = useCallback((s: Scene): Promise<void> => new Promise((resolve) => {
    const THREE = T.current; const grp = sphereGroupRef.current;
    if (!THREE || !grp) { resolve(); return; }
    new THREE.TextureLoader().load(panoUrl(s), (tex: any) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      // purge des anciennes sphères + texture
      while (grp.children.length) { const c = grp.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
      curTexRef.current?.dispose?.();
      curTexRef.current = tex;

      const layout = s.stereoLayout === 'SBS' ? 'SBS' : s.stereoLayout === 'TB' ? 'TB' : null;
      const isStereo = s.panoramaType === 'STEREO' && !!layout;
      if (isStereo) {
        const axis: 'u' | 'v' = layout === 'TB' ? 'v' : 'u';
        // TB : œil gauche = moitié HAUTE (offset .5) ; SBS : œil gauche = moitié GAUCHE (offset 0).
        let leftOffset = layout === 'TB' ? 0.5 : 0;
        let rightOffset = layout === 'TB' ? 0 : 0.5;
        if (invertEyesRef.current) { const t = leftOffset; leftOffset = rightOffset; rightOffset = t; }
        const sphereL = buildSphere(THREE, tex, { axis, offset: leftOffset });
        sphereL.layers.set(1);   // three.js : cameraL (œil gauche) voit la couche 1
        const sphereR = buildSphere(THREE, tex, { axis, offset: rightOffset });
        sphereR.layers.set(2);   // cameraR (œil droit) voit la couche 2
        grp.add(sphereL); grp.add(sphereR);
      } else {
        grp.add(buildSphere(THREE, tex, null)); // mono : couche 0 (les deux yeux voient l'identique)
      }
      resolve();
    }, undefined, () => resolve());
  }), []);

  const goScene = useCallback(async (sceneId: string) => {
    const s = dataRef.current.scenes.find((x) => x.id === sceneId);
    if (!s) return;
    await applyScene(s);
    buildHotspots(sceneId);
    curRef.current = sceneId;
    setCurrentSceneId(sceneId);
  }, [applyScene, buildHotspots]);

  const triggerHotspot = useCallback((mesh: any) => {
    const d = mesh?.userData; if (!d) return;
    if (d.dir && d.targetSceneId) { void goScene(d.targetSceneId); }
    else {
      const hs = dataRef.current.hs[curRef.current ?? ''] ?? [];
      const h = hs.find((x) => x.id === d.hid);
      if (h) setInfo(h);
    }
  }, [goScene]);

  // 1) Données (mêmes endpoints que les autres viewers).
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
        dataRef.current = { scenes: list, hs: Object.fromEntries(entries) };
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

  // 2) Init three.js + WebXR une fois la scène initiale connue.
  useEffect(() => {
    if (!currentSceneId || !hostRef.current || rendererRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await loadThree();
        if (cancelled || !hostRef.current) return;
        const { THREE, VRButton, OrbitControls } = mod;
        T.current = THREE;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, hostRef.current.clientWidth / hostRef.current.clientHeight, 0.1, 1100);
        camera.position.set(0, 0, 0.01);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(hostRef.current.clientWidth, hostRef.current.clientHeight);
        renderer.xr.enabled = true;
        hostRef.current.appendChild(renderer.domElement);
        sceneRef.current = scene; cameraRef.current = camera; rendererRef.current = renderer;

        // §8 — groupe de sphères (1 mono, ou 2 par œil pour la stéréo). Construites dans applyScene.
        const sphereGroup = new THREE.Group(); scene.add(sphereGroup); sphereGroupRef.current = sphereGroup;
        // La caméra mono (bureau/gyroscope) voit aussi la couche 1 → prévisualise l'œil gauche d'une scène stéréo.
        camera.layers.enable(1);

        const hsGroup = new THREE.Group(); scene.add(hsGroup); hsGroupRef.current = hsGroup;

        // Réticule de regard (petit anneau devant la caméra en VR).
        const reticle = new THREE.Mesh(
          new THREE.RingGeometry(6, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }),
        );
        reticle.position.set(0, 0, -40); reticle.visible = false; reticle.renderOrder = 20;
        camera.add(reticle); scene.add(camera); reticleRef.current = reticle;

        raycasterRef.current = new THREE.Raycaster();

        // Contrôles souris/tactile (hors VR).
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableZoom = true; controls.enablePan = false; controls.rotateSpeed = -0.3;
        controls.target.set(0, 0, 0); controlsRef.current = controls;

        // Contrôleurs WebXR : trigger = sélection.
        for (let i = 0; i < 2; i++) {
          const c = renderer.xr.getController(i);
          c.addEventListener('selectstart', () => {
            const hit = raycastFromController(c);
            if (hit) triggerHotspot(hit.object);
          });
          scene.add(c); controllersRef.current.push(c);
        }

        function raycastFromController(ctrl: any): any {
          const ray = raycasterRef.current; const THREE2 = T.current;
          const tmpM = new THREE2.Matrix4(); tmpM.identity().extractRotation(ctrl.matrixWorld);
          ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
          ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
          const hits = ray.intersectObjects(hsGroupRef.current.children, false);
          return hits[0] ?? null;
        }

        // Bouton "Entrer en VR" (WebXR) si supporté.
        const xr = (navigator as any).xr;
        let supported = false;
        try { supported = !!(xr && await xr.isSessionSupported?.('immersive-vr')); } catch { supported = false; }
        if (!cancelled) setXrSupported(supported);
        if (supported && vrBtnRef.current) {
          const btn = VRButton.createButton(renderer);
          btn.style.position = 'static'; btn.style.transform = 'none'; btn.style.margin = '0';
          vrBtnRef.current.appendChild(btn);
        }

        // Première scène.
        const s0 = dataRef.current.scenes.find((x) => x.id === curRef.current);
        if (s0) { await applyScene(s0); buildHotspots(s0.id); }

        // Boucle de rendu (compatible XR).
        const clock = new THREE.Clock();
        renderer.setAnimationLoop(() => {
          const dt = clock.getDelta() * 1000;
          if (!renderer.xr.isPresenting) controlsRef.current?.update();
          // Sélection au regard/contrôleur en VR : met en évidence + dwell.
          if (renderer.xr.isPresenting) {
            reticle.visible = true;
            let hit: any = null;
            const ctrl = controllersRef.current.find((c) => c.visible);
            if (ctrl) hit = raycastFromController(ctrl);
            if (!hit) {
              // regard : rayon depuis la caméra vers l'avant
              const ray = raycasterRef.current;
              const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
              ray.ray.origin.setFromMatrixPosition(camera.matrixWorld);
              ray.ray.direction.copy(dir);
              hit = ray.intersectObjects(hsGroup.children, false)[0] ?? null;
            }
            // reset scale des hotspots
            for (const m of hsGroup.children) m.scale.setScalar(1);
            if (hit) {
              hit.object.scale.setScalar(1.25);
              if (gazeRef.current && gazeRef.current.mesh === hit.object) {
                gazeRef.current.t += dt;
                if (gazeRef.current.t >= GAZE_DWELL_MS) { const m = hit.object; gazeRef.current = null; triggerHotspot(m); }
              } else gazeRef.current = { mesh: hit.object, t: 0 };
            } else gazeRef.current = null;
          } else {
            reticle.visible = false; gazeRef.current = null;
          }
          renderer.render(scene, camera);
        });

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) { setStatus('error'); setErrMsg("Le moteur 3D (WebXR) n'a pas pu se charger."); }
      }
    })();
    return () => {
      cancelled = true;
      try { rendererRef.current?.setAnimationLoop(null); rendererRef.current?.dispose?.(); } catch { /* noop */ }
      try { if (rendererRef.current?.domElement && hostRef.current?.contains(rendererRef.current.domElement)) hostRef.current.removeChild(rendererRef.current.domElement); } catch { /* noop */ }
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSceneId]);

  // Redimensionnement.
  useEffect(() => {
    const onResize = () => {
      const r = rendererRef.current, c = cameraRef.current, h = hostRef.current;
      if (!r || !c || !h) return;
      c.aspect = h.clientWidth / h.clientHeight; c.updateProjectionMatrix();
      r.setSize(h.clientWidth, h.clientHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Clic hors VR : sélection d'un hotspot (souris/tactile).
  const onCanvasClick = (e: ReactMouseEvent) => {
    const THREE = T.current, r = rendererRef.current, cam = cameraRef.current, ray = raycasterRef.current;
    if (!THREE || !r || !cam || !ray || r.xr.isPresenting) return;
    const rect = r.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(hsGroupRef.current.children, false)[0];
    if (hit) triggerHotspot(hit.object);
  };

  const gyroHandlerRef = useRef<((ev: any) => void) | null>(null);
  // §8.6 — repli gyroscope (mobile) : oriente la caméra via l'orientation de l'appareil.
  const toggleGyro = () => {
    const THREE = T.current, cam = cameraRef.current, controls = controlsRef.current;
    if (!THREE || !cam) return;
    if (gyroOn) {
      window.removeEventListener('deviceorientation', gyroHandlerRef.current as any);
      if (controls) controls.enabled = true;
      setGyroOn(false); return;
    }
    const start = () => {
      if (controls) controls.enabled = false;
      const zee = new THREE.Vector3(0, 0, 1);
      const q0 = new THREE.Quaternion();
      const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
      const euler = new THREE.Euler();
      const handler = (ev: any) => {
        const a = ev.alpha ? THREE.MathUtils.degToRad(ev.alpha) : 0;
        const b = ev.beta ? THREE.MathUtils.degToRad(ev.beta) : 0;
        const g = ev.gamma ? THREE.MathUtils.degToRad(ev.gamma) : 0;
        const orient = THREE.MathUtils.degToRad((window.screen?.orientation?.angle) ?? 0);
        euler.set(b, a, -g, 'YXZ');
        cam.quaternion.setFromEuler(euler);
        cam.quaternion.multiply(q1);
        cam.quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
      };
      gyroHandlerRef.current = handler;
      window.addEventListener('deviceorientation', handler, true);
      setGyroOn(true);
    };
    const dm = (window as any).DeviceOrientationEvent;
    if (dm && typeof dm.requestPermission === 'function') {
      dm.requestPermission().then((p: string) => { if (p === 'granted') start(); }).catch(() => { /* refusé */ });
    } else start();
  };

  // §8 — inverser les yeux (utile si le relief est inversé sur le casque).
  const toggleInvertEyes = () => {
    const next = !invertEyesRef.current;
    invertEyesRef.current = next; setInvertEyes(next);
    const s = dataRef.current.scenes.find((x) => x.id === curRef.current);
    if (s) void applyScene(s);
  };
  const curScene = scenes.find((s) => s.id === currentSceneId);
  const curStereo = curScene?.panoramaType === 'STEREO' && (curScene?.stereoLayout === 'TB' || curScene?.stereoLayout === 'SBS');

  const infoTitle = info && typeof info.content?.title === 'string' ? info.content.title as string : 'Information';
  const infoText = info && typeof info.content?.text === 'string' ? info.content.text as string
    : info && typeof info.content?.url === 'string' ? info.content.url as string : '';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#05060c' }}>
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b flex-wrap" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/projects/${id}/tours/${tourId}/view`} className="text-sm whitespace-nowrap" style={{ color: '#9fb0c9' }}>&larr; Viewer classique</Link>
          <Link href={`/projects/${id}/tours/${tourId}/view-psv`} className="text-sm whitespace-nowrap" style={{ color: '#9fb0c9' }}>PSV</Link>
          <span className="font-bold truncate" style={{ fontFamily: 'Syne, sans-serif', color: '#f4f7fd' }}>{tourName || 'Visite 360° — VR'}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div ref={vrBtnRef} />
          {curStereo && (
            <button onClick={toggleInvertEyes} className="text-xs px-3 py-1.5 rounded-full" style={{ fontFamily: 'JetBrains Mono, monospace', background: invertEyes ? 'rgba(126,240,255,.18)' : 'rgba(255,255,255,.06)', color: invertEyes ? '#7ef0ff' : '#c7d3e6', border: '1px solid rgba(255,255,255,.18)' }} title="Inverser œil gauche/droit (si le relief est inversé)">Inverser les yeux</button>
          )}
          {curStereo && (
            <span className="text-xs px-2 py-1 rounded-full" style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(52,211,153,.16)', color: '#34d399' }} title={`Stéréo ${curScene?.stereoLayout}`}>Stéréo {curScene?.stereoLayout}</span>
          )}
          {xrSupported === false && (
            <button onClick={toggleGyro} className="text-xs px-3 py-1.5 rounded-full" style={{ fontFamily: 'JetBrains Mono, monospace', background: gyroOn ? 'rgba(126,240,255,.18)' : 'rgba(255,255,255,.06)', color: gyroOn ? '#7ef0ff' : '#c7d3e6', border: '1px solid rgba(255,255,255,.18)' }} title="Repli gyroscope (mobile)">Gyroscope</button>
          )}
          <span className="text-xs px-2 py-1 rounded-full" style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(124,109,255,.18)', color: '#a493ff' }}>WebXR bêta</span>
        </div>
      </header>

      <div className="relative flex-1">
        <div ref={hostRef} onClick={onCanvasClick} className="absolute inset-0" style={{ background: '#000', touchAction: 'none' }} />

        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(5,6,12,.85)' }}>
            {status === 'error' ? (
              <div className="text-center max-w-sm px-6">
                <p className="text-sm mb-3" style={{ color: '#ffb4ab' }}>{errMsg}</p>
                <Link href={`/projects/${id}/tours/${tourId}/view`} className="text-sm underline" style={{ color: '#7ef0ff' }}>Ouvrir le viewer classique</Link>
              </div>
            ) : (
              <span className="text-sm" style={{ color: '#9fb0c9' }}>Préparation de la scène 3D…</span>
            )}
          </div>
        )}

        {status === 'ready' && xrSupported === false && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-full px-3 py-1.5" style={{ background: 'rgba(5,6,12,.7)', backdropFilter: 'blur(8px)' }}>
            <span className="text-xs" style={{ color: '#9fb0c9' }}>WebXR indisponible sur cet appareil — glissez pour explorer, « Gyroscope » sur mobile.</span>
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
          {scenes.filter((s) => !s.hidden).map((s) => (
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
