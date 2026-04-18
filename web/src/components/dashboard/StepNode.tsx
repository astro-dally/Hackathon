import React from 'react';
import { motion } from 'framer-motion';
import { StepExecution, DecisionAction } from '../../types/agent';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RotateCw, 
  Wrench, 
  GitBranch,
  ArrowRightLeft,
  Loader2,
  Plane,
  Brain,
  Database,
  Layout,
  MessageSquare,
  Search,
  Calculator,
  ShieldCheck,
  Activity
} from 'lucide-react';

interface StepNodeProps {
  execution: StepExecution;
  onClick: (exec: StepExecution) => void;
  isSelected?: boolean;
}

export function StepNode({ execution, onClick, isSelected }: StepNodeProps) {
  const { step, status, confidence, decisionTaken } = execution;

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'parseIntent': return <Brain className="w-4 h-4 text-purple-400" />;
      case 'searchFlights': return <Plane className="w-4 h-4 text-blue-400" />;
      case 'aggregateFlights': return <Database className="w-4 h-4 text-indigo-400" />;
      case 'selectBestFlight': return <Layout className="w-4 h-4 text-amber-400" />;
      case 'synthesizeFinalResponse': return <MessageSquare className="w-4 h-4 text-emerald-400" />;
      case 'searchWeb': return <Search className="w-4 h-4 text-cyan-400" />;
      case 'calculate': return <Calculator className="w-4 h-4 text-rose-400" />;
      default: return <Cpu className="w-4 h-4 text-slate-400" />;
    }
  };

  const Cpu = ({ className }: { className?: string }) => <Database className={className} />;

  const getStatusVisuals = () => {
    switch(status) {
      case 'completed': return { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', color: 'emerald', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> };
      case 'failed': return { border: 'border-rose-500/30', bg: 'bg-rose-500/5', color: 'rose', icon: <XCircle className="w-4 h-4 text-rose-500" /> };
      case 'repaired': return { border: 'border-blue-400/40', bg: 'bg-blue-400/10', color: 'blue', icon: <Wrench className="w-4 h-4 text-blue-400" /> };
      case 'running': return { border: 'border-indigo-400/40 shadow-[0_0_20px_rgba(99,102,241,0.2)]', bg: 'bg-indigo-400/10', color: 'indigo', icon: <Activity className="w-4 h-4 text-indigo-400 animate-pulse" /> };
      default: return { border: 'border-white/5', bg: 'bg-white/[0.02]', color: 'slate', icon: <div className="w-1.5 h-1.5 rounded-full bg-slate-600" /> };
    }
  };

  const getDecisionBadge = (decision?: DecisionAction) => {
    if (!decision || decision === 'CONTINUE') return null;
    let label = decision;
    let icon = <AlertTriangle className="w-3 h-3" />;
    let color = 'text-slate-300 bg-slate-800/80 border-slate-600 shadow-lg';

    if (decision === 'RETRY') {
      icon = <RotateCw className="w-3 h-3" />;
      color = 'text-amber-300 bg-amber-900/60 border-amber-700/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
    } else if (decision === 'REPAIR') {
      icon = <Wrench className="w-3 h-3" />;
      color = 'text-blue-300 bg-blue-900/60 border-blue-700/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]';
    } else if (decision === 'REPLAN_PARTIAL' || decision === 'REPLAN_FULL') {
      icon = <GitBranch className="w-3 h-3" />;
      color = 'text-purple-300 bg-purple-900/60 border-purple-700/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]';
    } else if (decision === 'SWITCH_TOOL') {
      icon = <ArrowRightLeft className="w-3 h-3" />;
      color = 'text-orange-300 bg-orange-900/60 border-orange-700/50 shadow-[0_0_10px_rgba(249,115,22,0.2)]';
    }

    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-black border uppercase tracking-widest absolute -top-3 right-6 backdrop-blur-xl z-20 ${color}`}>
        {icon}
        {label}
      </div>
    );
  };

  const visuals = getStatusVisuals();
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const confidenceValue = confidence || 0.6;
  const strokeDashoffset = circumference - (confidenceValue * circumference);

  return (
    <motion.div 
      layout
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={() => onClick(execution)}
      className={`relative cursor-pointer w-[360px] rounded-2xl border backdrop-blur-2xl ${visuals.border} ${visuals.bg} ${isSelected ? 'ring-2 ring-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.25)] bg-indigo-500/[0.08]' : 'shadow-2xl hover:bg-white/[0.04]'} transition-all duration-500 group overflow-hidden`}
    >
      {/* Shine Effect */}
      <div className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg] animate-shine" />
      </div>

      {/* Running pulse overlay */}
      {status === 'running' && (
        <motion.div 
          animate={{ opacity: [0.05, 0.15, 0.05] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 bg-indigo-500/20 pointer-events-none"
        />
      )}

      {getDecisionBadge(decisionTaken)}
      
      <div className="p-5 relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border transition-all duration-500 ${status === 'running' ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-white/5 border-white/10 group-hover:border-white/20'}`}>
              {status === 'pending' ? getToolIcon(step.tool) : visuals.icon}
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{step.id}</span>
              <span className="text-[10px] font-black text-indigo-400 group-hover:text-indigo-300 transition-colors uppercase tracking-widest">{step.tool}</span>
            </div>
          </div>
          
          {/* Confidence Indicator */}
          <div className="relative flex items-center justify-center pointer-events-none group/confidence">
            <div className="absolute inset-0 rounded-full bg-indigo-500/5 blur-sm scale-150 opacity-0 group-hover/confidence:opacity-100 transition-opacity" />
            <svg className="w-11 h-11 transform -rotate-90">
              <circle cx="22" cy="22" r={radius} className="stroke-white/5" strokeWidth="2.5" fill="none" />
              <motion.circle 
                cx="22" cy="22" r={radius} 
                className={`${confidenceValue > 0.8 ? 'stroke-emerald-400' : confidenceValue > 0.5 ? 'stroke-amber-400' : 'stroke-rose-400'}`} 
                strokeWidth="2.5" 
                fill="none" 
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </svg>
            <span className="absolute text-[10px] font-black text-slate-100 font-mono tracking-tighter">
              {Math.round(confidenceValue * 100)}<span className="text-[8px] text-slate-500">%</span>
            </span>
          </div>
        </div>

        <h3 className="text-[15px] font-bold text-slate-100 line-clamp-2 leading-tight mb-4 min-h-[40px] group-hover:text-white transition-colors tracking-tight">
          {step.objective}
        </h3>
        
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
            <div className="opacity-70 transform scale-90">
              {getToolIcon(step.tool)}
            </div>
            <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest transition-colors group-hover:text-slate-300">
              {status === 'running' ? 'Executing' : status}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-0.5">Execution</span>
            <span className="text-xs text-slate-300 font-mono font-bold tabular-nums">
              {status === 'pending' ? '--' : `${execution.durationMs}ms`}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
