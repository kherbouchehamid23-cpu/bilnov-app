'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { isIfc } from '@/lib/bim';
import { bimLocationMetadata, cameraState } from '@/lib/bim';

interface Props {
  fileId: string; fileName: string; token: string;
  projectId?: string | null; canComment?: boolean; onClose: () => void;
}
interface Selected { expressId?: number; globalId?: string; ifcClass?: string; name?: string }

const WEB_IFC_VERSION = '0.0.57';

// Viewer 3D / IFC-BIM (web-ifc + Three.js) + AR (WebXR). Additif : n'ouvre que
// les fichiers IFC/GLB/GLTF/OBJ. Consultation, sélection d'objet, commentaire localisé.
export default function Model3DViewer({ fileId, fileName, token, projectId, canComment = false, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const st = useRef<any>({ meshes: [] });
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('Chargement…');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [arSupported, setArSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let disposed = false;
    (async () => {
      const cont = containerRef.current; if (!cont) return;
      const THREE: any = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js') as any;
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf1f5f9);
      const camera = new THREE.PerspectiveCamera(60, cont.clientWidth / cont.clientHeight, 0.01, 100000);
      camera.position.set(10, 10, 10);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(cont.clientWidth, cont.clientHeight); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.xr.enabled = true;
      cont.appendChild(renderer.domElement);
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(1, 2, 1.5); scene.add(dl);
      const controls = new OrbitControls(camera, renderer.domElement);
      const raycaster = new THREE.Raycaster(); const v2 = new THREE.Vector2();
      st.current = { THREE, scene, camera, renderer, controls, raycaster, v2, meshes: [], ifcApi: null, modelID: -1 };

      const nav = navigator as any;
      if (nav.xr?.isSessionSupported) { try { setArSupported(await nav.xr.isSessionSupported('immersive-ar')); } catch { /* noop */ } }

      const onResize = () => { if (!containerRef.current) return; const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
      window.addEventListener('resize', onResize);
      st.current.onResize = onResize;

      setPhase('Téléchargement…');
      const res = await fetch(`/api/file-proxy/${fileId}?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error('Téléchargement impossible');
      const buf = await res.arrayBuffer();
      if (disposed) return;

      if (isIfc(fileName)) {
        setPhase('Analyse IFC…');
        const WebIFC: any = await import('web-ifc');
        const api = new WebIFC.IfcAPI();
        api.SetWasmPath(`https://unpkg.com/web-ifc@${WEB_IFC_VERSION}/`, true);
        await api.Init();
        const modelID = api.OpenModel(new Uint8Array(buf));
        st.current.ifcApi = api; st.current.modelID = modelID;
        api.StreamAllMeshes(modelID, (flatMesh: any) => {
          const placed = flatMesh.geometries;
          for (let i = 0; i < placed.size(); i++) {
            const pg = placed.get(i);
            const g = api.GetGeometry(modelID, pg.geometryExpressID);
            const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
            const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
            const n = verts.length / 6;
            const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
            for (let v = 0; v < n; v++) { pos[v * 3] = verts[v * 6]; pos[v * 3 + 1] = verts[v * 6 + 1]; pos[v * 3 + 2] = verts[v * 6 + 2]; nor[v * 3] = verts[v * 6 + 3]; nor[v * 3 + 1] = verts[v * 6 + 4]; nor[v * 3 + 2] = verts[v * 6 + 5]; }
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            geom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
            const c = pg.color;
            const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(c.x, c.y, c.z), transparent: c.w < 1, opacity: c.w, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.matrix.fromArray(pg.flatTransformation); mesh.matrixAutoUpdate = false;
            mesh.userData.expressID = flatMesh.expressID;
            scene.add(mesh); st.current.meshes.push(mesh);
          }
        });
      } else {
        setPhase('Chargement du modèle…');
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.obj')) {
          const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js') as any;
          const obj = new OBJLoader().parse(new TextDecoder().decode(new Uint8Array(buf)));
          scene.add(obj); st.current.meshes.push(obj);
        } else {
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js') as any;
          const gltf: any = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
          scene.add(gltf.scene); st.current.meshes.push(gltf.scene);
        }
      }
      if (disposed) return;

      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3()).length() || 10;
      const center = box.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).multiplyScalar(size * 0.7));
      camera.near = size / 1000; camera.far = size * 20; camera.updateProjectionMatrix(); controls.update();

      renderer.setAnimationLoop(() => renderer.render(scene, camera));
      setLoading(false); setPhase('');

      const onClick = (ev: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        v2.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(v2, camera);
        const hits = raycaster.intersectObjects(st.current.meshes, true);
        if (hits.length === 0) { setSelected(null); return; }
        const obj: any = hits[0].object;
        const eid = obj.userData?.expressID;
        if (eid != null && st.current.ifcApi) {
          try {
            const line = st.current.ifcApi.GetLine(st.current.modelID, eid);
            setSelected({ expressId: eid, globalId: line?.GlobalId?.value, ifcClass: line?.constructor?.name || line?.type });
          } catch { setSelected({ expressId: eid }); }
        } else setSelected({ name: obj.name || 'Objet 3D' });
      };
      renderer.domElement.addEventListener('click', onClick);
      st.current.onClick = onClick;
    })().catch((e) => { if (!disposed) { setError(e instanceof Error ? e.message : 'Erreur de lecture'); setLoading(false); } });

    return () => {
      disposed = true; const s = st.current;
      try {
        window.removeEventListener('resize', s.onResize);
        s.renderer?.setAnimationLoop?.(null);
        s.renderer?.domElement?.removeEventListener?.('click', s.onClick);
        s.ifcApi?.CloseModel?.(s.modelID);
        s.renderer?.dispose?.();
        if (s.renderer?.domElement?.parentNode) s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
      } catch { /* noop */ }
    };
  }, [fileId, fileName, token]);

  async function enterAR() {
    const s = st.current; if (!s?.renderer) return;
    try {
      const { ARButton } = await import('three/examples/jsm/webxr/ARButton.js') as any;
      const btn = ARButton.createButton(s.renderer);
      document.body.appendChild(btn); btn.click(); setTimeout(() => btn.remove(), 500);
    } catch { setError('Réalité augmentée indisponible sur cet appareil.'); }
  }

  async function commentObject() {
    if (!projectId || !selected) return;
    setBusy(true); setSaved('');
    try {
      const s = st.current;
      const cam = cameraState(
        { x: s.camera.position.x, y: s.camera.position.y, z: s.camera.position.z },
        { x: s.controls.target.x, y: s.controls.target.y, z: s.controls.target.z },
      );
      const metadata = bimLocationMetadata({ bimModelId: fileId, globalId: selected.globalId, expressId: selected.expressId, ifcClass: selected.ifcClass, camera: cam });
      const r = await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'OBSERVATION', description: `Observation sur ${selected.ifcClass ?? 'objet'} ${selected.globalId ?? selected.expressId ?? ''}`.trim(),
          locations: [{ locationType: 'BIM_IFC', resourceType: 'file', resourceId: fileId, title: selected.ifcClass ?? 'Objet BIM', metadata }],
        }),
      });
      if (!r.ok) throw new Error('Création refusée');
      setSaved('Commentaire créé sur cet objet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
        <span className="truncate text-sm font-medium max-w-[45%]">{fileName}</span>
        <div className="flex items-center gap-1.5">
          {arSupported && <button onClick={() => void enterAR()} className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20">📱 Voir en AR</button>}
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={onClose}>Fermer</button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {selected && (
          <div className="absolute right-3 top-3 w-64 rounded-lg bg-white/95 p-3 shadow-lg">
            <p className="text-xs font-semibold text-slate-800">{selected.ifcClass || selected.name || 'Objet'}</p>
            {selected.globalId && <p className="mt-1 break-all text-[10px] text-slate-500">GlobalId : {selected.globalId}</p>}
            {selected.expressId != null && <p className="text-[10px] text-slate-500">Express ID : {selected.expressId}</p>}
            {canComment && projectId && <button disabled={busy} onClick={() => void commentObject()} className="mt-2 w-full rounded bg-violet-600 py-1 text-xs text-white disabled:opacity-40">💬 Commenter cet objet</button>}
            {saved && <p className="mt-1 text-[10px] text-emerald-600">{saved}</p>}
          </div>
        )}
        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white">
            {error ? (
              <div className="max-w-md px-6 text-center">
                <p className="mb-2 text-red-400">Impossible d&apos;afficher le modèle</p>
                <p className="text-sm text-slate-300">{error}</p>
                <button onClick={onClose} className="mt-4 rounded-md bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">Fermer</button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" /><p className="text-sm">{phase}</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
