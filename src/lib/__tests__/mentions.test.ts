import { describe, it, expect } from 'vitest';
import { extractMentions } from '../mentions';

describe('extractMentions', () => {
  it('extrait les handles', () => {
    expect(extractMentions('Salut @Ali et @Sara.B, voir ceci')).toEqual(['Ali', 'Sara.B']);
  });
  it('dédoublonne', () => {
    expect(extractMentions('@ali @ali @ali')).toEqual(['ali']);
  });
  it('ignore les emails', () => {
    expect(extractMentions('ecris a bob@example.com')).toEqual([]);
  });
  it('texte vide', () => {
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions('aucune mention')).toEqual([]);
  });
});
