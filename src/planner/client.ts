import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

export const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export interface PlanStep {
  id: string;
  objective: string;
  tool: string;
  inputs: Record<string, unknown>;
  dependsOn: string[];
}

export const planSchema = z.object({
  goal: z.string().describe('The overall goal to accomplish'),
  steps: z.array(
    z.object({
      id: z.string().describe('Unique step identifier'),
      objective: z.string().describe('What this step accomplishes'),
      tool: z.string().nullable().transform(v => v || "").describe('Tool name to execute for this step'),
      inputs: z.record(z.unknown()).nullable().transform(v => v || {}).describe('Input parameters for this step'),
      dependsOn: z.array(z.string()).nullish().transform(v => v || []).describe('IDs of steps this depends on'),
    })
  ).describe('Ordered list of steps to achieve the goal'),
});

export type PlanOutputData = z.infer<typeof planSchema>;

export async function generatePlan(
  goal: string,
  availableTools: string,
  model: string = 'gemini-2.5-flash'
): Promise<PlanOutputData> {
  const goalLower = goal.toLowerCase().trim();
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'sup', 'yo'];
  if (greetings.includes(goalLower)) {
    return {
      goal,
      steps: [{
        id: 'step_1',
        objective: 'Greet the user',
        tool: 'synthesizeFinalResponse',
        inputs: {
          goal,
          bestResult: { message: "Hello! I am your AI Mission Control. I can help you find and book flights (optimized for India), check weather, or search the web. How can I assist you today?" },
          alternatives: [],
          confidence: 1.0
        },
        dependsOn: [],
      }],
    };
  }

  const useMock = process.env.USE_MOCK === 'true';
  
  if (useMock) {
    return generateMockPlan(goal, availableTools);
  }

  try {
    return await generateLLMPlan(goal, availableTools, model);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Always log the real error so developers can see what went wrong
    console.error('[Planner] LLM call failed:', msg);

    const isRateLimit = /quota|rate.?limit|429|resource.?exhausted|too.?many/i.test(msg);
    const isAuthError = /api.?key|invalid.?key|authenticate|403|401/i.test(msg);
    const isNetworkError = /network|econnrefused|fetch.?failed|timeout/i.test(msg);

    if (isRateLimit || isAuthError || isNetworkError) {
      // Extract retry-after delay from the error if present
      const retryMatch = msg.match(/retry.{0,10}(\d+)s/i);
      const retryDelay = retryMatch ? parseInt(retryMatch[1]) * 1000 : 0;
      if (retryDelay > 0 && retryDelay < 60000) {
        console.warn(`[Planner] Rate limited, waiting ${retryDelay / 1000}s before falling back to mock...`);
        await new Promise(r => setTimeout(r, retryDelay));
      }
      console.warn('[Planner] LLM unavailable, falling back to mock planner');
      return generateMockPlan(goal, availableTools);
    }

    // For planning/schema errors, rethrow so the user sees the real problem
    throw error;
  }
}

function generateMockPlan(goal: string, availableTools: string): PlanOutputData {
  const goalLower = goal.toLowerCase();

  // ── Flight optimization pipeline ───────────────────────────────────────────
  if (goalLower.includes('flight') || goalLower.includes('fly') ||
      goalLower.includes('delhi') || goalLower.includes('mumbai') ||
      goalLower.includes('book') || goalLower.includes('airport')) {

    // Detect route
    const isDomesticIndia = goalLower.includes('delhi') || goalLower.includes('mumbai') ||
      goalLower.includes('bangalore') || goalLower.includes('chennai');

    const origin = isDomesticIndia ? 'DEL' :
      (goalLower.includes('sfo') ? 'SFO' : 'DEL');
    const destination = isDomesticIndia ? 'BOM' :
      (goalLower.includes('lax') ? 'LAX' : 'BOM');

    // Expand "next week" into 3 concrete dates
    const today = new Date();
    const dates = [1, 3, 5].map(offset => {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      return d.toISOString().split('T')[0];
    });

    const searchSteps: PlanStep[] = dates.map((date, i) => ({
      id: `step_${i + 2}`,
      objective: `Search flights from ${origin} to ${destination} on ${date}`,
      tool: 'searchFlights',
      inputs: { origin, destination, date },
      dependsOn: ['step_1'],
    }));

    const searchIds = searchSteps.map(s => s.id);
    const aggId = `step_${searchSteps.length + 2}`;
    const selId = `step_${searchSteps.length + 3}`;
    const synId = `step_${searchSteps.length + 4}`;

    const steps: PlanStep[] = [
      {
        id: 'step_1',
        objective: 'Parse and structure the user query into intent and entities',
        tool: 'parseIntent',
        inputs: { query: goal },
        dependsOn: [],
      },
      ...searchSteps,
      {
        id: aggId,
        objective: 'Aggregate all flight results from each date into a single list',
        tool: 'aggregateFlights',
        inputs: { flightSets: searchIds.map(id => `$${id}.result`) },
        dependsOn: searchIds,
      },
      {
        id: selId,
        objective: 'Compare all flights and select the best option based on price',
        tool: 'selectBestFlight',
        inputs: {
          flights: `$${aggId}.result.flights`,
          objective: 'cheapest',
        },
        dependsOn: [aggId],
      },
      {
        id: synId,
        objective: 'Generate a human-readable, region-aware final answer for the user',
        tool: 'synthesizeFinalResponse',
        inputs: {
          goal,
          bestResult: `$${selId}.result.bestFlight`,
          alternatives: `$${selId}.result.alternatives`,
          confidence: `$${selId}.result.confidence`,
        },
        dependsOn: [selId],
      },
    ];

    if (goalLower.includes('book')) {
      steps.splice(steps.length - 1, 0, {
        id: `step_book`,
        objective: 'Book the selected cheapest flight',
        tool: 'bookFlight',
        inputs: { flightId: `$${selId}.result.bestFlight.id` },
        dependsOn: [selId],
      });
    }

    return { goal, steps };
  }

  // ── Small Talk / Greetings ────────────────────────────────────────────────
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'sup', 'yo'];
  if (greetings.includes(goalLower.trim())) {
    return {
      goal,
      steps: [{
        id: 'step_1',
        objective: 'Acknowledge the user greeting',
        tool: 'synthesizeFinalResponse',
        inputs: {
          goal,
          bestResult: { message: "Hello! I am your AI Mission Control. I can help you find and book flights (specifically optimized for India), check weather, or search the web. How can I assist you today?" },
          alternatives: [],
          confidence: 1.0
        },
        dependsOn: [],
      }],
    };
  }

  // ── Generic web search ─────────────────────────────────────────────────────
  if (goalLower.includes('search') || goalLower.includes('find') || goalLower.includes('look')) {
    return {
      goal,
      steps: [{
        id: 'step_1',
        objective: 'Search the web for relevant information',
        tool: 'searchWeb',
        inputs: { query: goal },
        dependsOn: [],
      }],
    };
  }

  // ── Weather ────────────────────────────────────────────────────────────────
  if (goalLower.includes('weather')) {
    return {
      goal,
      steps: [{
        id: 'step_1',
        objective: 'Get weather forecast',
        tool: 'getWeather',
        inputs: { location: 'Delhi', days: 5 },
        dependsOn: [],
      }],
    };
  }

  // ── Fallback single step ───────────────────────────────────────────────────
  return {
    goal,
    steps: [{
      id: 'step_1',
      objective: 'Process the request',
      tool: 'searchWeb',
      inputs: { query: goal },
      dependsOn: [],
    }],
  };
}

async function generateLLMPlan(
  goal: string,
  availableTools: string,
  model: string
): Promise<PlanOutputData> {
  const toolList = availableTools.split('\n').map(t => t.trim()).filter(Boolean);
  
  const toolExamples = toolList.map(t => {
    if (t.includes('searchFlights')) {
      return '- searchFlights inputs: { "origin": "SFO", "destination": "LAX", "date": "2024-06-15" }';
    }
    if (t.includes('bookFlight')) {
      return '- bookFlight inputs: { "flightId": "FL001" }';
    }
    return t;
  }).join('\n');

  const systemPrompt = `You are the central reasoning engine for a multi-step AI agent.

Your job is to:
1. Understand the user query deeply
2. Convert it into structured intent
3. Generate a correct multi-step execution plan
4. Ensure all tool calls are valid and complete
5. Produce a final human-readable answer

---

# STEP 1: PARSE USER INTENT (MANDATORY FIRST STEP)
Include 'parseIntent' as the FIRST step. Inputs: { "query": "<full user query>" }
Extract: intent, origin IATA code, destination IATA code, date range, preference (cheapest/fastest/best), region, currency.

---

# STEP 2: REGION-AWARE RULES (MANDATORY)
Based on detected region:
- India (DEL, BOM, etc.): currency MUST be INR, airlines MUST be realistic (IndiGo, Air India, Vistara, SpiceJet). NEVER use Delta, United, or USD.
- Violating region rules = INVALID plan.

---

# STEP 3: MULTI-STEP PLANNING (NO SHORTCUTS)
If query involves cheap / best / optimal:
1. Expand date range (next week = 7 separate days)
2. Call searchFlights once per date (each as its own step)
3. Merge all results with aggregateFlights
4. Select best using selectBestFlight
5. Synthesize final answer with synthesizeFinalResponse

---

# STRICT RULES
NEVER:
- Use only 1 step for optimization tasks
- Call synthesizeFinalResponse directly after searchFlights
- Use array indexing like flights[0]
- Pass incomplete inputs to tools

MANDATORY TOOL FLOW ORDER:
1. parseIntent
2. searchFlights x N (one per date, can share same dependsOn)
3. aggregateFlights (dependsOn ALL searchFlights steps)
4. selectBestFlight (dependsOn aggregateFlights)
5. synthesizeFinalResponse (dependsOn selectBestFlight)

---

# TOOL INPUT REQUIREMENTS

aggregateFlights requires:
{ "flightSets": ["$step_2.result", "$step_3.result", ...] }

selectBestFlight requires:
{ "flights": "$step_agg.result.flights", "objective": "cheapest" }

synthesizeFinalResponse requires:
{
  "goal": "<user goal string>",
  "bestResult": "$step_sel.result.bestFlight",
  "alternatives": "$step_sel.result.alternatives",
  "confidence": "$step_sel.result.confidence"
}

---

# VARIABLE PASSING RULES
CORRECT: "$step_4.result.bestFlight"
WRONG:   "$step_1.result.flights[0]"
Always reference named fields. NEVER use array indexing.

---

# TOOLS AVAILABLE
${toolExamples}

Use EXACT tool parameter names shown above.

---

# OUTPUT FORMAT (STRICT)
Return ONLY valid JSON:
{
  "goal": "...",
  "steps": [
    {
      "id": "step_1",
      "objective": "...",
      "tool": "...",
      "inputs": {...},
      "dependsOn": []
    }
  ]
}

# FAILURE CONDITIONS - plan is INVALID if:
- Only 1 search step used for an optimization task
- No aggregateFlights step before selectBestFlight
- No selectBestFlight step before synthesizeFinalResponse
- Wrong currency used
- Unrealistic airlines used
- synthesizeFinalResponse missing bestResult, alternatives, or confidence
- Array indexing used anywhere (e.g. flights[0])
`;

  const userPrompt = `Create a plan for: ${goal}
  
Use tool parameters EXACTLY as shown in the tools available section.
Generate the best possible plan following the strict rules. Return ONLY valid JSON.`;

  const chat = await genAI.getGenerativeModel({ model }).startChat({
    history: [{ role: 'user', parts: [{ text: systemPrompt }] }],
  });

  const result = await chat.sendMessage(userPrompt);
  const response = result.response;
  const text = response.text().trim();

  const jsonMatch = text.match(/```json\n?([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('Could not parse JSON from response: ' + text);
  }

  const parsed = planSchema.safeParse(JSON.parse(jsonMatch[1] || jsonMatch[0]));

  if (!parsed.success) {
    throw new Error(`Invalid plan: ${parsed.error.errors.map(e => e.message).join(', ')}`);
  }

  return parsed.data;
}

export async function createPlanWithRetry(
  goal: string,
  availableTools: string,
  maxRetries: number = 3
): Promise<PlanOutputData> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await generatePlan(goal, availableTools);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error('Failed to create plan');
}