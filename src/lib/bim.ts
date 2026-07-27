// M3 — IFC/BIM & 3D : helpers PURS (détection, métadonnées de localisation, caméra). Testables.
export interface Vec3 { x: number; y: number; z: number }
export interface CameraState { position: Vec3; target: Vec3 }
export interface BimSelection {
  bimModelId?: string; bimModelVersionId?: string;
  globalId?: string; expressId?: number; ifcClass?: string;
  position?: Vec3; camera?: CameraState;
}

export function isIfc(name: string, fileType?: string): boolean {
  if (fileType === 'IFC') return true;
  return /\.ifc$/i.test(name);
}
export function is3DModel(name: string, fileType?: string): boolean {
  if (fileType === 'GLB' || fileType === 'GLTF' || fileType === 'OBJ') return true;
  return /\.(glb|gltf|obj)$/i.test(name);
}
export function isBimOr3D(name: string, fileType?: string): boolean {
  return isIfc(name, fileType) || is3DModel(name, fileType);
}

export function cameraState(position: Vec3, target: Vec3): CameraState {
  return { position: { ...position }, target: { ...target } };
}

/** Métadonnées de localisation BIM_IFC (SFD §12, §30). */
export function bimLocationMetadata(sel: BimSelection): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (sel.bimModelId) m.bim_model_id = sel.bimModelId;
  if (sel.bimModelVersionId) m.bim_model_version_id = sel.bimModelVersionId;
  if (sel.globalId) m.global_id = sel.globalId;
  if (typeof sel.expressId === 'number') m.express_id = sel.expressId;
  if (sel.ifcClass) m.ifc_class = sel.ifcClass;
  if (sel.position) m.position = sel.position;
  if (sel.camera) m.camera = sel.camera;
  return m;
}

/** Une localisation BIM est valide si elle identifie un objet (GlobalId ou Express ID). */
export function validateBim(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta ?? {};
  return typeof m['global_id'] === 'string' || typeof m['express_id'] === 'number';
}

/** Reprojection inter-versions (SFD §26) : priorité GlobalId puis Express ID puis type+position. */
export function matchAcrossVersions(
  target: BimSelection,
  candidates: BimSelection[],
): BimSelection | null {
  if (target.globalId) {
    const g = candidates.find((c) => c.globalId && c.globalId === target.globalId);
    if (g) return g;
  }
  if (typeof target.expressId === 'number') {
    const e = candidates.find((c) => c.expressId === target.expressId && c.ifcClass === target.ifcClass);
    if (e) return e;
  }
  return null;
}
