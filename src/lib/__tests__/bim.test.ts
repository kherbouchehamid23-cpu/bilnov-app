import { describe, it, expect } from 'vitest';
import { isIfc, is3DModel, isBimOr3D, cameraState, bimLocationMetadata, validateBim, matchAcrossVersions } from '../bim';

describe('détection de type', () => {
  it('IFC', () => { expect(isIfc('maquette.ifc')).toBe(true); expect(isIfc('x', 'IFC')).toBe(true); expect(isIfc('a.dwg')).toBe(false); });
  it('3D', () => { expect(is3DModel('m.glb')).toBe(true); expect(is3DModel('m.gltf')).toBe(true); expect(is3DModel('m.obj')).toBe(true); expect(is3DModel('x', 'GLB')).toBe(true); expect(is3DModel('a.ifc')).toBe(false); });
  it('BIM ou 3D', () => { expect(isBimOr3D('m.ifc')).toBe(true); expect(isBimOr3D('m.glb')).toBe(true); expect(isBimOr3D('m.pdf')).toBe(false); });
});

describe('métadonnées BIM', () => {
  it('construit et valide', () => {
    const m = bimLocationMetadata({ bimModelId: '12', globalId: '2O2Fr$t4X7Zf8NOew3FL9r', expressId: 8452, ifcClass: 'IfcWall', position: { x: 12.45, y: 8.2, z: 3.1 }, camera: cameraState({ x: 18, y: 12, z: 6 }, { x: 12, y: 8, z: 3 }) });
    expect(m.global_id).toBe('2O2Fr$t4X7Zf8NOew3FL9r');
    expect(m.express_id).toBe(8452);
    expect(m.ifc_class).toBe('IfcWall');
    expect((m.camera as { target: { x: number } }).target.x).toBe(12);
    expect(validateBim(m)).toBe(true);
  });
  it('invalide sans identifiant', () => {
    expect(validateBim({ ifc_class: 'IfcWall' })).toBe(false);
    expect(validateBim(bimLocationMetadata({ expressId: 5 }))).toBe(true);
  });
});

describe('reprojection inter-versions', () => {
  const cands = [{ globalId: 'A', expressId: 1, ifcClass: 'IfcWall' }, { globalId: 'B', expressId: 2, ifcClass: 'IfcDoor' }];
  it('par GlobalId', () => { expect(matchAcrossVersions({ globalId: 'B' }, cands)?.expressId).toBe(2); });
  it('par Express ID + classe', () => { expect(matchAcrossVersions({ expressId: 1, ifcClass: 'IfcWall' }, cands)?.globalId).toBe('A'); });
  it('null si aucun', () => { expect(matchAcrossVersions({ globalId: 'Z' }, cands)).toBeNull(); });
});
