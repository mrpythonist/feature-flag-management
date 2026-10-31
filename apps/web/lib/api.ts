// Typed client for the feature-flag API. The dashboard calls the API from the
// browser, so NEXT_PUBLIC_API_URL must be reachable from the browser.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TOKEN_KEY = 'ff_admin_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || res.statusText;
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // fall through with raw text
    }
    throw new ApiError(res.status, `API ${res.status}: ${message}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- types

export interface Project {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Environment {
  id: string;
  name: string;
  sdkKey: string;
  createdAt: string;
}

export interface FlagConfigView {
  environmentId: string;
  environment: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetedUsers: string[];
  updatedAt: string;
}

export interface Flag {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  configs: FlagConfigView[];
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  flagKey: string | null;
  environment: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

// -------------------------------------------------------------- endpoints

export const login = (email: string, password: string) =>
  api<{ token: string; email: string; role: string }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const listProjects = () => api<{ projects: Project[] }>('/admin/projects');

export const createProject = (name: string, slug: string) =>
  api<{ project: Project }>('/admin/projects', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  });

export const listEnvironments = (slug: string) =>
  api<{ environments: Environment[] }>(`/admin/projects/${slug}/environments`);

export const listFlags = (slug: string) =>
  api<{ flags: Flag[] }>(`/admin/projects/${slug}/flags`);

export const createFlag = (slug: string, key: string, name: string, description: string) =>
  api<{ flag: Flag }>(`/admin/projects/${slug}/flags`, {
    method: 'POST',
    body: JSON.stringify({ key, name, description }),
  });

export const updateFlag = (slug: string, key: string, patch: { name?: string; description?: string }) =>
  api<{ flag: Flag }>(`/admin/projects/${slug}/flags/${key}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });

export const updateConfig = (
  slug: string,
  key: string,
  env: string,
  patch: { enabled?: boolean; rolloutPercentage?: number; targetedUsers?: string[] },
) =>
  api<{ config: FlagConfigView }>(`/admin/projects/${slug}/flags/${key}/config/${env}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });

export const deleteFlag = (slug: string, key: string) =>
  api<void>(`/admin/projects/${slug}/flags/${key}`, { method: 'DELETE' });

export function buildAuditQuery(opts: { flag?: string; environment?: string; limit?: number }): string {
  const params = new URLSearchParams();
  if (opts.flag) params.set('flag', opts.flag);
  if (opts.environment) params.set('environment', opts.environment);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const listAudit = (slug: string, opts: { flag?: string; environment?: string; limit?: number }) =>
  api<{ entries: AuditEntry[] }>(`/admin/projects/${slug}/audit${buildAuditQuery(opts)}`);

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
