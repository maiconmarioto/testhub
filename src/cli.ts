#!/usr/bin/env node
import { Command } from 'commander';
import { getExitCodeForError, runSpec, validateSpec } from './runner.js';
import { cleanupOldRuns } from './cleanup.js';
import { createStore } from './store-factory.js';

const program = new Command();

program
  .name('testhub')
  .description('TestHub runner CLI para Web Smoke e API Contract specs')
  .version('0.1.0');

program
  .command('validate')
  .description('Valida uma spec YAML')
  .argument('<spec>', 'Caminho da spec YAML')
  .action((specPath: string) => {
    try {
      const spec = validateSpec(specPath);
      console.log(`OK: ${spec.name} (${spec.type})`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(getExitCodeForError(error));
    }
  });

program
  .command('run')
  .description('Executa uma spec YAML')
  .argument('<spec>', 'Caminho da spec YAML')
  .option('--base-url <url>', 'Sobrescreve baseUrl da spec')
  .option('--report-dir <dir>', 'Diretorio de reports', '.testhub-runs')
  .option('--env-file <file>', 'Arquivo .env simples')
  .option('--headed', 'Roda browser visivel')
  .option('--no-html', 'Nao gera report HTML')
  .option('--junit', 'Gera report JUnit XML')
  .option('--tag <tag...>', 'Executa apenas testes com uma ou mais tags')
  .action(async (specPath: string, commandOptions: Record<string, unknown>) => {
    try {
      const report = await runSpec({
        specPath,
        baseUrl: commandOptions.baseUrl as string | undefined,
        reportDir: commandOptions.reportDir as string,
        envFile: commandOptions.envFile as string | undefined,
        headed: Boolean(commandOptions.headed),
        noHtml: commandOptions.html === false,
        junit: Boolean(commandOptions.junit),
        tags: commandOptions.tag as string[] | undefined,
      });

      const failed = report.summary.failed + report.summary.error;
      console.log(`${report.suiteName}: ${failed === 0 ? 'PASSED' : 'FAILED'}`);
      console.log(`Run: ${report.id}`);
      console.log(`Total=${report.summary.total} Passed=${report.summary.passed} Failed=${report.summary.failed} Error=${report.summary.error}`);
      console.log(`Report JSON: ${report.artifacts.find((artifact) => artifact.type === 'json')?.path ?? 'N/A'}`);
      const html = report.artifacts.find((artifact) => artifact.type === 'html');
      if (html) console.log(`Report HTML: ${html.path}`);
      process.exit(failed === 0 ? 0 : 1);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(getExitCodeForError(error));
    }
  });

program
  .command('server')
  .description('Inicia API + dashboard local')
  .option('--port <port>', 'Porta HTTP', '4321')
  .action(async (options: { port: string }) => {
    process.env.PORT = options.port;
    const { createApp } = await import('./server.js');
    const app = createApp();
    await app.listen({ port: Number(options.port), host: '0.0.0.0' });
    console.log(`TestHub server: http://localhost:${options.port}`);
  });

program
  .command('cleanup')
  .description('Remove runs antigos da store e artifacts locais')
  .option('--days <days>', 'Idade minima em dias', '30')
  .action(async (options: { days: string }) => {
    try {
      const result = await cleanupOldRuns(createStore(), Number(options.days));
      console.log(`Cutoff: ${result.cutoffIso}`);
      console.log(`Runs removidas: ${result.deletedRuns}`);
      console.log(`Diretorios removidos: ${result.deletedDirectories}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(3);
    }
  });

program.parseAsync(process.argv);
