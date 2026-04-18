import { ToolRegistry, DefaultTool, runAgent } from './index.js';
import { z } from 'zod';

const searchFlightsParams = z.object({
  origin: z.string().describe('Origin airport code'),
  destination: z.string().describe('Destination airport code'),
  date: z.string().describe('Departure date'),
});

const bookFlightParams = z.object({
  flightId: z.string(),
});

const searchFlightsTool = new DefaultTool(
  'searchFlights',
  'Search for available flights',
  searchFlightsParams,
  async (params) => {
    const p = params as { origin: string; destination: string; date: string };
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      success: true,
      data: [
        { id: 'FL001', origin: p.origin, destination: p.destination, price: 299 },
        { id: 'FL002', origin: p.origin, destination: p.destination, price: 449 },
      ],
    };
  }
);

const bookFlightTool = new DefaultTool(
  'bookFlight',
  'Book a flight',
  bookFlightParams,
  async (params) => {
    const p = params as { flightId: string };
    await new Promise(resolve => setTimeout(resolve, 300));
    return {
      success: true,
      data: { confirmationNumber: `BK-${p.flightId}`, status: 'confirmed' },
    };
  }
);

const fallbackSearchTool = new DefaultTool(
  'searchFlightsFallback',
  'Fallback flight search (cached)',
  searchFlightsParams,
  async () => {
    return {
      success: true,
      data: [{ id: 'CACHED001', origin: 'SFO', destination: 'LAX', price: 199 }],
    };
  }
);

async function main() {
  const registry = new ToolRegistry();
  registry.register(searchFlightsTool);
  registry.register(bookFlightTool);
  registry.register(fallbackSearchTool);

  const goal = 'Search for flights from SFO to LAX on 2024-06-15, then book the cheapest one';

  console.log('=== Starting Agent ===');
  console.log('Goal:', goal);
  console.log('---');

  try {
    const result = await runAgent(goal, { registry });

    console.log('---');
    console.log('=== Result ===');
    console.log('Success:', result.success);
    console.log('Run ID:', result.runId);
    console.log('Steps executed:', result.steps?.length ?? 0);
    console.log('Duration:', result.durationMs, 'ms');

    if (result.errors.length > 0) {
      console.log('Errors:', result.errors);
    }

    if (result.steps) {
      for (const step of result.steps) {
        console.log(`  Step ${step.stepId}:`, step.success ? 'OK' : `FAILED - ${step.error}`);
      }
    }
  } catch (error) {
    console.error('Agent failed:', error);
  }
}

main();