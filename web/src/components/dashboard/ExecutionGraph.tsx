import React from 'react';
import { StepNode } from './StepNode';
import { StepExecution } from '../../types/agent';
import { motion } from 'framer-motion';

export function ExecutionGraph({ 
  steps, 
  onSelectStep, 
  selectedStepId 
}: { 
  steps: StepExecution[], 
  onSelectStep: (exec: StepExecution) => void,
  selectedStepId?: string
}) {
  const layers: StepExecution[][] = [];
  const processed = new Set<string>();

  let remaining = [...steps];
  while (remaining.length > 0) {
    const layer = remaining.filter(exec => 
      !exec.step.dependsOn || exec.step.dependsOn.length === 0 || 
      exec.step.dependsOn.every(dep => processed.has(dep))
    );

    if (layer.length === 0) {
      layers.push(remaining);
      break;
    }

    layers.push(layer);
    layer.forEach(l => processed.add(l.step.id));
    remaining = remaining.filter(exec => !layer.includes(exec));
  }

  return (
    <div className="h-full w-full overflow-auto relative custom-scrollbar bg-slate-950/20">
      {/* Background Matrix Grid */}
      <div className="absolute inset-0 z-0 opacity-[0.05] pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }} />
      
      <div className="absolute inset-0 z-0 opacity-[0.02] pointer-events-none" 
           style={{ 
             backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', 
             backgroundSize: '160px 160px' 
           }} />

      <div className="relative z-10 flex flex-col gap-24 w-max min-w-full mx-auto px-20 pt-20 pb-40">
        {layers.map((layer, layerIdx) => (
          <div key={layerIdx} className="flex relative items-start justify-center gap-16">
            {/* SVG Connection Lines */}
            {layerIdx > 0 && (
              <svg className="absolute -top-24 left-0 w-full h-24 overflow-visible pointer-events-none">
                <defs>
                  <linearGradient id={`grad-${layerIdx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.5" />
                  </linearGradient>
                </defs>
                <motion.line 
                  x1="50%" y1="0" x2="50%" y2="100%" 
                  stroke={`url(#grad-${layerIdx})`}
                  strokeWidth="2"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1, delay: layerIdx * 0.2 }}
                />
                {/* Data Flow Pulse */}
                <motion.circle 
                  r="3" fill="#818cf8"
                  animate={{ 
                    cy: [0, 96],
                    opacity: [0, 1, 0]
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  style={{ cx: '50%' }}
                />
              </svg>
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
        
        {/* Empty state padding */}
        {layers.length === 0 && (
          <div className="flex flex-col items-center justify-center opacity-20 py-40">
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 animate-spin-slow mb-6" />
            <p className="text-sm font-mono uppercase tracking-widest text-white">System Idle</p>
          </div>
        )}
      </div>
    </div>
  );
}
