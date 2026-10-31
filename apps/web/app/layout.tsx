import type { Metadata } from 'next';
import Nav from '../components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Feature Flag & Release Management Platform',
  description: 'Manage feature flags across development, staging, and production.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
