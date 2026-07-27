import { describe, it, expect } from 'vitest';
import {
  STATUS_TRANSITIONS, canTransition, nextStatuses, requiresPrivilege,
  isStatus, isPriority, isType, isLocationType, isResponsibility,
  isCriticalPriority, isOpen, COMMENT_TYPES, LOCATION_TYPES, STATUS_META,
} from '../commentWorkflow';

describe('machine à états (SFD §4.3)', () => {
  it('transitions clés autorisées', () => {
    expect(canTransition('NEW', 'ASSIGNED')).toBe(true);
    expect(canTransition('ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'TO_VERIFY')).toBe(true);
    expect(canTransition('TO_VERIFY', 'RESOLVED')).toBe(true);
    expect(canTransition('TO_VERIFY', 'REJECTED')).toBe(true);
    expect(canTransition('RESOLVED', 'VALIDATED')).toBe(true);
    expect(canTransition('RESOLVED', 'REOPENED')).toBe(true);
  });
  it('transitions interdites', () => {
    expect(canTransition('NEW', 'VALIDATED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'VALIDATED')).toBe(false);
    expect(canTransition('ARCHIVED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('VALIDATED', 'IN_PROGRESS')).toBe(false);
  });
  it('cas particuliers du cahier des charges', () => {
    expect(canTransition('IN_PROGRESS', 'BLOCKED')).toBe(true);
    expect(canTransition('BLOCKED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('NEW', 'CANCELLED')).toBe(true);
  });
  it('ARCHIVED est terminal', () => {
    expect(nextStatuses('ARCHIVED')).toEqual([]);
  });
  it('aucune transition ne pointe vers un statut inconnu', () => {
    const all = Object.keys(STATUS_TRANSITIONS);
    for (const targets of Object.values(STATUS_TRANSITIONS)) {
      for (const t of targets) expect(all).toContain(t);
    }
  });
});

describe('privilèges', () => {
  it('VALIDATED et ARCHIVED exigent un rôle habilité', () => {
    expect(requiresPrivilege('VALIDATED')).toBe(true);
    expect(requiresPrivilege('ARCHIVED')).toBe(true);
    expect(requiresPrivilege('RESOLVED')).toBe(false);
  });
});

describe('validateurs & classification', () => {
  it('isStatus / isPriority / isType / isLocationType / isResponsibility', () => {
    expect(isStatus('TO_VERIFY')).toBe(true);
    expect(isStatus('WAT')).toBe(false);
    expect(isPriority('CRITICAL')).toBe(true);
    expect(isPriority('MEH')).toBe(false);
    expect(isType('NON_CONFORMITY')).toBe(true);
    expect(isType('nope')).toBe(false);
    expect(isLocationType('PANORAMA_360')).toBe(true);
    expect(isResponsibility('APPROVER')).toBe(true);
  });
  it('couvre tous les types/localisations attendus', () => {
    expect(COMMENT_TYPES).toContain('RESERVE');
    expect(COMMENT_TYPES).toContain('NON_CONFORMITY');
    expect(LOCATION_TYPES).toContain('DWG');
    expect(LOCATION_TYPES).toContain('BIM_IFC');
    expect(LOCATION_TYPES).toContain('AUGMENTED_REALITY');
  });
  it('criticité et ouverture', () => {
    expect(isCriticalPriority('CRITICAL')).toBe(true);
    expect(isCriticalPriority('HIGH')).toBe(false);
    expect(isOpen('NEW')).toBe(true);
    expect(isOpen('RESOLVED')).toBe(false);
    expect(isOpen('VALIDATED')).toBe(false);
    expect(STATUS_META.BLOCKED.open).toBe(true);
  });
});
