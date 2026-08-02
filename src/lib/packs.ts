// BILNOV — Module PACKS D'ABONNEMENT — logique métier PURE (aucune dépendance).
// Tout est dynamique : aucun prix, aucune limite, aucune fonctionnalité n'est codée en dur
// ici. Ces fonctions opèrent uniquement sur les données fournies (issues de la base), afin
// que l'administrateur puisse tout piloter depuis l'interface. Testable côté serveur et client.
//
// Conventions :
//  - Les montants sont en CENTIMES (entiers) pour éviter les erreurs de virgule flottante.
//  - Une LIMITE vaut `null` = « Illimité ». Un nombre >= 0 = plafond exact.
//  - Une période de facturation vaut 'MONTHLY' | 'ANNUAL'.

export type BillingPeriod = 'MONTHLY' | 'ANNUAL';

/** Limite d'usage : null => illimité ; sinon plafond entier (>= 0). */
export type LimitValue = number | null;

export const UNLIMITED: LimitValue = null;

/** Clés de limites quantitatives d'un pack (doc §5). */
export interface PackLimits {
  maxProjects: LimitValue;
  maxFilesPerProject: LimitValue;
  maxCollaborators: LimitValue;
  storageBytes: LimitValue;
}

export interface PackFeatureFlag {
  key: string;
  enabled: boolean;
}

/** Vue « pack » minimale nécessaire au calcul (sous-ensemble du modèle Prisma). */
export interface PackPricing {
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  currency: string;
}

// ---------------------------------------------------------------------------
// Tarification
// ---------------------------------------------------------------------------

/** Coût sur 12 mois si l'on paie au mois. */
export function yearlyCostIfMonthly(monthlyPriceCents: number): number {
  return Math.max(0, Math.round(monthlyPriceCents)) * 12;
}

/**
 * Économie (en %) réalisée en payant à l'année plutôt qu'au mois.
 * Retourne 0 si aucun tarif annuel, ou si l'annuel n'apporte aucune économie.
 */
export function annualSavingsPct(monthlyPriceCents: number, annualPriceCents: number | null): number {
  if (!annualPriceCents || annualPriceCents <= 0) return 0;
  const ref = yearlyCostIfMonthly(monthlyPriceCents);
  if (ref <= 0) return 0;
  const saved = ref - annualPriceCents;
  if (saved <= 0) return 0;
  return Math.round((saved / ref) * 100);
}

/** Montant économisé (centimes) sur une année en payant à l'année. */
export function annualSavingsCents(monthlyPriceCents: number, annualPriceCents: number | null): number {
  if (!annualPriceCents || annualPriceCents <= 0) return 0;
  return Math.max(0, yearlyCostIfMonthly(monthlyPriceCents) - annualPriceCents);
}

/** Équivalent mensuel d'un tarif annuel (centimes), pour affichage « X/mois facturé annuellement ». */
export function monthlyEquivalentOfAnnual(annualPriceCents: number | null): number | null {
  if (!annualPriceCents || annualPriceCents <= 0) return null;
  return Math.round(annualPriceCents / 12);
}

/** Prix affiché pour une période donnée (centimes). Null si la période n'est pas proposée. */
export function priceForPeriod(pricing: PackPricing, period: BillingPeriod): number | null {
  if (period === 'ANNUAL') return pricing.annualPriceCents && pricing.annualPriceCents > 0 ? pricing.annualPriceCents : null;
  return Math.max(0, Math.round(pricing.monthlyPriceCents));
}

/** Formate un montant en centimes vers l'unité principale, ex 149000 -> "1 490". */
export function formatMajorUnits(cents: number, locale = 'fr-DZ'): string {
  const major = Math.round(cents) / 100;
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(major);
  } catch {
    return String(major);
  }
}

// ---------------------------------------------------------------------------
// Remise / codes promo (doc §3, §11)
// ---------------------------------------------------------------------------

export type DiscountType = 'PERCENT' | 'FIXED';

export interface Discount {
  type: DiscountType;
  /** PERCENT : 0..100 ; FIXED : centimes. */
  value: number;
}

/** Applique une remise à un montant (centimes), borné à [0, base]. */
export function applyDiscount(baseCents: number, discount: Discount | null | undefined): number {
  const base = Math.max(0, Math.round(baseCents));
  if (!discount) return base;
  if (discount.type === 'PERCENT') {
    const pct = Math.max(0, Math.min(100, discount.value));
    return Math.round(base * (1 - pct / 100));
  }
  // FIXED
  return Math.max(0, base - Math.max(0, Math.round(discount.value)));
}

// ---------------------------------------------------------------------------
// Limites & usage (doc §5, §6, §7)
// ---------------------------------------------------------------------------

/** true si la limite est « Illimitée ». */
export function isUnlimited(limit: LimitValue): boolean {
  return limit === null || limit === undefined;
}

/** Peut-on encore consommer `amount` unités sachant `used` déjà consommées ? */
export function canConsume(used: number, limit: LimitValue, amount = 1): boolean {
  if (isUnlimited(limit)) return true;
  return used + amount <= (limit as number);
}

/** Reste disponible : null si illimité, sinon max(0, limit - used). */
export function remaining(used: number, limit: LimitValue): number | null {
  if (isUnlimited(limit)) return null;
  return Math.max(0, (limit as number) - used);
}

/** Pourcentage d'usage 0..100 (0 si illimité ou limite <= 0). */
export function usagePercent(used: number, limit: LimitValue): number {
  if (isUnlimited(limit)) return 0;
  const l = limit as number;
  if (l <= 0) return used > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((used / l) * 100)));
}

/** Seuils d'alerte d'usage (doc §7). */
export const USAGE_ALERT_THRESHOLDS = [70, 85, 95, 100] as const;
export type UsageAlertLevel = 0 | 70 | 85 | 95 | 100;

/** Renvoie le seuil d'alerte le plus élevé atteint (0 = pas d'alerte). */
export function usageAlertLevel(percent: number): UsageAlertLevel {
  const p = Math.max(0, Math.min(100, percent));
  let level: UsageAlertLevel = 0;
  for (const t of USAGE_ALERT_THRESHOLDS) {
    if (p >= t) level = t as UsageAlertLevel;
  }
  return level;
}

/** Message d'alerte d'usage (français) selon le seuil ; null si aucune alerte. */
export function usageAlertMessage(level: UsageAlertLevel, label = 'votre capacité'): string | null {
  switch (level) {
    case 100: return `Vous avez atteint 100 % de ${label}. Augmentez votre capacité pour continuer.`;
    case 95:  return `Vous approchez de la limite : 95 % de ${label} utilisés.`;
    case 85:  return `Attention : 85 % de ${label} utilisés.`;
    case 70:  return `Information : 70 % de ${label} utilisés.`;
    default:  return null;
  }
}

// ---------------------------------------------------------------------------
// Droits / fonctionnalités (entitlements) (doc §4, §13)
// ---------------------------------------------------------------------------

/** Construit la table des fonctionnalités actives d'un pack (clé -> booléen). */
export function resolveFeatureFlags(flags: PackFeatureFlag[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of flags) out[f.key] = !!f.enabled;
  return out;
}

/** true si la fonctionnalité `key` est active dans le pack (défaut : false = refus). */
export function hasFeature(flags: Record<string, boolean>, key: string): boolean {
  return flags[key] === true;
}

export interface Entitlements {
  features: Record<string, boolean>;
  limits: PackLimits;
}

/** Agrège fonctionnalités + limites en un objet de droits exploitable côté serveur. */
export function buildEntitlements(flags: PackFeatureFlag[], limits: PackLimits): Entitlements {
  return { features: resolveFeatureFlags(flags), limits };
}

// ---------------------------------------------------------------------------
// Changement de pack : prorata (doc §8)
// ---------------------------------------------------------------------------

/**
 * Crédit de prorata (centimes) sur le pack courant : part non consommée de la période.
 * `daysRemaining`/`daysInPeriod` bornés ; retourne 0 si période invalide.
 */
export function prorataCredit(currentPeriodCents: number, daysRemaining: number, daysInPeriod: number): number {
  if (daysInPeriod <= 0) return 0;
  const dr = Math.max(0, Math.min(daysRemaining, daysInPeriod));
  return Math.round(Math.max(0, currentPeriodCents) * (dr / daysInPeriod));
}

/** Montant net à régler lors d'un changement de pack (nouveau prix - crédit prorata), borné à 0. */
export function changePackNetCents(newPeriodCents: number, creditCents: number): number {
  return Math.max(0, Math.round(newPeriodCents) - Math.max(0, Math.round(creditCents)));
}

/** Type de changement de pack pour l'UX (doc §8). */
export type ChangeKind = 'UPGRADE' | 'DOWNGRADE' | 'SAME';
export function classifyChange(currentMonthlyCents: number, targetMonthlyCents: number): ChangeKind {
  if (targetMonthlyCents > currentMonthlyCents) return 'UPGRADE';
  if (targetMonthlyCents < currentMonthlyCents) return 'DOWNGRADE';
  return 'SAME';
}

// ---------------------------------------------------------------------------
// Stockage : conversions d'unités (doc §6)
// ---------------------------------------------------------------------------

export const BYTES_PER_GB = 1024 * 1024 * 1024;

export function gbToBytes(gb: number): number {
  return Math.round(Math.max(0, gb) * BYTES_PER_GB);
}
export function bytesToGb(bytes: number): number {
  return Math.max(0, bytes) / BYTES_PER_GB;
}
/** Affichage lisible d'une taille en octets (ex 1610612736 -> "1,5 Go"). */
export function formatBytes(bytes: number, locale = 'fr-DZ'): string {
  const b = Math.max(0, bytes);
  const units: [number, string][] = [
    [1024 ** 4, 'To'], [1024 ** 3, 'Go'], [1024 ** 2, 'Mo'], [1024, 'Ko'],
  ];
  for (const [div, u] of units) {
    if (b >= div) {
      const v = b / div;
      try { return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)} ${u}`; }
      catch { return `${v.toFixed(1)} ${u}`; }
    }
  }
  return `${b} o`;
}
