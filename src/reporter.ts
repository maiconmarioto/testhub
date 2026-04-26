import path from 'node:path';
import fs from 'node:fs';
import type { Artifact, RunReport, TestHubSpec, TestResult } from './types.js';
import { ensureDir, writeJson } from './fs-utils.js';

export function createRunReport(input: {
  id: string;
  specPath: string;
  spec: TestHubSpec;
  baseUrl?: string;
  startedAt: Date;
  finishedAt: Date;
  results: TestResult[];
  runDir: string;
  writeHtml?: boolean;
  writeJunit?: boolean;
}): RunReport {
  const summary = {
    total: input.results.length,
    passed: input.results.filter((result) => result.status === 'passed').length,
    failed: input.results.filter((result) => result.status === 'failed').length,
    skipped: input.results.filter((result) => result.status === 'skipped').length,
    error: input.results.filter((result) => result.status === 'error').length,
  };
  const report: RunReport = {
    id: input.id,
    specPath: input.specPath,
    suiteName: input.spec.name,
    type: input.spec.type,
    baseUrl: input.baseUrl,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    summary,
    results: input.results,
    artifacts: [],
  };

  const jsonPath = path.join(input.runDir, 'report.json');
  report.artifacts.push({ type: 'json', path: jsonPath, label: 'JSON report' });
  writeJson(jsonPath, report);

  if (input.writeHtml !== false) {
    const htmlPath = path.join(input.runDir, 'report.html');
    ensureDir(path.dirname(htmlPath));
    const html = renderHtml(report, input.runDir);
    fs.writeFileSync(htmlPath, html, 'utf8');
    report.artifacts.push({ type: 'html', path: htmlPath, label: 'HTML report' });
    writeJson(jsonPath, report);
  }

  if (input.writeJunit) {
    const junitPath = path.join(input.runDir, 'junit.xml');
    fs.writeFileSync(junitPath, renderJunit(report), 'utf8');
    report.artifacts.push({ type: 'xml', path: junitPath, label: 'JUnit XML' });
    writeJson(jsonPath, report);
  }

  return report;
}

function renderHtml(report: RunReport, runDir: string): string {
  const rows = report.results
    .map(
      (result) => `
        <section class="test ${escapeHtml(result.status)}">
          <h2>${escapeHtml(result.name)} <span>${escapeHtml(result.status)}</span></h2>
          <p><strong>Duração:</strong> ${result.durationMs}ms</p>
          ${result.error ? `<pre class="error">${escapeHtml(result.error)}</pre>` : ''}
          ${renderSteps(result)}
          ${renderArtifacts(result.artifacts, runDir)}
        </section>
      `,
    )
    .join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TestHub Report - ${escapeHtml(report.suiteName)}</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #1f2937; background: #f8fafc; }
    header, section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    h1, h2 { margin: 0 0 12px; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; }
    .pill { padding: 6px 10px; border-radius: 999px; background: #f1f5f9; font-weight: 600; }
    .passed h2 span { color: #047857; }
    .failed h2 span, .error h2 span { color: #b91c1c; }
    pre { white-space: pre-wrap; overflow: auto; background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; }
    .error { background: #450a0a; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(report.suiteName)}</h1>
    <p><strong>Tipo:</strong> ${report.type} | <strong>Run:</strong> ${report.id}</p>
    <p><strong>Base URL:</strong> ${escapeHtml(report.baseUrl ?? 'N/A')}</p>
    <div class="summary">
      <span class="pill">Total ${report.summary.total}</span>
      <span class="pill">Passed ${report.summary.passed}</span>
      <span class="pill">Failed ${report.summary.failed}</span>
      <span class="pill">Error ${report.summary.error}</span>
      <span class="pill">${report.durationMs}ms</span>
    </div>
  </header>
  ${rows}
</body>
</html>`;
}

function renderSteps(result: TestResult): string {
  if (!result.steps?.length) return '';
  const rows = result.steps
    .map(
      (step) => `<tr><td>${step.index + 1}</td><td>${escapeHtml(step.status)}</td><td>${escapeHtml(step.name)}</td><td>${escapeHtml(step.error ?? '')}</td></tr>`,
    )
    .join('\n');
  return `<table><thead><tr><th>#</th><th>Status</th><th>Step</th><th>Erro</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderArtifacts(artifacts: Artifact[], runDir: string): string {
  if (artifacts.length === 0) return '';
  const links = artifacts
    .map((artifact) => {
      const href = path.relative(runDir, artifact.path).replaceAll(path.sep, '/');
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(artifact.label ?? artifact.type)}</a> <code>${escapeHtml(artifact.type)}</code></li>`;
    })
    .join('\n');
  return `<h3>Artifacts</h3><ul>${links}</ul>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderJunit(report: RunReport): string {
  const failures = report.summary.failed + report.summary.error;
  const testcases = report.results
    .map((result) => {
      const failure =
        result.status === 'passed'
          ? ''
          : `<failure message="${escapeXml(result.error ?? result.status)}">${escapeXml(result.error ?? '')}</failure>`;
      return `<testcase classname="${escapeXml(report.suiteName)}" name="${escapeXml(result.name)}" time="${(result.durationMs / 1000).toFixed(3)}">${failure}</testcase>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${escapeXml(report.suiteName)}" tests="${report.summary.total}" failures="${failures}" errors="0" skipped="${report.summary.skipped}" time="${(report.durationMs / 1000).toFixed(3)}">
    ${testcases}
  </testsuite>
</testsuites>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
