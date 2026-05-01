'use client';

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DocHero({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[#d7d2c4] bg-[#fbfaf6] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-[#66705f]">Wiki operacional</p>
      <h2 className="mt-2 text-2xl font-semibold text-[#1f241f]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-[#4b5348]">{description}</p>
    </div>
  );
}

export function DocPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DocCallout({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-[#c9d78c] bg-[#f2f6d8] p-4">
      <p className="font-semibold text-[#1f241f]">{title}</p>
      <p className="mt-1 text-sm text-[#4b5348]">{text}</p>
    </div>
  );
}

export function DocStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-[#e1ddd1] bg-white p-3">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[#4b5348]">{text}</p>
    </div>
  );
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-auto rounded-lg border border-[#d8d3c5] bg-[#111611] p-3 text-xs leading-relaxed text-[#f7f6f0]">
      <code>{code}</code>
    </pre>
  );
}
