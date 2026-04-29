import type { RunProgress, RunProgressCallback, RunProgressPhase, TestStatus } from '../../shared/src/types.js';

export class ProgressTracker {
  private state: Omit<RunProgress, 'updatedAt'>;

  constructor(totalTests: number, private readonly onProgress?: RunProgressCallback) {
    this.state = {
      phase: 'queued',
      totalTests,
      completedTests: 0,
      passed: 0,
      failed: 0,
      error: 0,
    };
  }

  async phase(phase: RunProgressPhase): Promise<void> {
    await this.emit({ phase });
  }

  async startTest(name: string): Promise<void> {
    await this.emit({ phase: 'test', currentTest: name, currentStep: undefined });
  }

  async startStep(name: string): Promise<void> {
    await this.emit({ phase: 'step', currentStep: name });
  }

  async finishStep(status: TestStatus, name?: string): Promise<void> {
    await this.emit({ phase: status === 'passed' ? 'step' : 'error', currentStep: name ?? this.state.currentStep });
  }

  async finishTest(status: TestStatus): Promise<void> {
    const patch: Partial<Omit<RunProgress, 'updatedAt'>> = {
      phase: status === 'passed' ? 'running' : status,
      completedTests: this.state.completedTests + 1,
      currentStep: undefined,
    };
    if (status === 'passed') patch.passed = this.state.passed + 1;
    else if (status === 'failed') patch.failed = this.state.failed + 1;
    else if (status === 'error') patch.error = this.state.error + 1;
    await this.emit(patch);
  }

  async emit(patch: Partial<Omit<RunProgress, 'updatedAt'>>): Promise<void> {
    this.state = { ...this.state, ...patch };
    await this.onProgress?.({ ...this.state, updatedAt: new Date().toISOString() });
  }
}
