'use client';

import { useEffect, useMemo, useState } from 'react';

type Project = { id: string; name: string };
type Environment = { id: string; projectId: string; name: string; baseUrl: string };
type Suite = { id: string; projectId: string; name: string; type: string };
type Run = { id: string; status: string; summary?: unknown; error?: string; reportPath?: string; reportHtmlPath?: string; createdAt?: string; finishedAt?: string };
type Artifact = { type: string; path: string };
type RunReport = { artifacts?: Artifact[]; results?: Array<{ name: string; status: string; durationMs?: number; error?: string; artifacts?: Artifact[] }> };

const apiBase = process.env.NEXT_PUBLIC_TESTHUB_API_URL ?? 'http://localhost:4321';

export default function Page() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedEnv, setSelectedEnv] = useState('');
  const [selectedSuite, setSelectedSuite] = useState('');
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [aiOutput, setAiOutput] = useState('');
  const [spec, setSpec] = useState(`version: 1
type: api
name: health
tests:
  - name: health
    request:
      method: GET
      path: /
    expect:
      status: 200`);

  const projectEnvs = useMemo(() => envs.filter((env) => !selectedProject || env.projectId === selectedProject), [envs, selectedProject]);
  const projectSuites = useMemo(() => suites.filter((suite) => !selectedProject || suite.projectId === selectedProject), [suites, selectedProject]);

  async function refresh() {
    const [nextProjects, nextEnvs, nextSuites, nextRuns] = await Promise.all([
      api<Project[]>('/api/projects'),
      api<Environment[]>('/api/environments'),
      api<Suite[]>('/api/suites'),
      api<Run[]>('/api/runs'),
    ]);
    setProjects(nextProjects);
    setEnvs(nextEnvs);
    setSuites(nextSuites);
    setRuns(nextRuns);
    setSelectedProject((current) => current || nextProjects[0]?.id || '');
    setSelectedEnv((current) => current || nextEnvs[0]?.id || '');
    setSelectedSuite((current) => current || nextSuites[0]?.id || '');
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  async function createProject(formData: FormData) {
    await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: formData.get('name') }) });
    await refresh();
  }

  async function createEnv(formData: FormData) {
    await api('/api/environments', {
      method: 'POST',
      body: JSON.stringify({
        projectId: selectedProject,
        name: formData.get('name'),
        baseUrl: formData.get('baseUrl'),
        variables: parseVars(String(formData.get('variables') || '')),
      }),
    });
    await refresh();
  }

  async function createSuite(formData: FormData) {
    await api('/api/suites', {
      method: 'POST',
      body: JSON.stringify({ projectId: selectedProject, name: formData.get('name'), type: formData.get('type'), specContent: spec }),
    });
    await refresh();
  }

  async function importOpenApi(formData: FormData) {
    await api('/api/import/openapi', {
      method: 'POST',
      body: JSON.stringify({
        projectId: selectedProject,
        name: formData.get('name') || 'openapi-import',
        spec: JSON.parse(String(formData.get('spec') || '{}')),
      }),
    });
    await refresh();
  }

  async function runSuite() {
    await api('/api/runs', { method: 'POST', body: JSON.stringify({ projectId: selectedProject, environmentId: selectedEnv, suiteId: selectedSuite }) });
    await refresh();
  }

  async function cancelRun(run: Run) {
    await api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' });
    await refresh();
  }

  async function inspectRun(run: Run) {
    setSelectedRun(run);
    if (!run.reportPath) {
      setReport(null);
      return;
    }
    setReport(await api<RunReport>(`/api/runs/${run.id}/report`));
  }

  async function explain(run: Run) {
    const result = await api<{ output?: string }>('/api/ai/explain-failure', {
      method: 'POST',
      body: JSON.stringify({ context: run }),
    });
    setAiOutput(result.output ?? JSON.stringify(result, null, 2));
  }

  return (
    <main>
      <aside>
        <h1>TestHub</h1>
        <form action={createProject} className="panel">
          <h2>Projeto</h2>
          <input name="name" placeholder="CRM" />
          <button>Criar</button>
        </form>
        <section className="panel">
          <h2>Contexto</h2>
          <label>Projeto</label>
          <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </section>
        <form action={createEnv} className="panel">
          <h2>Ambiente</h2>
          <input name="name" placeholder="hml" />
          <input name="baseUrl" placeholder="https://app-hml.local" />
          <textarea name="variables" rows={4} placeholder="TOKEN=abc" />
          <button>Criar ambiente</button>
        </form>
        <form action={createSuite} className="panel">
          <h2>Suite</h2>
          <input name="name" placeholder="health" />
          <select name="type"><option value="api">api</option><option value="web">web</option></select>
          <textarea className="code" rows={14} value={spec} onChange={(event) => setSpec(event.target.value)} />
          <button>Criar suite</button>
        </form>
        <form action={importOpenApi} className="panel">
          <h2>Import OpenAPI</h2>
          <input name="name" placeholder="catalog-api" />
          <textarea name="spec" className="code" rows={8} placeholder='{"openapi":"3.0.0","paths":{"/health":{"get":{"responses":{"200":{"description":"ok"}}}}}}' />
          <button>Importar</button>
        </form>
      </aside>
      <section className="content">
        <div className="panel controls">
          <select value={selectedEnv} onChange={(event) => setSelectedEnv(event.target.value)}>
            {projectEnvs.map((env) => <option key={env.id} value={env.id}>{env.name} - {env.baseUrl}</option>)}
          </select>
          <select value={selectedSuite} onChange={(event) => setSelectedSuite(event.target.value)}>
            {projectSuites.map((suite) => <option key={suite.id} value={suite.id}>{suite.name} ({suite.type})</option>)}
          </select>
          <button onClick={runSuite}>Run</button>
        </div>
        <div className="panel">
          <h2>Runs</h2>
          <table>
            <thead><tr><th>Status</th><th>Run</th><th>Resumo</th><th>Ações</th></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className={run.status}>{run.status}</td>
                  <td>{run.id}</td>
                  <td><pre>{JSON.stringify(run.summary || run.error || {}, null, 2)}</pre></td>
                  <td>
                    {run.reportHtmlPath ? <a href={`${apiBase}/artifacts?path=${encodeURIComponent(run.reportHtmlPath)}`} target="_blank">Report</a> : null}
                    <button className="secondary" type="button" onClick={() => inspectRun(run)}>Detalhe</button>
                    {['queued', 'running'].includes(run.status) ? <button className="danger" type="button" onClick={() => cancelRun(run)}>Cancelar</button> : null}
                    <button className="secondary" type="button" onClick={() => explain(run)}>IA</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedRun ? (
          <div className="panel">
            <h2>Run {selectedRun.id}</h2>
            <p><strong>Status:</strong> <span className={selectedRun.status}>{selectedRun.status}</span></p>
            <p><strong>Criada:</strong> {selectedRun.createdAt ?? '-'} <strong>Fim:</strong> {selectedRun.finishedAt ?? '-'}</p>
            {selectedRun.error ? <pre>{selectedRun.error}</pre> : null}
            {report ? (
              <>
                <h3>Artifacts</h3>
                <ul>
                  {[...(report.artifacts ?? []), ...((report.results ?? []).flatMap((result) => result.artifacts ?? []))].map((artifact) => (
                    <li key={`${artifact.type}:${artifact.path}`}>
                      <a href={`${apiBase}/artifacts?path=${encodeURIComponent(artifact.path)}`} target="_blank">{artifact.type}</a>
                    </li>
                  ))}
                </ul>
                <h3>Testes</h3>
                <table>
                  <tbody>
                    {(report.results ?? []).map((result) => (
                      <tr key={result.name}>
                        <td className={result.status}>{result.status}</td>
                        <td>{result.name}</td>
                        <td>{result.durationMs ?? 0}ms</td>
                        <td>{result.error ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </div>
        ) : null}
        {aiOutput ? <div className="panel"><h2>AI Review</h2><pre>{aiOutput}</pre></div> : null}
      </section>
    </main>
  );
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function parseVars(input: string): Record<string, string> {
  return Object.fromEntries(input.split('\n').filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}
