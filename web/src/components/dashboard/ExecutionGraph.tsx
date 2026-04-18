import React from 'react';
import { StepNode } from './StepNode';
import { StepExecution } from '../../types/agent';

export function ExecutionGraph({ 
  steps, 
  onSelectStep, 
  selectedStepId 
}: { 
  steps: StepExecution[], 
  onSelectStep: (exec: StepExecution) => void,
  selectedStepId?: string
}) {
  // Simple layout logic: group by layers using dependsOn.
  // We assume purely linear / simple DAG mock for this UI.
  const layers: StepExecution[][] = [];
  const processed = new Set<string>();

  let remaining = [...steps];
  while (remaining.length > 0) {
    const layer = remaining.filter(exec => 
      !exec.step.dependsOn || exec.step.dependsOn.length === 0 || 
      exec.step.dependsOn.every(dep => processed.has(dep))
    );

    if (layer.length === 0) {
      // Fallback to prevent infinite loops if circular dependencies exist
      layers.push(remaining);
      break;
    }

    layers.push(layer);
    layer.forEach(l => processed.add(l.step.id));
    remaining = remaining.filter(exec => !layer.includes(exec));
  }

  return (
    <div className="flex-1 overflow-auto relative h-full custom-scrollbar">
      {/* Background Grid Pattern */}
      <div className="absolute min-w-full min-h-full z-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="relative z-10 flex flex-col gap-16 w-max min-w-full mx-auto p-12">
        {layers.map((layer, layerIdx) => (
          <div key={layerIdx} className="flex relative items-start justify-center gap-12">
            {/* Draw theoretical connecting lines between items across rows */}
            {layerIdx > 0 && (
              <div className="absolute -top-12 left-1/2 w-0.5 h-12 bg-gradient-to-b from-indigo-500/0 via-indigo-500/20 to-indigo-500/40" />
            )}

            {layer.map((exec, idx) => (
              <StepNode 
                key={`${exec.step.id}-${exec.attempts || 0}-${layerIdx}-${idx}`}
                execution={exec} 
                isSelected={selectedStepId === exec.step.id}
                onClick={onSelectStep} 
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
