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
  ShieldCheck
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
      case 'synthesizeFinalResponse': return <MessageSquare className="w-4 h-4 text-green-400" />;
      case 'searchWeb': return <Search className="w-4 h-4 text-cyan-400" />;
      case 'calculate': return <Calculator className="w-4 h-4 text-pink-400" />;
      default: return <Database className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusVisuals = () => {
    switch(status) {
      case 'completed': return { border: 'border-green-500/30', bg: 'bg-green-500/5', color: 'green', icon: <CheckCircle2 className="w-4 h-4 text-green-400" /> };
      case 'failed': return { border: 'border-red-500/30', bg: 'bg-red-500/5', color: 'red', icon: <XCircle className="w-4 h-4 text-red-500" /> };
      case 'repaired': return { border: 'border-blue-400/40', bg: 'bg-blue-400/10', color: 'blue', icon: <Wrench className="w-4 h-4 text-blue-400" /> };
      case 'running': return { border: 'border-indigo-400/40 shadow-[0_0_15px_rgba(129,140,248,0.3)]', bg: 'bg-indigo-400/5', color: 'indigo', icon: <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /> };
      default: return { border: 'border-white/10', bg: 'bg-white/5', color: 'gray', icon: <div className="w-2 h-2 rounded-full bg-gray-600" /> };
    }
  };

  const getDecisionBadge = (decision?: DecisionAction) => {
    if (!decision || decision === 'CONTINUE') return null;
    let label = decision;
    let icon = <AlertTriangle className="w-3 h-3" />;
    let color = 'text-gray-300 bg-gray-800/80 border-gray-600';

    if (decision === 'RETRY') {
      icon = <RotateCw className="w-3 h-3" />;
      color = 'text-yellow-300 bg-yellow-900/60 border-yellow-700/50';
    } else if (decision === 'REPAIR') {
      icon = <Wrench className="w-3 h-3" />;
      color = 'text-blue-300 bg-blue-900/60 border-blue-700/50';
    } else if (decision === 'REPLAN_PARTIAL' || decision === 'REPLAN_FULL') {
      icon = <GitBranch className="w-3 h-3" />;
      color = 'text-purple-300 bg-purple-900/60 border-purple-700/50';
    } else if (decision === 'SWITCH_TOOL') {
      icon = <ArrowRightLeft className="w-3 h-3" />;
      color = 'text-orange-300 bg-orange-900/60 border-orange-700/50';
    }

    return (
      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide absolute -top-3 right-4 backdrop-blur-md z-10 ${color}`}>
        {icon}
        {label}
      </div>
    );
  };

  const visuals = getStatusVisuals();
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((confidence || 0.6) * circumference);

  return (
    <motion.div 
      layout
      whileHover={{ scale: 1.02, y: -2 }}
      onClick={() => onClick(execution)}
      className={`relative cursor-pointer w-[340px] rounded-xl border backdrop-blur-xl ${visuals.border} ${visuals.bg} ${isSelected ? 'ring-2 ring-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'shadow-lg hover:shadow-xl'} transition-all duration-300 group overflow-hidden`}
    >
      {/* Running pulse overlay */}
      {status === 'running' && (
        <motion.div 
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 bg-indigo-500/10 pointer-events-none"
        />
      )}

      {getDecisionBadge(decisionTaken)}
      
      <div className="p-4 relative z-10">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${status === 'running' ? 'bg-indigo-500/20' : 'bg-white/5'} border border-white/5`}>
              {status === 'pending' ? getToolIcon(step.tool) : visuals.icon}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-tight">{step.id}</span>
              <span className="text-[10px] font-mono text-indigo-400 group-hover:text-indigo-300 transition-colors uppercase font-bold">{step.tool}</span>
            </div>
          </div>
          
          <div className="relative flex items-center justify-center pointer-events-none">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle cx="20" cy="20" r={radius} className="stroke-white/5" strokeWidth="3" fill="none" />
              <motion.circle 
                cx="20" cy="20" r={radius} 
                className={`${(confidence || 0) > 0.8 ? 'stroke-green-400' : (confidence || 0) > 0.5 ? 'stroke-amber-400' : 'stroke-red-400'}`} 
                strokeWidth="3" fill="none" 
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </svg>
            <span className="absolute text-[9px] font-black text-gray-100 font-mono">
              {Math.round((confidence || 0) * 100)}%
            </span>
          </div>
        </div>

        <h3 className="text-sm font-bold text-gray-100 line-clamp-2 leading-snug mb-2 group-hover:text-white transition-colors">
          {step.objective}
        </h3>
        
        <div className="flex items-center justify-between mt-4 border-t border-white/5 pt-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-white/5">
              {getToolIcon(step.tool)}
            </div>
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
              {status === 'running' ? 'Executing...' : status}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-gray-500 uppercase font-mono mb-1">Duration</span>
            <span className="text-xs text-gray-400 font-mono">
              {status === 'pending' ? '--' : `${execution.durationMs}ms`}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
