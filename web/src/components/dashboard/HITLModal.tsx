'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X, CheckCircle, XCircle, Plane, AlertCircle } from 'lucide-react';

interface HITLModalProps {
  stepId: string;
  question: string;
  data: { flights?: any[]; objective?: string } | null;
  runId: string;
  onResolved: (approved: boolean) => void;
}

export function HITLModal({ stepId, question, data, runId, onResolved }: HITLModalProps) {
  const [loading, setLoading] = React.useState<'approve' | 'reject' | null>(null);

  async function resolve(approved: boolean) {
    setLoading(approved ? 'approve' : 'reject');
    try {
      await fetch('/api/agent-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, stepId, approved }),
      });
    } catch { /* best-effort */ }
    onResolved(approved);
    setLoading(null);
  }

  const flights: any[] = data?.flights ?? [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 22, stiffness: 220 }}
          className="w-full max-w-lg bg-neutral-900 border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-900/20 overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-5 bg-gradient-to-r from-amber-950/60 to-neutral-900 border-b border-amber-500/20 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/30">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-100">Human Approval Required</h2>
              <p className="text-xs text-amber-400/70 mt-0.5">Step: {stepId}</p>
            </div>
          </div>

          {/* Question */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex gap-3 items-start p-4 rounded-xl bg-amber-950/20 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-100/90 leading-relaxed">{question}</p>
            </div>
          </div>

          {/* Flight candidates preview */}
          {flights.length > 0 && (
            <div className="px-6 pb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Flight Candidates</p>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {flights.map((f: any, i: number) => {
                  const currency = f.currency === 'INR' ? '₹' : '$';
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                      <Plane className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-200">{f.airline}</span>
                        <span className="text-xs text-gray-500 ml-2">{f.date} · {f.duration}</span>
                      </div>
                      <span className="text-sm font-bold text-green-400">{currency}{f.price?.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-5 border-t border-white/10 flex gap-3">
            <button
              onClick={() => resolve(true)}
              disabled={!!loading}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-60"
            >
              <CheckCircle className="w-4 h-4" />
              {loading === 'approve' ? 'Approving…' : 'Approve & Continue'}
            </button>
            <button
              onClick={() => resolve(false)}
              disabled={!!loading}
              className="flex-1 flex items-center justify-center gap-2 bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-500/30 text-sm font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-60"
            >
              <XCircle className="w-4 h-4" />
              {loading === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
