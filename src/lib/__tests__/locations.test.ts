import { describe, it, expect } from 'vitest';
import { navigationTarget, validateLocationMetadata, mapCadStatus, mapCadPriority } from '../locations';

describe('navigationTarget', () => {
  it('DWG → lien vers le fichier', () => {
    expect(navigationTarget('p1', { locationType: 'DWG', resourceId: 'f9' })).toEqual({ support: 'DWG', label: 'Voir sur le plan DWG', href: '/projects/p1?file=f9' });
  });
  it('DWG via metadata.drawing_id', () => {
    expect(navigationTarget('p1', { locationType: 'DWG', resourceId: null, metadata: { drawing_id: 'f7' } }).href).toBe('/projects/p1?file=f7');
  });
  it('360 → onglet visites', () => {
    expect(navigationTarget('p1', { locationType: 'PANORAMA_360' }).href).toBe('/projects/p1?tab=tours');
  });
  it('type inconnu → href null', () => {
    expect(navigationTarget('p1', { locationType: 'GPS' }).href).toBeNull();
  });
});

describe('validateLocationMetadata', () => {
  it('DWG exige x,y numériques', () => {
    expect(validateLocationMetadata('DWG', { x: 1, y: 2 })).toBe(true);
    expect(validateLocationMetadata('DWG', { x: 1 })).toBe(false);
  });
  it('360 exige yaw,pitch', () => {
    expect(validateLocationMetadata('PANORAMA_360', { yaw: 10, pitch: -2 })).toBe(true);
    expect(validateLocationMetadata('PANORAMA_360', {})).toBe(false);
  });
  it('IFC exige global_id ou express_id', () => {
    expect(validateLocationMetadata('BIM_IFC', { global_id: 'x' })).toBe(true);
    expect(validateLocationMetadata('BIM_IFC', { express_id: 42 })).toBe(true);
    expect(validateLocationMetadata('BIM_IFC', {})).toBe(false);
  });
  it('autres supports : pas d’exigence', () => {
    expect(validateLocationMetadata('DOCUMENT', null)).toBe(true);
  });
});

describe('mapping CAO → central', () => {
  it('statuts', () => {
    expect(mapCadStatus('OPEN')).toBe('NEW');
    expect(mapCadStatus('RESOLVED')).toBe('RESOLVED');
    expect(mapCadStatus('CLOSED')).toBe('ARCHIVED');
    expect(mapCadStatus('???')).toBe('NEW');
  });
  it('priorités', () => {
    expect(mapCadPriority('URGENT')).toBe('URGENT');
    expect(mapCadPriority('???')).toBe('NORMAL');
  });
});

describe('navigationTarget BIM_IFC', () => {
  it('construit le lien vers la maquette avec l’objet', () => {
    const t = navigationTarget('p1', { locationType: 'BIM_IFC', resourceId: 'f3', metadata: { express_id: 8452 } });
    expect(t.label).toBe('Voir dans la maquette BIM');
    expect(t.href).toBe('/projects/p1?file=f3&bimExpress=8452');
  });
  it('sans objet : lien vers le fichier seul', () => {
    expect(navigationTarget('p1', { locationType: 'BIM_IFC', resourceId: 'f3' }).href).toBe('/projects/p1?file=f3');
  });
});
