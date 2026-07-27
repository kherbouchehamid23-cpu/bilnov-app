import { describe, it, expect } from 'vitest';
import { STATUS_META, STATUS_ORDER, PRIORITY_ORDER, statusColor, statusLabel, eventLabel } from '../cadStatus';

describe('cadStatus', () => {
  it('couleur/libellé par statut connu', () => {
    expect(statusColor('OPEN')).toBe(STATUS_META.OPEN.color);
    expect(statusLabel('VALIDATED')).toBe('Validé');
  });
  it('fallback sur statut inconnu', () => {
    expect(statusColor('WAT')).toBe('#EF4444');
    expect(statusLabel('WAT')).toBe('WAT');
  });
  it('ordre des statuts et priorités complet', () => {
    expect(STATUS_ORDER).toContain('OPEN');
    expect(STATUS_ORDER).toContain('ARCHIVED');
    expect(PRIORITY_ORDER[0]).toBe('LOW');
    expect(PRIORITY_ORDER[PRIORITY_ORDER.length - 1]).toBe('URGENT');
  });
  it('libellés d’événements d’historique', () => {
    expect(eventLabel('created', {})).toBe('Création du commentaire');
    expect(eventLabel('status_changed', { from: 'OPEN', to: 'RESOLVED' })).toBe('Statut : Ouvert → Résolu');
    expect(eventLabel('assigned', { to: 'u1' })).toBe('Responsable assigné');
    expect(eventLabel('assigned', {})).toBe('Responsable retiré');
    expect(eventLabel('inconnu', {})).toBe('inconnu');
  });
});
