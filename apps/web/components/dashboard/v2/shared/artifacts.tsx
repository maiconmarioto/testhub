'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useArtifactTextQuery } from '../query/useArtifactQueries';
import { messageOf } from './formUtils';
import { artifactUrl, shortPath } from './runUtils';
import { Signal } from './ui';

export function ArtifactLink({ label, path, type, compact }: { label: string; path: string; type: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const logQuery = useArtifactTextQuery(path, open && type === 'log');

  function openLog() {
    setOpen(true);
  }

  if (type === 'log') {
    return (
      <>
        <button
          type="button"
          className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white text-left text-sm transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', compact ? 'p-2' : 'p-3')}
          onClick={openLog}
        >
          <span className="min-w-0 truncate font-semibold">{label}</span>
          <Badge variant="outline">{type}</Badge>
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription className="break-all font-mono text-xs">{shortPath(path)}</DialogDescription>
            </DialogHeader>
            {logQuery.error ? <Signal tone="bad" text={messageOf(logQuery.error)} /> : null}
            <pre className="max-h-[70vh] overflow-auto rounded-lg bg-[#0b100c] p-4 font-mono text-xs leading-5 text-[#f7f6f0]">{logQuery.isLoading ? 'Carregando...' : logQuery.data || 'Sem logs.'}</pre>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <a className={cn('flex items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white text-sm transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', compact ? 'p-2' : 'p-3')} href={artifactUrl(path)} target="_blank">
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <Badge variant="outline">{type}</Badge>
    </a>
  );
}
