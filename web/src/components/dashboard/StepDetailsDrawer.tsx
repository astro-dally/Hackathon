import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StepExecution } from '../../types/agent';
import { X, Network, Brain, FileJson, CheckCircle, AlertTriangle, MessageSquare } from 'lucide-react';

function renderBotSummary(tool: string, result: any) {
  if (!result) return null;
  try {
    switch (tool) {
      case 'synthesizeFinalResponse':
        return result.finalAnswer || null;
      case 'parseIntent':
        if (result.entities) {
          const e = result.entities;
          const curr = result.context?.currency === 'INR' ? '₹ INR' : '$ USD';
          return `Parsed intent: ${result.intent} — ${e.origin} → ${e.destination}, preference: ${e.preference}, currency: ${curr}.`;
        }
        return null;
      case 'searchFlights':
        if (result.flights?.length) {
          const f = result.flights[0];
          const currency = f.currency === 'INR' ? '₹' : '$';
          return `Found ${result.flights.length} flights on ${result.date ?? 'this date'}. Cheapest: ${f.airline} at ${currency}${f.price?.toLocaleString()}.`;
        }
        return `No flights found matching the criteria.`;
      case 'aggregateFlights':
        if (result.flights?.length) {
          return `Aggregated ${result.flights.length} total flights across all search dates.`;
        }
        return null;
      case 'selectBestFlight':
        if (result.bestFlight) {
          const b = result.bestFlight;
          const currency = b.currency === 'INR' ? '₹' : '$';
          return `Selected best flight: ${b.airline} at ${currency}${b.price?.toLocaleString()} (${b.duration}). ${result.alternatives?.length ?? 0} alternatives considered.`;
        }
        return null;
      case 'searchHotels':
        if (result.hotels?.length) {
          return `Found ${result.hotels.length} hotels. ${result.hotels[0].name} costs $${result.hotels[0].price}/night.`;
        }
        return `No hotels were found for that query.`;
      case 'getWeather':
        if (result.current) {
          return `Weather in ${result.location}: ${result.current.temp}°F, ${result.current.condition}.`;
        }
        break;
      case 'searchWeb':
        if (result.results?.length) {
          return `Found ${result.totalResults} results. Top: "${result.results[0].title}".`;
        }
        break;
      case 'calculate':
        return `Calculation (${result.expression}) = ${result.result}.`;
      default:
        return null;
    }
  } catch (e) {
    return null;
  }
  return null;
}


export function StepDetailsDrawer({ 
  execution, 
  onClose 
}: { 
  execution: StepExecution | null, 
  onClose: () => void 
}) {
  return (
    <AnimatePresence>
      {execution && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 bottom-0 w-[500px] z-50 bg-neutral-900 border-l border-white/10 shadow-2xl overflow-y-auto flex flex-col"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-start bg-black/20">
              <div>
                <span className="text-xs font-mono text-indigo-400 mb-2 block">{execution.step.id}</span>
                <h2 className="text-lg font-bold text-gray-100 leading-tight pr-4">
                  {execution.step.objective}
                </h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-8 flex-1">
              
              {/* Telemetry / Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Status</span>
                  <span className="text-sm font-medium text-gray-200 capitalize">{execution.status}</span>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Duration</span>
                  <span className="text-sm font-mono text-gray-200">{execution.durationMs}ms</span>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Tool Used</span>
                  <span className="text-sm font-mono text-blue-300">{execution.step.tool}</span>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Attempts</span>
                  <span className="text-sm font-mono text-gray-200">{execution.attempts}</span>
                </div>
              </div>

              {/* Decision Section */}
              {execution.decisionTaken !== undefined && (
                <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <Brain className="w-16 h-16 text-indigo-400" />
                  </div>
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Engine Decision</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {execution.decisionTaken}
                    </span>
                  </div>
                  <p className="text-sm text-indigo-100/80 leading-relaxed font-medium">
                    {execution.decisionReason}
                  </p>
                </div>
              )}

              {/* Confidence Breakdown Section */}
              {execution.detailedConfidence !== undefined && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Network className="w-4 h-4" /> Confidence Breakdown
                  </h3>
                  <div className="flex flex-col gap-3">
                    {Object.entries(execution.detailedConfidence).map(([key, val]) => {
                      const numVal = val as number;
                      return (
                      <div key={key} className="flex items-center gap-4">
                        <span className="w-20 text-xs text-gray-500 uppercase font-mono">{key}</span>
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${key === 'combined' ? 'bg-indigo-500' : 'bg-gray-500'}`}
                            style={{ width: `${numVal * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-mono text-gray-300">{Math.round(numVal * 100)}%</span>
                      </div>
                    )})}
                  </div>
                </div>
              )}

              {/* Raw Input/Output */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <FileJson className="w-4 h-4" /> Input Payload
                </h3>
                <div className="bg-[#0D0D0D] border border-white/5 rounded-lg p-4 custom-scrollbar overflow-x-auto">
                  <pre className="text-xs text-green-400/80 font-mono">
                    {JSON.stringify(execution.step.inputs, null, 2)}
                  </pre>
                </div>
              </div>

              {execution.result !== undefined && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Tool Output
                  </h3>

                  {renderBotSummary(execution.step.tool, execution.result) && (
                    <div className="bg-indigo-900/30 border border-indigo-500/20 rounded-lg p-4 mb-4 flex gap-3 items-start relative overflow-hidden">
                      <div className="mt-0.5">
                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                      </div>
                      <p className="text-sm text-indigo-100/90 leading-relaxed">
                        {renderBotSummary(execution.step.tool, execution.result)}
                      </p>
                    </div>
                  )}

                  <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Raw JSON Payload</h4>
                  <div className="bg-[#0D0D0D] border border-white/5 rounded-lg p-4 custom-scrollbar overflow-x-auto">
                    <pre className="text-xs text-blue-400/80 font-mono">
                      {JSON.stringify(execution.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {execution.error !== undefined && (
                <div>
                  <h3 className="text-xs font-bold text-red-500/80 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Error Log
                  </h3>
                  <div className="bg-red-950/20 border border-red-500/20 rounded-lg p-4">
                    <p className="text-xs text-red-400/90 font-mono whitespace-pre-wrap">
                      {execution.error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
