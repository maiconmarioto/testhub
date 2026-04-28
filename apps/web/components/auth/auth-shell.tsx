import type React from 'react';
import Link from 'next/link';
import { TerminalSquare } from 'lucide-react';

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  links?: Array<{ href: string; label: string }>;
};

export function AuthShell({ title, description, children, links = [] }: AuthShellProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f2eb] px-4 py-8 text-[#1f241f]">
      <section className="w-full max-w-md rounded-xl border border-[#d8d3c5] bg-[#fbfaf6] p-5 shadow-sm">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#d7e35f] text-[#111611]">
            <TerminalSquare className="h-6 w-6" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#66705f]">TestHub</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-normal">{title}</h1>
            <p className="mt-1 text-sm text-[#66705f]">{description}</p>
          </div>
        </div>
        {children}
        {links.length > 0 ? (
          <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#e1ddd1] pt-4 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="font-semibold text-[#1d4f3a] underline-offset-4 hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
