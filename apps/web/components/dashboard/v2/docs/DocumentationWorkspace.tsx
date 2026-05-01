'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Field } from '../shared/ui';
import { useDocumentationItems } from './documentationContent';

export function DocumentationWorkspace() {
  const docs = useDocumentationItems();

  const [activeId, setActiveId] = useState(docs[0].id);
  const [query, setQuery] = useState('');
  const filteredDocs = docs.filter((doc) => {
    const haystack = `${doc.group} ${doc.title} ${doc.description} ${doc.tags.join(' ')}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const activeDoc = docs.find((doc) => doc.id === activeId) ?? docs[0];
  const groupedDocs = filteredDocs.reduce<Record<string, typeof docs>>((groups, doc) => {
    groups[doc.group] = [...(groups[doc.group] ?? []), doc];
    return groups;
  }, {});

  return (
    <div className="grid min-h-[calc(100vh-160px)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)_220px]">
      <aside className="grid h-fit gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3 lg:sticky lg:top-4">
        <Field label="Buscar docs">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="flow, api, mcp..." />
        </Field>
        <ScrollArea className="max-h-[calc(100vh-280px)] pr-2">
          <div className="grid gap-4">
            {Object.entries(groupedDocs).map(([group, items]) => (
              <div key={group} className="grid gap-1">
                <p className="px-2 text-xs font-bold uppercase tracking-wide text-[#66705f]">{group}</p>
                {items.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setActiveId(doc.id)}
                    className={cn('grid gap-1 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f1e8]', activeDoc.id === doc.id ? 'bg-[#edf3cf] text-[#1f241f]' : 'text-[#4b5348]')}
                  >
                    <span className="font-semibold">{doc.title}</span>
                    <span className="line-clamp-2 text-xs text-[#66705f]">{doc.description}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <main className="min-w-0">
        <div className="grid gap-4">
          <div className="rounded-lg border border-[#e1ddd1] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-[#66705f]">{activeDoc.group}</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#1f241f]">{activeDoc.title}</h1>
                <p className="mt-2 max-w-3xl text-sm text-[#4b5348]">{activeDoc.description}</p>
              </div>
              <Badge variant="outline">{activeDoc.tags.length} topicos</Badge>
            </div>
          </div>
          {activeDoc.content}
        </div>
      </main>

      <aside className="hidden h-fit rounded-lg border border-[#e1ddd1] bg-white p-3 lg:sticky lg:top-4 lg:grid lg:gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[#66705f]">Nesta pagina</p>
        {activeDoc.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="w-fit">{tag}</Badge>
        ))}
        <Separator className="my-2" />
        <p className="text-xs text-[#66705f]">Use busca para achar sintaxe, exemplos e operacao sem trocar contexto.</p>
      </aside>
    </div>
  );
}
