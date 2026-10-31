'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, setToken } from '../lib/api';

export default function Nav() {
  const [loggedIn, setLoggedIn] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, [pathname]);

  if (pathname === '/login') return null;

  const logout = () => {
    setToken(null);
    router.push('/login');
  };

  const link = (href: string, label: string) => (
    <a
      key={href}
      href={href}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        pathname === href ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {label}
    </a>
  );

  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <a href="/flags" className="text-sm font-bold tracking-wide text-white">
            Feature Flag Platform
          </a>
          <nav className="flex items-center gap-1">
            {link('/flags', 'Flags')}
            {link('/audit', 'Audit log')}
          </nav>
        </div>
        {loggedIn && (
          <button
            onClick={logout}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Log out
          </button>
        )}
      </div>
    </header>
  );
}
