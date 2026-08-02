'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — §4 (viewer PUBLIC) : sélecteur de modes de lecture immersifs, RÉEL.
// Superposition (overlay) montée UNIQUEMENT quand un visiteur choisit « VR Box » ou
// « WebXR / Meta Quest » depuis le viewer public. Le chemin Pannellum par défaut de la page
// publique n'est JAMAIS modifié (zéro régression par construction : ce composant est additif
// et démonté au retour). Moteur three.js pur, chargé à la demande depuis le CDN (le bundler ne
// résout pas ces imports en string → build Vercel toujours vert, même si le runtime échoue).
//
// Modes :
//   • Panorama 360°       — navigation mono/stéréo (un œil) souris/tactile/gyroscope.
//   • VR Box (cardboard)  — écran séparé gauche/droite + suivi de tête (deviceorientation) +
//                           plein écran, pour téléphone glissé dans un casque carton.
//   • WebXR / Meta Quest  — vraie session immersive-vr (bouton « Entrer »), affichée seulement
//                           si l'appareil la supporte (navigator.xr.isSessionSupported).
//
// Stéréo : sphère dédoublée par œil (couche 1 = gauche, couche 2 = droit) — convention alignée
// sur THREE.StereoCamera (cardboard) ET WebXRManager (casque), donc le relief est correct dans
// les deux cas. Mono : sphère couche 0 (les deux yeux voient l'identique).
import { useEffect, useRef, useState, useCallback } from 'react';
import { isDirection } from '@/lib/tour';

export interface ImmersiveScene {
  id: string;
  name: string;
  imageUrl: string;
  previewUrl?: string | null;
  panoramaType?: string | null;
  stereoLayout?: string | null;
  hotspots: { id: string; type: string; positionYaw: number; positionPitch: number; targetSceneId: string | null; content: Record<string, unknown> }[];
}

interface Props {
  scenes: ImmersiveScene[];
  initialSceneId: string | null;
  initialMode: 'vrbox' | 'webxr';
  onClose: () => void;
}

const V = '0.160.1';
const PKG = {
  three: `https://esm.sh/three@${V}`,
  vrbutton: `https://esm.sh/three@${V}/examples/jsm/webxr/VRButton.js`,
  orbit: `https://esm.sh/three@${V}/examples/jsm/controls/OrbitControls.js`,
};
const SPHERE_R = 500;
const YAW_OFFSET = 0;
const GAZE_DWELL_MS = 1500;

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

const panoUrl = (s: ImmersiveScene): string => s.previewUrl || s.imageUrl;

export default function PublicImmersiveViewer({ scenes, initialSceneId, initialMode, onClose }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(initialSceneId ?? scenes[0]?.id ?? null);
  const [info, setInfo] = useState<ImmersiveScene['hotspots'][number] | null>(null);
  const [xrSupported, setXrSupported] = useState<boolean | null>(null);
  const [cardboard, setCardboard] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const vrBtnRef = useRef<HTMLDivElement>(null);
  const T = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const stereoCamRef = useRef<any>(null);
  const sphereGroupRef = useRef<any>(null);
  const curTexRef = useRef<any>(null);
  const hsGroupRef = useRef<any>(null);
  const reticleRef = useRef<any>(null);
  const raycasterRef = useRef<any>(null);
  const controllersRef = useRef<any[]>([]);
  const gazeRef = useRef<{ mesh: any; t: number } | null>(null);
  const cardboardRef = useRef(false);
  const gyroHandlerRef = useRef<((ev: any) => void) | null>(null);
  const curRef = useRef<string | null>(initialSceneId ?? scenes[0]?.id ?? null);
  const dataRef = useRef<ImmersiveScene[]>(scenes);
  useEffect(() => { dataRef.current = scenes; }, [scenes]);
  useEffect(() => { cardboardRef.current = cardboard; }, [cardboard]);

  // Construit les meshes de hotspots de la scène (disque coloré, orienté vers le centre).
  const buildHotspots = useCallback((sceneId: string) => {
    const THREE = T.current; const grp = hsGroupRef.current;
    if (!THREE || !grp) return;
    while (grp.children.length) { const c = grp.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
    const s = dataRef.current.find((x) => x.id === sceneId);
    const hs = (s?.hotspots ?? []);
    for (const h of hs) {
      const dir = isDirection(h.type) && !!h.targetSceneId;
      const col = typeof h.content?.iconColor === 'string' ? h.content.iconColor as string : (dir ? '#7ef0ff' : '#a493ff');
      const color = new THREE.Color(col);
      const geo = new THREE.CircleGeometry(dir ? 26 : 18, 32);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat);
      const pos = yawPitchToVec3(THREE, h.positionYaw, h.positionPitch, SPHERE_R * 0.9);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);
      mesh.renderOrder = 10;
      mesh.layers.enableAll(); // visible par les deux yeux (couches 0/1/2)
      mesh.userData = { dir, targetSceneId: h.targetSceneId, hid: h.id };
      grp.add(mesh);
    }
  }, []);

  // Sphère équirectangulaire ; `region` → n'utilise qu'une moitié des UV (rendu par œil).
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

  const applyScene = useCallback((s: ImmersiveScene): Promise<void> => new Promise((resolve) => {
    const THREE = T.current; const grp = sphereGroupRef.current;
    if (!THREE || !grp) { resolve(); return; }
    new THREE.TextureLoader().load(panoUrl(s), (tex: any) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      while (grp.children.length) { const c = grp.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
      curTexRef.current?.dispose?.();
      curTexRef.current = tex;
      const layout = (s.stereoLayout || '').toUpperCase();
      const lay = layout === 'SBS' || layout === 'LR' ? 'SBS' : layout === 'TB' || layout === 'OU' ? 'TB' : null;
      const isStereo = (s.panoramaType || '').toUpperCase() === 'STEREO' && !!lay;
      if (isStereo) {
        const axis: 'u' | 'v' = lay === 'TB' ? 'v' : 'u';
        const leftOffset = lay === 'TB' ? 0.5 : 0;   // TB : œil gauche = moitié haute ; SBS : moitié gauche
        const rightOffset = lay === 'TB' ? 0 : 0.5;
        const sphereL = buildSphere(THREE, tex, { axis, offset: leftOffset }); sphereL.layers.set(1);
        const sphereR = buildSphere(THREE, tex, { axis, offset: rightOffset }); sphereR.layers.set(2);
        grp.add(sphereL); grp.add(sphereR);
      } else {
        grp.add(buildSphere(THREE, tex, null));
      }
      resolve();
    }, undefined, () => resolve());
  }), []);

  const goScene = useCallback(async (sceneId: string) => {
    const s = dataRef.current.find((x) => x.id === sceneId);
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
      const s = dataRef.current.find((x) => x.id === curRef.current);
      const h = (s?.hotspots ?? []).find((x) => x.id === d.hid);
      if (h) setInfo(h);
    }
  }, [goScene]);

  // Init three.js (une fois). Réutilise la logique éprouvée du viewer VR interne.
  useEffect(() => {
    if (!hostRef.current || rendererRef.current) return;
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

        const sphereGroup = new THREE.Group(); scene.add(sphereGroup); sphereGroupRef.current = sphereGroup;
        camera.layers.enable(1); // en mono/plat, la caméra voit aussi l'œil gauche d'une scène stéréo
        const hsGroup = new THREE.Group(); scene.add(hsGroup); hsGroupRef.current = hsGroup;

        const stereoCam = new THREE.StereoCamera(); stereoCam.aspect = 0.5; stereoCamRef.current = stereoCam;

        const reticle = new THREE.Mesh(
          new THREE.RingGeometry(6, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }),
        );
        reticle.position.set(0, 0, -40); reticle.visible = false; reticle.renderOrder = 20; reticle.layers.enableAll();
        camera.add(reticle); scene.add(camera); reticleRef.current = reticle;
        raycasterRef.current = new THREE.Raycaster();

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableZoom = true; controls.enablePan = false; controls.rotateSpeed = -0.3;
        controls.target.set(0, 0, 0); controlsRef.current = controls;

        for (let i = 0; i < 2; i++) {
          const c = renderer.xr.getController(i);
          c.addEventListener('selectstart', () => { const hit = raycastFromController(c); if (hit) triggerHotspot(hit.object); });
          scene.add(c); controllersRef.current.push(c);
        }
        function raycastFromController(ctrl: any): any {
          const ray = raycasterRef.current; const THREE2 = T.current;
          const tmpM = new THREE2.Matrix4(); tmpM.identity().extractRotation(ctrl.matrixWorld);
          ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
          ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
          return ray.intersectObjects(hsGroupRef.current.children, false)[0] ?? null;
        }

        // Support WebXR ?
        const xr = (navigator as any).xr;
        let supported = false;
        try { supported = !!(xr && await xr.isSessionSupported?.('immersive-vr')); } catch { supported = false; }
        if (!cancelled) setXrSupported(supported);
        if (supported && vrBtnRef.current) {
          const btn = VRButton.createButton(renderer);
          btn.style.position = 'static'; btn.style.transform = 'none'; btn.style.margin = '0';
          vrBtnRef.current.appendChild(btn);
        }

        const s0 = dataRef.current.find((x) => x.id === curRef.current) ?? dataRef.current[0];
        if (s0) { curRef.current = s0.id; await applyScene(s0); buildHotspots(s0.id); }

        const clock = new THREE.Clock();
        renderer.setAnimationLoop(() => {
          const dt = clock.getDelta() * 1000;
          const presenting = renderer.xr.isPresenting;
          if (!presenting) controlsRef.current?.update();

          // Sélection au regard (VR / cardboard) : réticule + temps de fixation (dwell).
          const immersive = presenting || cardboardRef.current;
          reticle.visible = immersive;
          if (immersive) {
            const ray = raycasterRef.current;
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
            ray.ray.origin.setFromMatrixPosition(camera.matrixWorld);
            ray.ray.direction.copy(dir);
            let hit: any = null;
            const ctrl = controllersRef.current.find((c) => c.visible);
            if (presenting && ctrl) { hit = raycastFromController(ctrl); }
            if (!hit) hit = ray.intersectObjects(hsGroup.children, false)[0] ?? null;
            for (const m of hsGroup.children) m.scale.setScalar(1);
            if (hit) {
              hit.object.scale.setScalar(1.25);
              if (gazeRef.current && gazeRef.current.mesh === hit.object) {
                gazeRef.current.t += dt;
                if (gazeRef.current.t >= GAZE_DWELL_MS) { const m = hit.object; gazeRef.current = null; triggerHotspot(m); }
              } else gazeRef.current = { mesh: hit.object, t: 0 };
            } else gazeRef.current = null;
          } else {
            gazeRef.current = null;
          }

          // Rendu : WebXR piloté par three ; cardboard = double viewport (StereoCamera) ; sinon mono.
          if (presenting) {
            renderer.render(scene, camera);
          } else if (cardboardRef.current) {
            camera.updateWorldMatrix(true, false);
            const sc = stereoCamRef.current; sc.update(camera);
            const size = renderer.getSize(new THREE.Vector2());
            renderer.setScissorTest(true);
            renderer.setScissor(0, 0, size.width / 2, size.height);
            renderer.setViewport(0, 0, size.width / 2, size.height);
            renderer.render(scene, sc.cameraL);
            renderer.setScissor(size.width / 2, 0, size.width / 2, size.height);
            renderer.setViewport(size.width / 2, 0, size.width / 2, size.height);
            renderer.render(scene, sc.cameraR);
            renderer.setScissorTest(false);
          } else {
            renderer.render(scene, camera);
          }
        });

        if (!cancelled) {
          setStatus('ready');
          if (initialMode === 'vrbox') { setTimeout(() => enterCardboard(), 0); }
        }
      } catch {
        if (!cancelled) { setStatus('error'); setErrMsg("Le moteur 3D (WebXR) n'a pas pu se charger."); }
      }
    })();
    return () => {
      cancelled = true;
      try { window.removeEventListener('deviceorientation', gyroHandlerRef.current as any); } catch { /* noop */ }
      try { rendererRef.current?.setAnimationLoop(null); rendererRef.current?.dispose?.(); } catch { /* noop */ }
      try { if (rendererRef.current?.domElement && hostRef.current?.contains(rendererRef.current.domElement)) hostRef.current.removeChild(rendererRef.current.domElement); } catch { /* noop */ }
      try { curTexRef.current?.dispose?.(); } catch { /* noop */ }
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Clic (souris/tactile) hors immersion : sélection d'un hotspot.
  const onCanvasClick = (e: React.MouseEvent) => {
    const THREE = T.current, r = rendererRef.current, cam = cameraRef.current, ray = raycasterRef.current;
    if (!THREE || !r || !cam || !ray || r.xr.isPresenting || cardboardRef.current) return;
    const rect = r.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(hsGroupRef.current.children, false)[0];
    if (hit) triggerHotspot(hit.object);
  };

  // Gyroscope (deviceorientation) — nécessaire pour le mode VR Box (suivi de tête).
  const startGyro = useCallback(() => {
    const THREE = T.current, cam = cameraRef.current, controls = controlsRef.current;
    if (!THREE || !cam || gyroHandlerRef.current) return;
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
  }, []);

  const stopGyro = useCallback(() => {
    if (gyroHandlerRef.current) { window.removeEventListener('deviceorientation', gyroHandlerRef.current as any); gyroHandlerRef.current = null; }
    if (controlsRef.current) controlsRef.current.enabled = true;
    setGyroOn(false);
  }, []);

  const requestGyroPermission = useCallback((): Promise<boolean> => {
    const dm = (window as any).DeviceOrientationEvent;
    if (dm && typeof dm.requestPermission === 'function') {
      return dm.requestPermission().then((p: string) => p === 'granted').catch(() => false);
    }
    return Promise.resolve(true);
  }, []);

  const toggleGyro = () => {
    if (gyroOn) { stopGyro(); return; }
    void requestGyroPermission().then((ok) => { if (ok) startGyro(); });
  };

  const enterCardboard = useCallback(() => {
    void requestGyroPermission().then((ok) => {
      if (ok) startGyro();
      try { if (!document.fullscreenElement) void hostRef.current?.parentElement?.requestFullscreen?.(); } catch { /* noop */ }
      cardboardRef.current = true; setCardboard(true);
    });
  }, [requestGyroPermission, startGyro]);

  const exitCardboard = useCallback(() => {
    cardboardRef.current = false; setCardboard(false);
    stopGyro();
    const r = rendererRef.current, h = hostRef.current;
    if (r && h) { r.setViewport(0, 0, h.clientWidth, h.clientHeight); r.setScissorTest(false); }
    try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* noop */ }
  }, [stopGyro]);

  const enterWebXR = () => { try { (vrBtnRef.current?.querySelector('button') as HTMLButtonElement | null)?.click(); } catch { /* noop */ } };

  const curScene = scenes.find((s) => s.id === currentSceneId) ?? null;
  const infoTitle = info && typeof info.content?.title === 'string' ? info.content.title as string : 'Information';
  const infoText = info && typeof info.content?.text === 'string' ? info.content.text as string : '';
  const infoUrl = info && typeof info.content?.url === 'string' ? info.content.url as string : '';

  const chipCls = (active: boolean) => `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-violet-600 text-white' : 'bg-white/10 text-stone-200 hover:bg-white/20'}`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: '#05060c' }}>
      <div ref={hostRef} onClick={onCanvasClick} className="absolute inset-0" style={{ background: '#000', touchAction: 'none' }} />

      {/* Ligne de séparation centrale en mode cardboard (repère visuel). */}
      {cardboard && <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2" style={{ background: 'rgba(255,255,255,.25)' }} />}

      {/* Barre supérieure — sélecteur de modes. Masquée pendant le cardboard (écran dédoublé). */}
      {!cardboard && (
        <div className="absolute top-3 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-full bg-black/70 px-2 py-1.5">
          <button onClick={onClose} className={chipCls(false)} title="Revenir au panorama classique">✕ Fermer</button>
          <span className="mx-1 hidden text-xs text-stone-500 sm:inline">|</span>
          <button onClick={() => { exitCardboard(); }} className={chipCls(!cardboard)} title="Panorama 360°">Panorama 360°</button>
          <button onClick={() => enterCardboard()} className={chipCls(false)} title="Casque carton (écran dédoublé + gyroscope)">VR Box</button>
          {xrSupported && <button onClick={enterWebXR} className={chipCls(false)} title="Casque WebXR / Meta Quest">WebXR / Meta Quest</button>}
          <button onClick={toggleGyro} className={chipCls(gyroOn)} title="Gyroscope (mobile)">🧭</button>
        </div>
      )}

      {/* Nom de la scène. */}
      {curScene && !cardboard && (
        <div className="absolute top-16 left-4 z-20 rounded-lg bg-black/60 px-3 py-1 text-sm text-white sm:top-4">{curScene.name}</div>
      )}

      {/* Bouton WebXR natif (créé par three) — gardé hors écran mais cliquable via enterWebXR. */}
      <div ref={vrBtnRef} className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden />

      {/* Quitter le mode cardboard (bouton discret toujours accessible). */}
      {cardboard && (
        <button onClick={exitCardboard} className="absolute top-2 right-2 z-30 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">Quitter VR Box</button>
      )}

      {/* Barre de scènes (navigation) hors immersion. */}
      {!cardboard && scenes.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full bg-black/70 px-2 py-1.5">
          {scenes.map((s) => (
            <button key={s.id} onClick={() => void goScene(s.id)} title={s.name}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${s.id === currentSceneId ? 'bg-violet-600 text-white' : 'bg-white/10 text-stone-200 hover:bg-white/20'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {status !== 'ready' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ background: 'rgba(5,6,12,.9)' }}>
          {status === 'error' ? (
            <div className="max-w-sm px-6 text-center">
              <p className="mb-3 text-sm text-red-300">{errMsg}</p>
              <button onClick={onClose} className="text-sm text-violet-300 underline">Revenir au panorama classique</button>
            </div>
          ) : (
            <span className="text-sm text-stone-400">Préparation de la scène 3D…</span>
          )}
        </div>
      )}

      {info && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(5,6,12,.6)' }} onClick={() => setInfo(null)}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', backdropFilter: 'blur(20px)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-bold text-white">{infoTitle}</h3>
            {infoText && <p className="text-sm text-stone-300">{infoText}</p>}
            {infoUrl && <a href={infoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">Ouvrir</a>}
            <button onClick={() => setInfo(null)} className="mt-4 w-full rounded-lg py-2 text-sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
