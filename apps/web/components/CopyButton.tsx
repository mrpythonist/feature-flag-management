'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable (e.g. non-secure context); keep silent.
    }
  };

  return (
    <button
      onClick={copy}
      className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
      title={text}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
