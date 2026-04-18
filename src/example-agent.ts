import { ToolRegistry, DefaultTool, createAgentLoop } from './index.js';
import { z } from 'zod';

const searchParams = z.object({
  origin: z.string(),
  destination: z.string(),
  date: z.string(),
});

const bookParams = z.object({
  flightId: z.string(),
  passengerName: z.string().optional(),
});

const searchTool = new DefaultTool(
  'searchFlights',
  'Search for available flights between airports',
  searchParams,
  async (params) => {
    const p = params as { origin: string; destination: string; date: string };
    await new Promise(r => setTimeout(r, 500));
    
    if (Math.random() > 0.9) {
      return { success: false, error: 'Random API timeout' };
    }
    
    return {
      success: true,
      data: {
        flights: [
          { id: 'FL001', origin: p.origin, destination: p.destination, price: 299, airline: 'Delta' },
          { id: 'FL002', origin: p.origin, destination: p.destination, price: 349, airline: 'United' },
          { id: 'FL003', origin: p.origin, destination: p.destination, price: 199, airline: 'Southwest' },
        ],
      },
    };
  }
);

const bookTool = new DefaultTool(
  'bookFlight',
  'Book a flight by ID',
  bookParams,
  async (params) => {
    const p = params as { flightId: string; passengerName?: string };
    await new Promise(r => setTimeout(r, 300));
    
    return {
      success: true,
      data: {
        confirmationNumber: `BK-${p.flightId}-${Date.now().toString(36).toUpperCase()}`,
        status: 'confirmed',
        passengerName: p.passengerName || 'Passenger',
      },
    };
  }
);

const fallbackSearchTool = new DefaultTool(
  'searchFlightsFallback',
  'Fallback flight search (cached)',
  searchParams,
  async () => {
    return {
      success: true,
      data: {
        flights: [
          { id: 'CACHED001', origin: 'SFO', destination: 'LAX', price: 199, airline: 'Southwest' },
        ],
      },
    };
  }
);

async function main() {
  const registry = new ToolRegistry();
  registry.register(searchTool);
  registry.register(bookTool);
  registry.register(fallbackSearchTool);

  const goal = 'Search for flights from SFO to LAX on 2024-06-15, then book the cheapest one';

  console.log('═══════════════════════════════════════════════════════');
  console.log('  UNCERTAINTY-AWARE AGENT LOOP DEMO');
  console.log('═══════════════════════════════════════════════════════');
  console.log();
  console.log('Goal:', goal);
  console.log();
  console.log('Features being demonstrated:');
  console.log('  ✓ Agent Controller Loop (think → plan → act → verify → reflect → adapt)');
  console.log('  ✓ Partial Replan (only fix failed steps, preserve successful)');
  console.log('  ✓ Repair Engine (regenerate inputs, switch tools)');
  console.log('  ✓ Pre-execution Guard (validate before executing)');
  console.log('  ✓ Memory Layer (track tool performance)');
  console.log('  ✓ Reflection (analyze failures, detect patterns)');
  console.log('  ✓ Confidence modeling');
  console.log();
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  try {
    const agent = createAgentLoop(goal, registry, {
      maxIterations: 5,
      confidenceThreshold: 0.7,
      enablePartialRefinement: true,
      enableRepair: true,
      enableReflection: true,
      maxRepairsPerStep: 2,
    });

    const result = await agent.run();

    console.log('═══════════════════════════════════════════════════════');
    console.log('  RESULT');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Success:', result.success ? '✓ YES' : '✗ NO');
    console.log('Total Iterations:', result.iterations);
    console.log('Total Steps Executed:', result.steps.length);
    console.log();
    
    console.log('Step Details:');
    for (const step of result.steps) {
      const statusIcon = step.status === 'completed' ? '✓' : 
                        step.status === 'repaired' ? '↻' : '✗';
      const statusColor = step.status === 'completed' ? '\x1b[32m' : 
                         step.status === 'repaired' ? '\x1b[33m' : '\x1b[31m';
      console.log(`  ${statusColor}${statusIcon}\x1b[0m ${step.step.id}: ${step.step.tool}`);
      console.log(`      Objective: ${step.step.objective}`);
      if (step.result) {
        console.log(`      Result: ${JSON.stringify(step.result).slice(0, 80)}...`);
      }
      if (step.error) {
        console.log(`      Error: ${step.error}`);
      }
      console.log(`      Attempts: ${step.attempts}, Duration: ${step.durationMs}ms`);
    }

    if (result.errors.length > 0) {
      console.log();
      console.log('Errors encountered:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error('Agent failed:', error);
  }
}

main();