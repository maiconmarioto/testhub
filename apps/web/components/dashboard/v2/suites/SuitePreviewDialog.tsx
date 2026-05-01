'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SuiteWithContent } from '../types';
import { shortId, suiteTypeLabel } from '../shared/runUtils';
import { YamlEditor } from '../yaml/YamlEditor';

export function SuitePreviewDialog({ open, suite, projectId, onOpenChange }: { open: boolean; suite: SuiteWithContent | null; projectId: string; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{suite?.name ?? 'Suite'}</DialogTitle>
          <DialogDescription>{suite ? `${suiteTypeLabel(suite.type)} · ${shortId(suite.id)}` : 'YAML somente leitura da suite selecionada.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <YamlEditor value={suite?.specContent ?? ''} onChange={() => undefined} readOnly height="520px" />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            {suite ? (
              <Button asChild>
                <Link href={`/suites?project=${projectId}&suite=${suite.id}`}>Alterar</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
