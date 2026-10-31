import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AdminTokenPayload {
  sub: string; // AdminUser id
  email: string;
  role: string;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign(payload, secret, { expiresIn: '12h' });
}

/**
 * Admin authentication middleware. Expects `Authorization: Bearer <token>`.
 * On success attaches `{ id, email, role }` as `req.admin`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'server misconfigured: JWT_SECRET missing' });
    return;
  }
  try {
    const decoded = jwt.verify(header.slice('Bearer '.length), secret) as AdminTokenPayload;
    req.admin = { id: decoded.sub, email: decoded.email, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}
