import { AgentRunState, StepExecution, ReasoningLogItem } from '../types/agent';

const steps: StepExecution[] = [
  {
    step: {
      id: 'step-1',
      objective: 'Extract raw weather data for region',
      tool: 'fetchAPI',
      inputs: { endpoint: '/weather/sf' },
    },
    status: 'completed',
    attempts: 1,
    durationMs: 450,
    confidence: 0.95,
    decisionTaken: 'CONTINUE',
    decisionReason: 'Step completed and verified',
    detailedConfidence: { llm: 0.9, tool: 0.95, input: 1.0, historical: 0.95, combined: 0.95 },
    verification: { verified: true, confidence: 0.95 },
    result: { temp: 68, condition: 'Sunny' }
  },
  {
    step: {
      id: 'step-2',
      objective: 'Format raw weather data into readable summary',
      tool: 'formatText',
      inputs: { data: '{ temp: 68, condition: "Sunny" }' },
      dependsOn: ['step-1']
    },
    status: 'repaired',
    attempts: 2,
    durationMs: 1200,
    confidence: 0.82,
    repairedFrom: 'step-2',
    decisionTaken: 'REPAIR',
    decisionReason: 'Output validation failed, attempting repair',
    detailedConfidence: { llm: 0.8, tool: 0.9, input: 0.6, historical: 0.85, combined: 0.82 },
    verification: { verified: false, errors: ['Schema mismatch: missing "summary" key'], confidence: 0.4 },
    result: { summary: 'It is currently 68 degrees and sunny.' },
    error: 'Schema mismatch: missing "summary" key in first attempt'
  },
  {
    step: {
      id: 'step-3',
      objective: 'Fetch hotel availability in parallel',
      tool: 'searchHotels',
      inputs: { location: 'SF', dates: 'next_weekend' },
      dependsOn: []
    },
    status: 'completed',
    attempts: 2,
    durationMs: 3100,
    confidence: 0.78,
    decisionTaken: 'RETRY',
    decisionReason: 'Transient error detected, retrying with backoff',
    detailedConfidence: { llm: 0.85, tool: 0.7, input: 0.9, historical: 0.8, combined: 0.78 },
    verification: { verified: true, confidence: 0.8 },
    result: { hotels: ['Hotel A', 'Hotel B'] },
    error: 'Network timeout (503) on attempt 1'
  },
  {
    step: {
      id: 'step-4',
      objective: 'Draft travel itinerary',
      tool: 'generateItinerary',
      inputs: { weather: 'step-2.result', hotels: 'step-3.result' },
      dependsOn: ['step-2', 'step-3']
    },
    status: 'failed',
    attempts: 3,
    durationMs: 5000,
    confidence: 0.35,
    decisionTaken: 'REPLAN_PARTIAL',
    decisionReason: 'Frequent recent failures for this tool, escalating quickly',
    detailedConfidence: { llm: 0.6, tool: 0.2, input: 0.8, historical: 0.3, combined: 0.35 },
    verification: { verified: false, errors: ['Generation timeout, tool unresponsive'], confidence: 0.1 },
    error: 'repeated generation failure'
  },
  {
    step: {
      id: 'step-5',
      objective: 'Draft travel itinerary (Alternative approach)',
      tool: 'basicTextMerge',
      inputs: { context: 'merge step-2 and step-3' },
      dependsOn: ['step-4']
    },
    status: 'running',
    attempts: 1,
    durationMs: 800,
    confidence: 0.85,
    detailedConfidence: { llm: 0.9, tool: 0.9, input: 0.8, historical: 0.9, combined: 0.85 }
  }
];

const logs: ReasoningLogItem[] = [
  { id: 'l1', timestamp: '10:00:01.200', type: 'status', message: 'Agent started run', details: 'Goal: Create SF weekend itinerary' },
  { id: 'l2', timestamp: '10:00:01.650', type: 'decision', stepId: 'step-1', message: 'Step 1 completed reliably', details: 'Combined confidence 0.95' },
  { id: 'l3', timestamp: '10:00:02.000', type: 'error', stepId: 'step-2', message: 'Output schema invalid for text formatting', details: 'Missing expected "summary" key' },
  { id: 'l4', timestamp: '10:00:02.050', type: 'repair', stepId: 'step-2', message: 'Repair initiated dynamically', details: 'Repair engine adjusting prompt for schema enforcement' },
  { id: 'l5', timestamp: '10:00:02.850', type: 'confidence', stepId: 'step-2', message: 'Confidence improved sequentially from 0.40 → 0.82', details: 'Repair succeeded' },
  { id: 'l6', timestamp: '10:00:03.100', type: 'error', stepId: 'step-3', message: 'Transient connection error (503)' },
  { id: 'l7', timestamp: '10:00:03.110', type: 'decision', stepId: 'step-3', message: 'Decision: RETRY', details: 'Retrying with backoff up to 2 times' },
  { id: 'l8', timestamp: '10:00:08.500', type: 'error', stepId: 'step-4', message: 'Tool generateItinerary failed 3 times in a row' },
  { id: 'l9', timestamp: '10:00:08.550', type: 'replan', stepId: 'step-4', message: 'Escalating: Partial Replan triggered', details: 'Decision reason: Frequent recent failures for this tool' },
  { id: 'l10', timestamp: '10:00:09.000', type: 'status', message: 'Agent recovering and continuing execution' }
];

export const mockRunState: AgentRunState = {
  runId: 'run-alpha-99x',
  goal: 'Create an optimal weekend travel itinerary for SF',
  status: 'Recovering',
  iteration: 2,
  maxIterations: 10,
  globalConfidence: 0.76,
  startTime: Date.now() - 9500,
  steps,
  logs
};
