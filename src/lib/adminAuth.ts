// BILNOV — Module PACKS : contrôle d'accès à la console d'administration plateforme.
//
// Phase 1 : la liste des administrateurs plateforme est pilotée par la variable
// d'environnement PLATFORM_ADMIN_EMAILS (emails séparés par des virgules). Cela évite
// toute migration de la table `users` pour ce premier déploiement. Une phase ultérieure
// pourra basculer sur un drapeau en base (users.is_platform_admin, déjà prévu par la
// migration SQL) sans changer les appels `requireAdmin` des routes.
import { NextRequest } from 'next/server';
import { getCurrentUser, apiError, type JwtPayload } from './auth';

export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.toLowerCase());
}

/**
 * Renvoie l'utilisateur si c'est un administrateur plateforme, sinon une Response d'erreur
 * (401/403) à retourner directement. Convention identique au reste de l'API.
 */
export async function requireAdmin(req: NextRequest): Promise<JwtPayload | Response> {
  const user = await getCurrentUser(req);
  if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
  if (!isPlatformAdminEmail(user.email)) return apiError('Accès administrateur requis', 'FORBIDDEN', 403);
  return user;
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}
