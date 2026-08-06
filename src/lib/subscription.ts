// Gouvernance d'acces Bilnov : etat d'abonnement d'une organisation, avec
// periode de grace apres l'echeance (essai ou abonnement).
export const GRACE_DAYS = 7;

export type SubState = 'trial' | 'active' | 'grace' | 'expired';

interface OrgLike { plan: string; planExpiresAt: Date | string | null; }

export interface SubscriptionInfo {
  state: SubState;
  daysLeft: number | null;
  graceEndsAt: string | null;
  expiresAt: string | null;
  graceDays: number;
}

export function subscriptionState(org: OrgLike | null | undefined, now: Date = new Date()): SubscriptionInfo {
  const exp = org && org.planExpiresAt ? new Date(org.planExpiresAt) : null;
  if (!org || !exp) {
    return { state: 'active', daysLeft: null, graceEndsAt: null, expiresAt: null, graceDays: GRACE_DAYS };
  }
  const DAY = 86400000;
  const graceEndsAt = new Date(exp.getTime() + GRACE_DAYS * DAY);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / DAY);
  let state: SubState;
  if (now < exp) state = org.plan === 'TRIAL' ? 'trial' : 'active';
  else if (now < graceEndsAt) state = 'grace';
  else state = 'expired';
  return { state, daysLeft, graceEndsAt: graceEndsAt.toISOString(), expiresAt: exp.toISOString(), graceDays: GRACE_DAYS };
}

// Ecritures autorisees tant qu'on n'a pas depasse la periode de grace.
export function writeAllowed(org: OrgLike | null | undefined, now: Date = new Date()): boolean {
  return subscriptionState(org, now).state !== 'expired';
}
