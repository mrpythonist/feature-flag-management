'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CopyButton from '../../components/CopyButton';
import {
  ApiError,
  Environment,
  Flag,
  Project,
  createFlag,
  deleteFlag,
  getToken,
  listEnvironments,
  listFlags,
  listProjects,
  updateConfig,
} from '../../lib/api';

const PROJECT_KEY = 'ff_project_slug';

export default function FlagsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSlug, setProjectSlug] = useState<string>('');
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnv, setActiveEnv] = useState<string>('development');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const unauthorized = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return true;
      }
      return false;
    },
    [router],
  );

  const loadProjects = useCallback(async () => {
    try {
      const { projects } = await listProjects();
      setProjects(projects);
      if (projects.length > 0) {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(PROJECT_KEY) : null;
        const slug = saved && projects.some((p) => p.slug === saved) ? saved : projects[0].slug;
        setProjectSlug(slug);
      }
    } catch (err) {
      if (!unauthorized(err)) setError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  }, [unauthorized]);

  const loadData = useCallback(
    async (slug: string) => {
      setLoading(true);
      setError(null);
      try {
        const [{ environments }, { flags }] = await Promise.all([
          listEnvironments(slug),
          listFlags(slug),
        ]);
        setEnvironments(environments);
        setFlags(flags);
        if (!environments.some((e) => e.name === activeEnv) && environments.length > 0) {
          setActiveEnv(environments[0].name);
        }
      } catch (err) {
        if (!unauthorized(err)) setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    },
    [activeEnv, unauthorized],
  );

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    loadProjects();
  }, [loadProjects, router]);

  useEffect(() => {
    if (projectSlug) loadData(projectSlug);
  }, [projectSlug, loadData]);

  const changeProject = (slug: string) => {
    setProjectSlug(slug);
    localStorage.setItem(PROJECT_KEY, slug);
  };

  const env = environments.find((e) => e.name === activeEnv);

  return (
    <div>
      {/* Project + environment switcher */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Project</span>
          <select
            value={projectSlug}
            onChange={(e) => changeProject(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1 rounded border border-slate-700 p-1">
          {environments.map((e) => (
            <button
              key={e.id}
              onClick={() => setActiveEnv(e.name)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                e.name === activeEnv ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {e.name}
            </button>
          ))}
        </div>

        {env && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              SDK key: <code className="text-slate-200">{env.sdkKey.slice(0, 12)}…</code>
            </span>
            <CopyButton text={env.sdkKey} label="Copy SDK key" />
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      <CreateFlagForm
        projectSlug={projectSlug}
        onCreated={(flag) => setFlags((fs) => [...fs, flag])}
        unauthorized={unauthorized}
      />

      {loading ? (
        <p className="text-sm text-slate-400">Loading flags…</p>
      ) : flags.length === 0 ? (
        <p className="text-sm text-slate-400">No flags yet. Create the first one above.</p>
      ) : (
        <div className="space-y-4">
          {flags.map((flag) => (
            <FlagCard
              key={`${flag.id}:${activeEnv}`}
              flag={flag}
              projectSlug={projectSlug}
              environments={environments}
              activeEnv={activeEnv}
              unauthorized={unauthorized}
              onChanged={(updated) =>
                setFlags((fs) => fs.map((f) => (f.id === updated.id ? updated : f)))
              }
              onDeleted={() => setFlags((fs) => fs.filter((f) => f.id !== flag.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateFlagForm({
  projectSlug,
  onCreated,
  unauthorized,
}: {
  projectSlug: string;
  onCreated: (flag: Flag) => void;
  unauthorized: (err: unknown) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { flag } = await createFlag(projectSlug, key.trim(), name.trim(), description.trim());
      onCreated(flag);
      setKey('');
      setName('');
      setDescription('');
      setOpen(false);
    } catch (err) {
      if (!unauthorized(err)) setError(err instanceof Error ? err.message : 'Failed to create flag');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
      >
        + Create flag
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold">Create flag</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Key (e.g. new_checkout)</span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            pattern="[a-z0-9_.-]+"
            title="Lowercase letters, digits, _ . -"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FlagCard({
  flag,
  projectSlug,
  environments,
  activeEnv,
  unauthorized,
  onChanged,
  onDeleted,
}: {
  flag: Flag;
  projectSlug: string;
  environments: Environment[];
  activeEnv: string;
  unauthorized: (err: unknown) => boolean;
  onChanged: (flag: Flag) => void;
  onDeleted: () => void;
}) {
  const config = flag.configs.find((c) => c.environment === activeEnv);
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [rollout, setRollout] = useState(config?.rolloutPercentage ?? 0);
  const [targets, setTargets] = useState((config?.targetedUsers ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const targetedUsers = targets
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t !== '');
      const { config: updated } = await updateConfig(projectSlug, flag.key, activeEnv, {
        enabled,
        rolloutPercentage: rollout,
        targetedUsers,
      });
      onChanged({
        ...flag,
        configs: flag.configs.map((c) =>
          c.environment === activeEnv ? { ...c, ...updated } : c,
        ),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (!unauthorized(err)) setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteFlag(projectSlug, flag.key);
      onDeleted();
    } catch (err) {
      if (!unauthorized(err)) setError(err instanceof Error ? err.message : 'Delete failed');
      setConfirmDelete(false);
    }
  };

  const envStatus = (envName: string) => {
    const c = flag.configs.find((x) => x.environment === envName);
    if (!c) return null;
    return (
      <span
        key={envName}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          c.enabled ? 'bg-green-950 text-green-300' : 'bg-slate-800 text-slate-400'
        }`}
        title={c.enabled ? `Rollout ${c.rolloutPercentage}%, targets: ${c.targetedUsers.join(', ') || 'none'}` : 'Disabled'}
      >
        {envName}: {c.enabled ? 'on' : 'off'}
        {c.enabled && c.rolloutPercentage > 0 ? ` ${c.rolloutPercentage}%` : ''}
      </span>
    );
  };

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">{flag.name}</h2>
            <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-300">{flag.key}</code>
          </div>
          {flag.description && <p className="mt-1 text-sm text-slate-400">{flag.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">{environments.map((e) => envStatus(e.name))}</div>
        </div>
        <div>
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-red-300">Delete this flag?</span>
              <button onClick={remove} className="rounded bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-500">
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-red-300"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {config ? (
        <div className="rounded border border-slate-800 bg-slate-950 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {activeEnv} config
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex cursor-pointer items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`}
                />
              </button>
              <span className="text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Rollout: {rollout}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={rollout}
                onChange={(e) => setRollout(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Targeted users (comma-separated)</span>
              <input
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                placeholder="user_123, user_456"
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && <span className="text-sm text-green-400">Saved</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No config for the {activeEnv} environment.</p>
      )}
    </div>
  );
}
