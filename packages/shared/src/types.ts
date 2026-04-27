export type TestType = 'web' | 'api';
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'error';

export interface RunOptions {
  specPath: string;
  baseUrl?: string;
  reportDir: string;
  envFile?: string;
  headed?: boolean;
  project?: string;
  environment?: string;
  noHtml?: boolean;
  junit?: boolean;
  tags?: string[];
}

export interface Artifact {
  type: 'screenshot' | 'video' | 'trace' | 'request' | 'response' | 'log' | 'html' | 'json' | 'xml';
  path: string;
  label?: string;
}

export interface StepResult {
  index: number;
  name: string;
  status: TestStatus;
  durationMs: number;
  error?: string;
  artifacts?: Artifact[];
}

export interface TestResult {
  name: string;
  status: TestStatus;
  durationMs: number;
  failedStepIndex?: number;
  error?: string;
  steps?: StepResult[];
  artifacts: Artifact[];
  metadata?: Record<string, unknown>;
}

export interface RunReport {
  id: string;
  specPath: string;
  suiteName: string;
  type: TestType;
  baseUrl?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    error: number;
  };
  results: TestResult[];
  artifacts: Artifact[];
}

export type SelectorInput =
  | string
  | {
      by?: 'label' | 'text' | 'role' | 'testId' | 'css' | 'placeholder';
      target?: string;
      value?: string;
      role?: string;
      name?: string;
      exact?: boolean;
      selector?: string;
      text?: string;
    };

export interface WebSpec {
  version: number;
  type: 'web';
  name: string;
  description?: string;
  baseUrl?: string;
  defaults?: {
    timeoutMs?: number;
    screenshotOnFailure?: boolean;
    screenshotOnSuccess?: boolean;
    video?: boolean | 'on' | 'off' | 'retain-on-failure';
    trace?: boolean | 'on' | 'off' | 'retain-on-failure';
    retries?: number;
  };
  variables?: Record<string, string | number | boolean>;
  beforeEach?: WebStep[];
  afterEach?: WebStep[];
  tests: WebTest[];
}

export interface WebTest {
  name: string;
  tags?: string[];
  timeoutMs?: number;
  skip?: boolean | string;
  only?: boolean;
  retries?: number;
  steps: WebStep[];
}

export type WebStep =
  | { goto: string }
  | { click: SelectorInput }
  | { fill: SelectorInput & { value?: string } }
  | { select: SelectorInput & { value?: string } }
  | { check: SelectorInput }
  | { press: (SelectorInput & { key?: string }) | string }
  | { waitFor: number | string }
  | { expectText: string | SelectorInput }
  | { expectUrlContains: string }
  | { expectVisible: SelectorInput }
  | { expectHidden: SelectorInput }
  | { expectAttribute: SelectorInput & { attribute?: string; value?: string } }
  | { expectValue: SelectorInput & { value?: string } }
  | { expectCount: SelectorInput & { count?: number } }
  | { uploadFile: SelectorInput & { path?: string } };

export interface ApiSpec {
  version: number;
  type: 'api';
  name: string;
  description?: string;
  baseUrl?: string;
  defaults?: {
    timeoutMs?: number;
    retries?: number;
  };
  variables?: Record<string, string | number | boolean>;
  beforeEach?: ApiRequestStep[];
  afterEach?: ApiRequestStep[];
  tests: ApiTest[];
}

export interface ApiTest {
  name: string;
  tags?: string[];
  skip?: boolean | string;
  only?: boolean;
  retries?: number;
  request: ApiRequestStep;
  expect?: {
    status?: number;
    maxMs?: number;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    bodyContains?: unknown;
    bodyPathExists?: string[];
    bodyPathMatches?: Record<string, string>;
    jsonSchema?: Record<string, unknown>;
  };
  extract?: Record<string, string>;
}

export type TestHubSpec = WebSpec | ApiSpec;

export interface ApiRequestStep {
  method: string;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  expect?: ApiTest['expect'];
  extract?: Record<string, string>;
}
