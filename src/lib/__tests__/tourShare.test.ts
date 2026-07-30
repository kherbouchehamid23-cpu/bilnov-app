// src/lib/__tests__/tourShare.test.ts
import { describe, it, expect } from 'vitest';
import { publicPath, buildShareUrl, isValidShareToken, buildEmbedCode } from '../tourShare';

describe('publicPath / buildShareUrl', () => {
  it('construit le chemin public', () => {
    expect(publicPath('abc123abc123abc1')).toBe('/public/abc123abc123abc1');
  });
  it('supprime le slash final de origin', () => {
    expect(buildShareUrl('https://app.bilnov.com/', 'tok0000000000000')).toBe('https://app.bilnov.com/public/tok0000000000000');
    expect(buildShareUrl('https://app.bilnov.com', 'tok0000000000000')).toBe('https://app.bilnov.com/public/tok0000000000000');
  });
});

describe('isValidShareToken', () => {
  it('accepte un UUID / jeton alphanumérique', () => {
    expect(isValidShareToken('550e8400e29b41d4a716446655440000')).toBe(true);
    expect(isValidShareToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidShareToken('Ab-_09Ab-_09Ab12')).toBe(true);
  });
  it('rejette les jetons invalides', () => {
    expect(isValidShareToken('short')).toBe(false);
    expect(isValidShareToken('../etc/passwd0000')).toBe(false);
    expect(isValidShareToken('a b c d e f g h i j')).toBe(false);
    expect(isValidShareToken('')).toBe(false);
    expect(isValidShareToken(null)).toBe(false);
    expect(isValidShareToken('x'.repeat(80))).toBe(false);
  });
});

describe('buildEmbedCode', () => {
  it('génère un iframe avec fullscreen + gyroscope', () => {
    const code = buildEmbedCode('https://app.bilnov.com', 'tok0000000000000', { height: '600' });
    expect(code).toContain('src="https://app.bilnov.com/public/tok0000000000000"');
    expect(code).toContain('allowfullscreen');
    expect(code).toContain('gyroscope');
    expect(code).toContain('height="600"');
    expect(code).toContain('width="100%"');
  });
  it('échappe les guillemets du titre', () => {
    const code = buildEmbedCode('https://x', 'tok0000000000000', { title: 'A "B" C' });
    expect(code).toContain('title="A &quot;B&quot; C"');
  });
});
