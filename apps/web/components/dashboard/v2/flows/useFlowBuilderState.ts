'use client';

import { useState } from 'react';
import type React from 'react';
import YAML from 'yaml';
import type { FlowDraft } from '../types';
import type { FlowStepTemplate } from './flowBuilderTypes';
import { cloneFlowStep, describeFlowStep, flowStepPreviewRows, parseFlowStepsYaml } from './flowBuilderUtils';

export function useFlowBuilderState(flowDraft: FlowDraft, onFlowDraftChange: (draft: FlowDraft) => void) {
  const [builderDialogOpen, setBuilderDialogOpen] = useState(false);
  const [builderSteps, setBuilderSteps] = useState<unknown[]>([]);
  const [selectedBuilderStepIndex, setSelectedBuilderStepIndex] = useState(0);
  const [builderApplied, setBuilderApplied] = useState(true);
  const [draggedBuilderStepIndex, setDraggedBuilderStepIndex] = useState<number | null>(null);
  const [dragOverBuilderStepIndex, setDragOverBuilderStepIndex] = useState<number | null>(null);
  const flowPreview = flowStepPreviewRows(flowDraft.steps);
  const builderPreview = builderSteps.map((step, index) => describeFlowStep(step, index + 1));
  const openBuilder = () => {
    const nextSteps = parseFlowStepsYaml(flowDraft.steps);
    setBuilderSteps(nextSteps);
    setSelectedBuilderStepIndex(Math.min(selectedBuilderStepIndex, Math.max(0, nextSteps.length - 1)));
    setBuilderApplied(true);
    setBuilderDialogOpen(true);
  };
  const appendBuilderStep = (template: FlowStepTemplate) => {
    setBuilderSteps((current) => {
      const next = [...current, cloneFlowStep(template.step)];
      setSelectedBuilderStepIndex(next.length - 1);
      return next;
    });
    setBuilderApplied(false);
  };
  const updateBuilderStep = (index: number, step: unknown) => {
    setBuilderSteps((current) => current.map((item, itemIndex) => itemIndex === index ? step : item));
    setBuilderApplied(false);
  };
  const removeBuilderStep = (index: number) => {
    setBuilderSteps((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      setSelectedBuilderStepIndex(Math.max(0, Math.min(index, next.length - 1)));
      return next;
    });
    setBuilderApplied(false);
  };
  const moveBuilderStep = (index: number, direction: -1 | 1) => {
    reorderBuilderStep(index, index + direction);
  };
  const reorderBuilderStep = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setBuilderSteps((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setSelectedBuilderStepIndex(toIndex);
      return next;
    });
    setBuilderApplied(false);
  };
  const startBuilderStepDrag = (event: React.DragEvent, index: number) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    setDraggedBuilderStepIndex(index);
    setDragOverBuilderStepIndex(index);
  };
  const overBuilderStepDrag = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverBuilderStepIndex(index);
  };
  const dropBuilderStep = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    const transferredIndex = Number(event.dataTransfer.getData('text/plain'));
    const fromIndex = draggedBuilderStepIndex ?? transferredIndex;
    if (Number.isInteger(fromIndex)) reorderBuilderStep(fromIndex, index);
    setDraggedBuilderStepIndex(null);
    setDragOverBuilderStepIndex(null);
  };
  const endBuilderStepDrag = () => {
    setDraggedBuilderStepIndex(null);
    setDragOverBuilderStepIndex(null);
  };
  const applyBuilderSteps = () => {
    onFlowDraftChange({ ...flowDraft, steps: YAML.stringify(builderSteps).trim() });
    setBuilderApplied(true);
  };

  return {
    builderDialogOpen,
    setBuilderDialogOpen,
    builderSteps,
    selectedBuilderStepIndex,
    setSelectedBuilderStepIndex,
    builderApplied,
    draggedBuilderStepIndex,
    dragOverBuilderStepIndex,
    builderPreview,
    flowPreview,
    openBuilder,
    appendBuilderStep,
    updateBuilderStep,
    removeBuilderStep,
    moveBuilderStep,
    startBuilderStepDrag,
    overBuilderStepDrag,
    dropBuilderStep,
    endBuilderStepDrag,
    applyBuilderSteps,
    setDragOverBuilderStepIndex,
  };
}
