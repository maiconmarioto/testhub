import { Badge } from '@/components/ui/badge';
import type { Run } from '../types';
import { formatDate } from '../shared/runUtils';

export function LiveProgress({ run }: { run: Run }) {
  const progress = run.progress;
  if (!progress) {
    return (
      <div className="rounded-lg border border-[#e1ddd1] bg-white p-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">Progresso ao vivo</p>
        <p className="mt-1 text-sm font-semibold">Aguardando worker...</p>
      </div>
    );
  }
  const percent = progress.totalTests > 0 ? Math.round((progress.completedTests / progress.totalTests) * 100) : 0;
  return (
    <div className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">Progresso ao vivo</p>
          <p className="mt-1 truncate text-sm font-semibold" title={progress.currentTest ?? progress.phase}>{progress.currentTest ?? progress.phase}</p>
          <p className="truncate font-mono text-xs text-[#66705f]" title={progress.currentStep ?? 'sem step atual'}>{progress.currentStep ?? 'sem step atual'}</p>
        </div>
        <Badge variant="warning">{progress.completedTests}/{progress.totalTests}</Badge>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#e9e5d9]">
        <div className="h-full bg-[#c9df4f] transition-all" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="text-xs text-[#66705f]">{progress.passed} ok · {progress.failed} falha(s) · {progress.error} erro(s) · última atualização {formatDate(run.heartbeatAt ?? progress.updatedAt)}</p>
    </div>
  );
}
