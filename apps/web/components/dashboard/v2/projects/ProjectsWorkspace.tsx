'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Environment, Project, Run, Suite } from '../types';
import { shortId, suiteTypeLabel } from '../shared/runUtils';
import { DarkEmpty, Field } from '../shared/ui';

export function ProjectsWorkspace(props: {
  projects: Project[];
  envs: Environment[];
  suites: Suite[];
  runs: Run[];
  selectedProjectId: string;
  projectDraft: { id: string; name: string; description: string; retentionDays: string; cleanupArtifacts: boolean };
  envDraft: { id: string; name: string; baseUrl: string; variables: string };
  busy: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  onSelectProject: (id: string) => void;
  onProjectDraftChange: (draft: { id: string; name: string; description: string; retentionDays: string; cleanupArtifacts: boolean }) => void;
  onSaveProject: () => void;
  onNewProject: () => void;
  onArchiveProject: (project: Project) => void;
  onEnvDraftChange: (draft: { id: string; name: string; baseUrl: string; variables: string }) => void;
  onEditEnv: (env: Environment) => void;
  onNewEnv: () => void;
  onSaveEnv: () => void;
  onArchiveEnv: (env: Environment) => void;
}) {
  const selectedProject = props.projects.find((project) => project.id === props.selectedProjectId);
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Projetos</CardTitle>
              <CardDescription>{props.projects.length} ativos</CardDescription>
            </div>
            <Button size="sm" onClick={props.onNewProject} disabled={!props.canWrite}>Novo</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {props.projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => props.onSelectProject(project.id)}
              className={cn('grid gap-1 rounded-lg border bg-white p-3 text-left transition hover:border-[#9fb25a]', project.id === props.selectedProjectId ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}
            >
              <span className="break-words font-semibold">{project.name}</span>
              <span className="font-mono text-xs text-[#66705f]">{shortId(project.id)}</span>
            </button>
          ))}
          {props.projects.length === 0 ? <DarkEmpty text="Nenhum projeto." /> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{props.projectDraft.id ? 'Editar projeto' : 'Criar projeto'}</CardTitle>
                <CardDescription>{selectedProject ? `${props.envs.length} ambientes · ${props.suites.length} suites · ${props.runs.length} runs` : 'Selecione ou crie um projeto.'}</CardDescription>
              </div>
              {selectedProject && props.canAdmin ? <Button variant="destructive" size="sm" onClick={() => props.onArchiveProject(selectedProject)}><Trash2 data-icon="inline-start" />Arquivar</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_120px_auto] md:items-end">
            <Field label="Nome"><Input value={props.projectDraft.name} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, name: event.target.value })} /></Field>
            <Field label="Descrição"><Input value={props.projectDraft.description} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, description: event.target.value })} /></Field>
            <Field label="Retention"><Input type="number" min={1} value={props.projectDraft.retentionDays} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, retentionDays: event.target.value })} /></Field>
            <label className="flex h-10 items-center gap-2 rounded-md border border-[#d7d2c4] bg-white px-3 text-sm">
              <input type="checkbox" checked={props.projectDraft.cleanupArtifacts} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, cleanupArtifacts: event.target.checked })} />
              Artefatos
            </label>
            <Button onClick={props.onSaveProject} disabled={props.busy || !props.canWrite || !props.projectDraft.name.trim()}>Salvar projeto</Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Ambientes do projeto</CardTitle>
              <CardDescription>Ambientes e URLs ficam aqui, dentro do projeto.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {props.envs.map((env) => (
                <div key={env.id} className={cn('grid gap-3 rounded-lg border bg-white p-3', props.envDraft.id === env.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{env.name}</p>
                      <p className="break-all font-mono text-xs text-[#66705f]">{env.baseUrl}</p>
                    </div>
                    <Badge variant="outline">{Object.keys(env.variables ?? {}).length} variáveis</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => props.onEditEnv(env)} disabled={!props.canWrite}>Editar</Button>
                    <Button variant="destructive" size="sm" onClick={() => props.onArchiveEnv(env)} disabled={!props.canAdmin}>Arquivar</Button>
                  </div>
                </div>
              ))}
              {props.envs.length === 0 ? <DarkEmpty text="Nenhum ambiente neste projeto." /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{props.envDraft.id ? 'Editar ambiente' : 'Novo ambiente'}</CardTitle>
                  <CardDescription>{props.envDraft.id ? shortId(props.envDraft.id) : 'Ambiente do projeto.'}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={props.onNewEnv} disabled={!props.canWrite}>Novo</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Field label="Nome"><Input value={props.envDraft.name} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, name: event.target.value })} placeholder="hml" /></Field>
              <Field label="Base URL"><Input value={props.envDraft.baseUrl} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, baseUrl: event.target.value })} placeholder="https://app.local" /></Field>
              <Field label="Variáveis"><Textarea className="min-h-36 font-mono text-xs" value={props.envDraft.variables} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, variables: event.target.value })} placeholder="TOKEN=abc" /></Field>
              <Button onClick={props.onSaveEnv} disabled={props.busy || !props.canWrite || !props.selectedProjectId || !props.envDraft.name.trim() || !props.envDraft.baseUrl.trim()}>Salvar ambiente</Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Suites vinculadas</CardTitle>
            <CardDescription>Listagem simples. Edicao fica na tela de suites.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {props.suites.map((suite) => (
              <div key={suite.id} className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{suite.name}</p>
                    <p className="font-mono text-xs text-[#66705f]">{shortId(suite.id)}</p>
                  </div>
                  <Badge variant={suite.type === 'api' ? 'secondary' : 'outline'}>{suiteTypeLabel(suite.type)}</Badge>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/suites?project=${suite.projectId}&suite=${suite.id}`}>Alterar</Link>
                </Button>
              </div>
            ))}
            {props.suites.length === 0 ? <DarkEmpty text="Nenhuma suite neste projeto." /> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
