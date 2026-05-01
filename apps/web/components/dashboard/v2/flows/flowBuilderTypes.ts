export type FlowPreviewRow = { index: number; title: string; detail: string };
export type FlowStepTemplate = { id: string; label: string; description: string; step: unknown };
export type FlowStepAction =
  | 'goto'
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'press'
  | 'waitFor'
  | 'expectText'
  | 'expectUrlContains'
  | 'expectVisible'
  | 'expectHidden'
  | 'expectAttribute'
  | 'expectValue'
  | 'expectCount'
  | 'uploadFile'
  | 'use'
  | 'extract';
export type FlowSelectorMode = 'label' | 'text' | 'role' | 'testId' | 'css' | 'placeholder' | 'selector' | 'textObject';
