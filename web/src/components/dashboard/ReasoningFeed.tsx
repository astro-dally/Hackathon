import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReasoningLogItem } from '../../types/agent';
import { Repeat, Wrench, GitBranch, AlertTriangle, AlertCircle, CheckCircle, Info } from 'lucide-react';

export function ReasoningFeed({ logs }: { logs: ReasoningLogItem[] }) {
  const getIcon = (type: string) => {
    switch(type) {
      case 'decision': return <Repeat className="w-4 h-4 text-blue-400" />;
      case 'repair': return <Wrench className="w-4 h-4 text-indigo-400" />;
      case 'replan': return <GitBranch className="w-4 h-4 text-purple-400" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'confidence': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'status': return <Info className="w-4 h-4 text-gray-400" />;
      default: return <Info className="w-4 h-4 text-gray-400" />;
    }
  };

  const getColorClasses = (type: string) => {
    switch(type) {
      case 'decision': return 'border-blue-500/20 bg-blue-500/5';
      case 'repair': return 'border-indigo-500/20 bg-indigo-500/5';
      case 'replan': return 'border-purple-500/20 bg-purple-500/5';
      case 'error': return 'border-red-500/20 bg-red-500/5';
      case 'confidence': return 'border-yellow-500/20 bg-yellow-500/5';
      default: return 'border-white/5 bg-white/[0.02]';
    }
  };

  return (
    <div className="w-80 border-l border-white/10 bg-black/40 backdrop-blur-md flex flex-col h-full hidden md:flex">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300 uppercase flex items-center gap-2">
          <GitBranch className="w-4 h-4" /> Live Reasoning Feed
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`p-3 rounded-lg border backdrop-blur-md ${getColorClasses(log.type)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded bg-black/40 border border-white/5 shadow-inner">
                    {getIcon(log.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-500">{log.timestamp}</span>
                      {log.stepId && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono tracking-wider">
                          {log.stepId}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-200 font-medium leading-snug">
                      {log.message}
                    </p>
                    {log.details && (
                      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
