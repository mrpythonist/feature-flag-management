// Augments Express Request with the authenticated admin user (set by requireAdmin).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: { id: string; email: string; role: string };
    }
  }
}

export {};
