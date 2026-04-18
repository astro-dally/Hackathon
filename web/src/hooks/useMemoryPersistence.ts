'use client';
import { useState, useEffect, useCallback } from 'react';
import { AgentRunState } from '../types/agent';

const STORAGE_KEY = 'agent_run_history';
const MAX_STORED_RUNS = 20;

export function useMemoryPersistence() {
  const [history, setHistory] = useState<AgentRunState[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AgentRunState[];
        setHistory(parsed);
      }
    } catch { /* ignore corrupted data */ }
    setLoaded(true);
  }, []);

  // Persist whenever history changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_STORED_RUNS)));
    } catch { /* storage full */ }
  }, [history, loaded]);

  const addRun = useCallback((run: AgentRunState) => {
    setHistory(prev => [run, ...prev.filter(r => r.runId !== run.runId)].slice(0, MAX_STORED_RUNS));
  }, []);

  const deleteRun = useCallback((id: string) => {
    setHistory(prev => prev.filter(r => r.runId !== id));
  }, []);

  return { history, addRun, deleteRun, setHistory };
}
