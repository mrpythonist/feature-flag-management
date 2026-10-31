'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  AuditEntry,
  Project,
  formatTime,
  getToken,
  listAudit,
  listProjects,
} from '../../lib/api';

const ACTION_LABELS: Record<string, string> = {
  'project.created': 'Project created',
  'flag.created': 'Flag created',
  'flag.updated': 'Flag updated',
  'flag.deleted': 'Flag deleted',
  'config.updated': 'Config updated',
};

export default function AuditPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSlug, setProjectSlug] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [flagFilter, setFlagFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const unauthorized = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      router.push('/login');
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    listProjects()
      .then(({ projects }) => {
        setProjects(projects);
        if (projects.length > 0) setProjectSlug(projects[0].slug);
      })
      .catch((err) => {
        if (!unauthorized(err)) setError(err instanceof Error ? err.message : 'Failed to load projects');
      });
  }, [router]);

  const load = useCallback(async () => {
    if (!projectSlug) return;
    setLoading(true);
    setError(null);
    try {
      const { entries } = await listAudit(projectSlug, {
        flag: flagFilter.trim() || undefined,
        environment: envFilter || undefined,
        limit,
      });
      setEntries(entries);
    } catch (err) {
      if (!unauthorized(err)) setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [projectSlug, flagFilter, envFilter, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">Audit log</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Project</span>
          <select
            value={projectSlug}
            onChange={(e) => setProjectSlug(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Flag key</span>
          <input
            value={flagFilter}
            onChange={(e) => setFlagFilter(e.target.value)}
            placeholder="e.g. new_checkout"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Environment</span>
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="development">development</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Limit</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
        <button
          onClick={load}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          Apply filters
        </button>
      </div>

      {error && <p className="mb-4 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-400">No audit entries match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Flag</th>
                <th className="px-3 py-2">Env</th>
                <th className="px-3 py-2">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.map((e) => (
                <tr key={e.id} className="align-top hover:bg-slate-900/50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">{formatTime(e.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-300">{e.actor}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">{e.flagKey ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{e.environment ?? '—'}</td>
                  <td className="px-3 py-2">
                    <details className="text-xs">
                      <summary className="cursor-pointer text-blue-400 hover:text-blue-300">
                        before / after
                      </summary>
                      <div className="mt-1 grid gap-2 md:grid-cols-2">
                        <pre className="overflow-auto rounded bg-slate-950 p-2 text-slate-400">
                          {JSON.stringify(e.before, null, 2)}
                        </pre>
                        <pre className="overflow-auto rounded bg-slate-950 p-2 text-slate-300">
                          {JSON.stringify(e.after, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
