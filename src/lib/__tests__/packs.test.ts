import { describe, it, expect } from 'vitest';
import {
  yearlyCostIfMonthly, annualSavingsPct, annualSavingsCents, monthlyEquivalentOfAnnual,
  priceForPeriod, applyDiscount, isUnlimited, canConsume, remaining, usagePercent,
  usageAlertLevel, usageAlertMessage, resolveFeatureFlags, hasFeature, buildEntitlements,
  prorataCredit, changePackNetCents, classifyChange, gbToBytes, bytesToGb, formatBytes,
} from '../packs';

describe('tarification', () => {
  it('coût annuel si payé au mois = 12x', () => {
    expect(yearlyCostIfMonthly(1000)).toBe(12000);
  });
  it('économie annuelle en % et en centimes', () => {
    // 1000/mois => 12000/an ; annuel à 10000 => 2000 économisés = 16 %
    expect(annualSavingsPct(1000, 10000)).toBe(17); // round(2000/12000*100)=16.7->17
    expect(annualSavingsCents(1000, 10000)).toBe(2000);
  });
  it('pas d économie => 0', () => {
    expect(annualSavingsPct(1000, 12000)).toBe(0);
    expect(annualSavingsPct(1000, 13000)).toBe(0);
    expect(annualSavingsPct(1000, null)).toBe(0);
    expect(annualSavingsCents(1000, null)).toBe(0);
  });
  it('équivalent mensuel de l annuel', () => {
    expect(monthlyEquivalentOfAnnual(12000)).toBe(1000);
    expect(monthlyEquivalentOfAnnual(null)).toBeNull();
  });
  it('prix par période', () => {
    const p = { monthlyPriceCents: 1000, annualPriceCents: 10000, currency: 'DZD' };
    expect(priceForPeriod(p, 'MONTHLY')).toBe(1000);
    expect(priceForPeriod(p, 'ANNUAL')).toBe(10000);
    expect(priceForPeriod({ ...p, annualPriceCents: null }, 'ANNUAL')).toBeNull();
  });
});

describe('remises', () => {
  it('pourcentage borné', () => {
    expect(applyDiscount(10000, { type: 'PERCENT', value: 20 })).toBe(8000);
    expect(applyDiscount(10000, { type: 'PERCENT', value: 150 })).toBe(0);
    expect(applyDiscount(10000, { type: 'PERCENT', value: -5 })).toBe(10000);
  });
  it('montant fixe borné à 0', () => {
    expect(applyDiscount(10000, { type: 'FIXED', value: 3000 })).toBe(7000);
    expect(applyDiscount(10000, { type: 'FIXED', value: 99999 })).toBe(0);
  });
  it('sans remise => inchangé', () => {
    expect(applyDiscount(10000, null)).toBe(10000);
  });
});

describe('limites & usage', () => {
  it('illimité', () => {
    expect(isUnlimited(null)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
    expect(canConsume(999999, null, 1000)).toBe(true);
    expect(remaining(50, null)).toBeNull();
    expect(usagePercent(50, null)).toBe(0);
  });
  it('consommation bornée', () => {
    expect(canConsume(4, 5, 1)).toBe(true);
    expect(canConsume(5, 5, 1)).toBe(false);
    expect(canConsume(0, 0, 1)).toBe(false);
  });
  it('reste et pourcentage', () => {
    expect(remaining(3, 10)).toBe(7);
    expect(remaining(15, 10)).toBe(0);
    expect(usagePercent(5, 10)).toBe(50);
    expect(usagePercent(20, 10)).toBe(100);
    expect(usagePercent(1, 0)).toBe(100);
  });
});

describe('alertes d usage', () => {
  it('seuils 70/85/95/100', () => {
    expect(usageAlertLevel(10)).toBe(0);
    expect(usageAlertLevel(70)).toBe(70);
    expect(usageAlertLevel(84)).toBe(70);
    expect(usageAlertLevel(85)).toBe(85);
    expect(usageAlertLevel(96)).toBe(95);
    expect(usageAlertLevel(100)).toBe(100);
    expect(usageAlertLevel(120)).toBe(100);
  });
  it('messages', () => {
    expect(usageAlertMessage(0)).toBeNull();
    expect(usageAlertMessage(100)).toContain('100 %');
    expect(usageAlertMessage(70)).toContain('70 %');
  });
});

describe('droits (entitlements)', () => {
  it('résolution des fonctionnalités + défaut refus', () => {
    const flags = resolveFeatureFlags([{ key: 'vr', enabled: true }, { key: 'export', enabled: false }]);
    expect(hasFeature(flags, 'vr')).toBe(true);
    expect(hasFeature(flags, 'export')).toBe(false);
    expect(hasFeature(flags, 'inconnu')).toBe(false);
  });
  it('agrégation droits', () => {
    const ent = buildEntitlements(
      [{ key: 'vr', enabled: true }],
      { maxProjects: 5, maxFilesPerProject: null, maxCollaborators: 3, storageBytes: gbToBytes(10) },
    );
    expect(ent.features.vr).toBe(true);
    expect(ent.limits.maxProjects).toBe(5);
    expect(isUnlimited(ent.limits.maxFilesPerProject)).toBe(true);
  });
});

describe('changement de pack', () => {
  it('prorata', () => {
    expect(prorataCredit(3000, 15, 30)).toBe(1500);
    expect(prorataCredit(3000, 40, 30)).toBe(3000); // borné
    expect(prorataCredit(3000, 15, 0)).toBe(0);
  });
  it('net à régler', () => {
    expect(changePackNetCents(5000, 1500)).toBe(3500);
    expect(changePackNetCents(1000, 4000)).toBe(0);
  });
  it('classification', () => {
    expect(classifyChange(1000, 2000)).toBe('UPGRADE');
    expect(classifyChange(2000, 1000)).toBe('DOWNGRADE');
    expect(classifyChange(1000, 1000)).toBe('SAME');
  });
});

describe('stockage', () => {
  it('conversions Go/octets', () => {
    expect(gbToBytes(1)).toBe(1024 ** 3);
    expect(bytesToGb(1024 ** 3)).toBe(1);
  });
  it('formatage', () => {
    expect(formatBytes(0)).toContain('o');
    expect(formatBytes(1024 ** 3)).toContain('Go');
    expect(formatBytes(1024 ** 2)).toContain('Mo');
  });
});
