import { cn } from '@/lib/utils';
import { DarkEmpty } from '../shared';
import type { FlowPreviewRow } from './flowBuilderTypes';

export function FlowStepHeader({ index, title, description }: { index: number; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#e8e6dc] bg-white text-sm font-black text-[#141413]">{index}</span>
      <div className="min-w-0">
        <h2 className="text-base font-extrabold text-[#141413]">{title}</h2>
        <p className="text-sm text-[#66705f]">{description}</p>
      </div>
    </div>
  );
}

export function FlowHumanPreview({ rows, compact = false }: { rows: FlowPreviewRow[]; compact?: boolean }) {
  return (
    <aside className={cn('grid content-start gap-3 rounded-lg border border-[#e8e6dc] bg-[#faf9f5] p-3', compact && 'bg-white')}>
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#788c5d]">Preview humano</p>
        <p className="mt-1 text-sm text-[#66705f]">Leitura do fluxo sem YAML.</p>
      </div>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={`${row.index}:${row.title}:${row.detail}:preview`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-[#e8e6dc] bg-white font-mono text-[11px] font-bold">{row.index}</span>
            <div className="min-w-0 rounded-md border border-[#e8e6dc] bg-white p-2">
              <p className="truncate text-sm font-bold">{row.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[#66705f]">{row.detail}</p>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <DarkEmpty text="Sem passos para exibir." /> : null}
      </div>
    </aside>
  );
}
