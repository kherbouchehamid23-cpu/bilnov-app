import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback_secret_change_in_prod';

// Politique de session : 4h d'inactivite max (fenetre glissante), plafond absolu 30 jours.
export const IDLE_SECONDS = 4 * 60 * 60;
export const REFRESH_MAX_SECONDS = 30 * 24 * 60 * 60;

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_MAX_SECONDS });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function getCurrentUser(req: NextRequest): Promise<JwtPayload | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

export function apiError(message: string, code: string, status: number) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

export function apiSuccess(data: unknown, status = 200) {
  const json = JSON.stringify({ success: true, data }, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  );
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
