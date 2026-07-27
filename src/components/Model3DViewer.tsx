'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { isIfc, bimLocationMetadata, cameraState } from '@/lib/bim';

interface Props {
  fileId: string; fileName: string; token: string;
  projectId?: string | null; canComment?: boolean; onClose: () => void;
}
interface Selected { expressId?: number; globalId?: string; ifcClass?: string; name?: string; props?: [string, string][] }

const WEB_IFC_VERSION = '0.0.57';
const AXES: Record<string, [number, number, number]> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export default function Model3DViewer({ fileId, fileName, token, projectId, canComment = false, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const st = useRef<any>({ meshes: [], byId: new Map() });
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('Chargement…');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [arSupported, setArSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [section, setSection] = useState<{ axis: 'x' | 'y' | 'z' | null; t: number; flip: boolean }>({ axis: null, t: 0.5, flip: false });

  // Restauration de scène (« Voir dans la maquette BIM ») via ?bimExpress=
  const restoreExpress = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = new URLSearchParams(window.location.search).get('bimExpress');
    restoreExpress.current = v ? Number(v) : null;
  }, []);

  async function ifcProps(eid: number): Promise<Selected> {
    const api = st.current.ifcApi, modelID = st.current.modelID;
    let ifcClass = '', globalId: string | undefined; const props: [string, string][] = [];
    try { const t = api.GetLineType(modelID, eid); ifcClass = api.GetNameFromTypeCode ? api.GetNameFromTypeCode(t) : String(t); } catch { /* noop */ }
    try {
      const line: any = api.properties?.getItemProperties ? await api.properties.getItemProperties(modelID, eid, true) : api.GetLine(modelID, eid);
      globalId = line?.GlobalId?.value;
      for (const k of ['Name', 'ObjectType', 'PredefinedType', 'Tag', 'Description']) { const val = line?.[k]?.value; if (val != null && val !== '') props.push([k, String(val)]); }
    } catch { /* noop */ }
    try {
      const psets: any[] = api.properties?.getPropertySets ? await api.properties.getPropertySets(modelID, eid, true) : [];
      for (const ps of psets) {
        const hp = ps?.HasProperties; if (!Array.isArray(hp)) continue;
        for (const p of hp) { const n = p?.Name?.value; const val = p?.NominalValue?.value; if (n != null && val != null) props.push([String(n), String(val)]); }
      }
    } catch { /* noop */ }
    return { expressId: eid, globalId, ifcClass, props };
  }

  function highlight(eid: number | null) {
    const THREE = st.current.THREE;
    for (const m of st.current.meshes) { if (m.material?.emissive) m.material.emissive.setHex(0x000000); }
    if (eid == null) return;
    const meshes = st.current.byId.get(eid) || [];
    for (const m of meshes) { if (m.material?.emissive) m.material.emissive = new THREE.Color(0x2563eb); }
  }
  function focusObject(eid: number) {
    const THREE = st.current.THREE; const meshes = st.current.byId.get(eid); if (!meshes?.length) return;
    const box = new THREE.Box3(); for (const m of meshes) box.expandByObject(m);
    const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()).length() || 5;
    st.current.controls.target.copy(c);
    st.current.camera.position.copy(c).add(new THREE.Vector3(1, 0.8, 1).multiplyScalar(size * 1.6));
    st.current.controls.update();
  }
  function applySection(next: { axis: 'x' | 'y' | 'z' | null; t: number; flip: boolean }) {
    const s = st.current; if (!s.renderer) return;
    if (!next.axis) { s.renderer.clippingPlanes = []; return; }
    const THREE = s.THREE; const box = s.bbox as any;
    const n = new THREE.Vector3(...AXES[next.axis]); if (next.flip) n.multiplyScalar(-1);
    const min = box.min[next.axis], max = box.max[next.axis]; const pos = min + (max - min) * next.t;
    const plane = new THREE.Plane(n, next.flip ? pos : -pos);
    s.renderer.clippingPlanes = [plane];
  }
  function setVisibility(mode: 'isolate' | 'hide' | 'all') {
    const eid = selected?.expressId;
    for (const m of st.current.meshes) {
      if (mode === 'all') m.visible = true;
      else if (eid != null) {
        const isSel = (st.current.byId.get(eid) || []).includes(m);
        m.visible = mode === 'isolate' ? isSel : !isSel;
      }
    }
  }

  useEffect(() => {
    let disposed = false;
    (async () => {
      const cont = containerRef.current; if (!cont) return;
      const THREE: any = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js') as any;
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf1f5f9);
      const camera = new THREE.PerspectiveCamera(60, cont.clientWidth / cont.clientHeight, 0.01, 100000); camera.position.set(10, 10, 10);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(cont.clientWidth, cont.clientHeight); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.xr.enabled = true; renderer.localClippingEnabled = true; cont.appendChild(renderer.domElement);
      scene.add(new THREE.AmbientLight(0xffffff, 0.9)); const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(1, 2, 1.5); scene.add(dl);
      const controls = new OrbitControls(camera, renderer.domElement); const raycaster = new THREE.Raycaster(); const v2 = new THREE.Vector2();
      st.current = { THREE, scene, camera, renderer, controls, raycaster, v2, meshes: [], byId: new Map(), ifcApi: null, modelID: -1 };
      const nav = navigator as any; if (nav.xr?.isSessionSupported) { try { setArSupported(await nav.xr.isSessionSupported('immersive-ar')); } catch { /* noop */ } }
      const onResize = () => { const w = cont.clientWidth, h = cont.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
      window.addEventListener('resize', onResize); st.current.onResize = onResize;

      setPhase('Téléchargement…');
      const res = await fetch(`/api/file-proxy/${fileId}?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error('Téléchargement impossible'); const buf = await res.arrayBuffer(); if (disposed) return;

      if (isIfc(fileName)) {
        setPhase('Analyse IFC…');
        const WebIFC: any = await import('web-ifc'); const api = new WebIFC.IfcAPI();
        api.SetWasmPath(`https://unpkg.com/web-ifc@${WEB_IFC_VERSION}/`, true); await api.Init();
        const modelID = api.OpenModel(new Uint8Array(buf)); st.current.ifcApi = api; st.current.modelID = modelID;
        api.StreamAllMeshes(modelID, (flatMesh: any) => {
          const placed = flatMesh.geometries;
          for (let i = 0; i < placed.size(); i++) {
            const pg = placed.get(i); const g = api.GetGeometry(modelID, pg.geometryExpressID);
            const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
            const n = verts.length / 6; const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
            for (let v = 0; v < n; v++) { pos[v * 3] = verts[v * 6]; pos[v * 3 + 1] = verts[v * 6 + 1]; pos[v * 3 + 2] = verts[v * 6 + 2]; nor[v * 3] = verts[v * 6 + 3]; nor[v * 3 + 1] = verts[v * 6 + 4]; nor[v * 3 + 2] = verts[v * 6 + 5]; }
            const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
            const c = pg.color; const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(c.x, c.y, c.z), transparent: c.w < 1, opacity: c.w, side: THREE.DoubleSide, clipShadows: true });
            const mesh = new THREE.Mesh(geom, mat); mesh.matrix.fromArray(pg.flatTransformation); mesh.matrixAutoUpdate = false;
            const eid = flatMesh.expressID; mesh.userData.expressID = eid;
            scene.add(mesh); st.current.meshes.push(mesh);
            const arr = st.current.byId.get(eid) || []; arr.push(mesh); st.current.byId.set(eid, arr);
          }
        });
      } else {
        setPhase('Chargement du modèle…'); const lower = fileName.toLowerCase();
        if (lower.endsWith('.obj')) { const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js') as any; const obj = new OBJLoader().parse(new TextDecoder().decode(new Uint8Array(buf))); scene.add(obj); st.current.meshes.push(obj); }
        else { const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js') as any; const gltf: any = await new Promise((r, j) => new GLTFLoader().parse(buf, '', r, j)); scene.add(gltf.scene); st.current.meshes.push(gltf.scene); }
      }
      if (disposed) return;
      const box = new THREE.Box3().setFromObject(scene); st.current.bbox = box;
      const size = box.getSize(new THREE.Vector3()).length() || 10; const center = box.getCenter(new THREE.Vector3());
      controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).multiplyScalar(size * 0.7)); camera.near = size / 1000; camera.far = size * 20; camera.updateProjectionMatrix(); controls.update();
      renderer.setAnimationLoop(() => renderer.render(scene, camera)); setLoading(false); setPhase('');

      // Restauration : focus sur l'objet du commentaire
      if (restoreExpress.current != null && st.current.byId.has(restoreExpress.current)) {
        const eid = restoreExpress.current; highlight(eid); focusObject(eid); const sel = await ifcProps(eid); if (!disposed) setSelected(sel);
      }

      const onClick = async (ev: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        v2.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(v2, camera);
        const hits = raycaster.intersectObjects(st.current.meshes.filter((m: any) => m.visible), true);
        if (hits.length === 0) { highlight(null); setSelected(null); return; }
        const obj: any = hits[0].object; const eid = obj.userData?.expressID;
        if (eid != null && st.current.ifcApi) { highlight(eid); setSelected(await ifcProps(eid)); }
        else setSelected({ name: obj.name || 'Objet 3D' });
      };
      renderer.domElement.addEventListener('click', onClick); st.current.onClick = onClick;
    })().catch((e) => { if (!disposed) { setError(e instanceof Error ? e.message : 'Erreur de lecture'); setLoading(false); } });

    return () => { disposed = true; const s = st.current; try { window.removeEventListener('resize', s.onResize); s.renderer?.setAnimationLoop?.(null); s.renderer?.domElement?.removeEventListener?.('click', s.onClick); s.ifcApi?.CloseModel?.(s.modelID); s.renderer?.dispose?.(); if (s.renderer?.domElement?.parentNode) s.renderer.domElement.parentNode.removeChild(s.renderer.domElement); } catch { /* noop */ } };
  }, [fileId, fileName, token]);

  function updateSection(patch: Partial<typeof section>) { const next = { ...section, ...patch }; setSection(next); applySection(next); }
  async function enterAR() { const s = st.current; if (!s?.renderer) return; try { const { ARButton } = await import('three/examples/jsm/webxr/ARButton.js') as any; const btn = ARButton.createButton(s.renderer); document.body.appendChild(btn); btn.click(); setTimeout(() => btn.remove(), 500); } catch { setError('Réalité augmentée indisponible sur cet appareil.'); } }
  async function commentObject() {
    if (!projectId || !selected) return; setBusy(true); setSaved('');
    try {
      const s = st.current; const cam = cameraState({ x: s.camera.position.x, y: s.camera.position.y, z: s.camera.position.z }, { x: s.controls.target.x, y: s.controls.target.y, z: s.controls.target.z });
      const metadata = bimLocationMetadata({ bimModelId: fileId, globalId: selected.globalId, expressId: selected.expressId, ifcClass: selected.ifcClass, camera: cam });
      const r = await fetch(`/api/projects/${projectId}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'OBSERVATION', description: `Observation sur ${selected.ifcClass ?? 'objet'} ${selected.globalId ?? selected.expressId ?? ''}`.trim(), locations: [{ locationType: 'BIM_IFC', resourceType: 'file', resourceId: fileId, title: selected.ifcClass ?? 'Objet BIM', metadata }] }) });
      if (!r.ok) throw new Error('Création refusée'); setSaved('Commentaire créé sur cet objet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }

  const secBtn = (a: 'x' | 'y' | 'z') => `rounded px-2 py-0.5 text-[11px] ${section.axis === a ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-700'}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
        <span className="truncate text-sm font-medium max-w-[35%]">{fileName}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-300">Coupe</span>
          <button className={secBtn('x')} onClick={() => updateSection({ axis: section.axis === 'x' ? null : 'x' })}>X</button>
          <button className={secBtn('y')} onClick={() => updateSection({ axis: section.axis === 'y' ? null : 'y' })}>Y</button>
          <button className={secBtn('z')} onClick={() => updateSection({ axis: section.axis === 'z' ? null : 'z' })}>Z</button>
          {section.axis && <input type="range" min={0} max={1} step={0.01} value={section.t} onChange={(e) => updateSection({ t: Number(e.target.value) })} className="w-24" />}
          {section.axis && <button className="rounded bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700" onClick={() => updateSection({ flip: !section.flip })}>⇄</button>}
          {arSupported && <button onClick={() => void enterAR()} className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20">📱 AR</button>}
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={onClose}>Fermer</button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {selected && (
          <div className="absolute right-3 top-3 max-h-[80%] w-72 overflow-y-auto rounded-lg bg-white/95 p-3 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-800">{selected.ifcClass || selected.name || 'Objet'}</p>
              <button onClick={() => { highlight(null); setSelected(null); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            {selected.globalId && <p className="mt-1 break-all text-[10px] text-slate-500">GlobalId : {selected.globalId}</p>}
            {selected.expressId != null && <p className="text-[10px] text-slate-500">Express ID : {selected.expressId}</p>}
            <div className="mt-2 flex gap-1">
              <button onClick={() => setVisibility('isolate')} className="flex-1 rounded bg-slate-100 py-1 text-[10px] text-slate-700 hover:bg-slate-200">Isoler</button>
              <button onClick={() => setVisibility('hide')} className="flex-1 rounded bg-slate-100 py-1 text-[10px] text-slate-700 hover:bg-slate-200">Masquer</button>
              <button onClick={() => setVisibility('all')} className="flex-1 rounded bg-slate-100 py-1 text-[10px] text-slate-700 hover:bg-slate-200">Tout</button>
            </div>
            {selected.props && selected.props.length > 0 && (
              <div className="mt-2 border-t pt-2">
                <p className="mb-1 text-[10px] uppercase text-slate-400">Propriétés</p>
                <table className="w-full text-[10px]"><tbody>
                  {selected.props.map(([k, v], i) => <tr key={i} className="border-b border-slate-100"><td className="py-0.5 pr-2 text-slate-500">{k}</td><td className="py-0.5 text-slate-800">{v}</td></tr>)}
                </tbody></table>
              </div>
            )}
            {canComment && projectId && <button disabled={busy} onClick={() => void commentObject()} className="mt-2 w-full rounded bg-violet-600 py-1 text-xs text-white disabled:opacity-40">💬 Commenter cet objet</button>}
            {saved && <p className="mt-1 text-[10px] text-emerald-600">{saved}</p>}
          </div>
        )}
        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white">
            {error ? (<div className="max-w-md px-6 text-center"><p className="mb-2 text-red-400">Impossible d&apos;afficher le modèle</p><p className="text-sm text-slate-300">{error}</p><button onClick={onClose} className="mt-4 rounded-md bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">Fermer</button></div>)
              : (<div className="flex flex-col items-center gap-3"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" /><p className="text-sm">{phase}</p></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
