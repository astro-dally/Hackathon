# AI Agent Orchestration Framework

A resilient multi-step AI agent framework that reliably executes tasks under uncertainty. Built with production-grade reliability patterns and an intelligent self-correcting agent loop.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Next.js](https://img.shields.io/badge/Next.js-16.x-black)

## 🚀 Features

### Core Reliability Patterns
- **Retry with Backoff** - Exponential backoff with jitter for transient failures
- **Circuit Breaker** - CLOSED → OPEN → HALF_OPEN state transitions
- **Fallback Chains** - Primary tool → fallback1 → fallback2 → graceful degradation

### Uncertainty-Aware Agent Loop (NEW!)
The system now follows this control loop:
```
THINK → PLAN → ACT → OBSERVE → VERIFY → REFLECT → ADAPT → REPEAT
```

- **Agent Controller** - Iterative execution with max iterations
- **Partial Replanning** - Fix only failed steps, preserve successful ones
- **Repair Engine** - Suggests and applies fixes (regenerate inputs, switch tools)
- **Pre-execution Guard** - Validates tool choice and inputs before execution
- **Memory Layer** - Tracks tool reliability, cached results, failure patterns
- **DAG Execution** - Parallel execution of independent steps based on dependencies
- **Reflection** - Analyzes failures, detects patterns, adjusts behavior

### LLM Integration
- **Google Gemini** API integration (gemini-2.5-flash)
- **Structured plan generation** with Zod validation
- **Mock fallback** when LLM unavailable or quota exceeded

### Verification
- **Schema validation** (Zod)
- **Rule-based validation**
- **LLM-based semantic verification**
- **Fix suggestions** with confidence scores

### UI/UX
- **Dark glassmorphism** dashboard
- **Real-time activity feed** with animations
- **Step visualization** with tool icons
- **Progress tracking** with Framer Motion

---

## 📁 Project Structure

```
/Users/dally/Hackathon/
├── src/
│   ├── types/index.ts              # TypeScript interfaces
│   ├── core/
│   │   ├── state.ts               # State store
│   │   ├── logging.ts             # Logger
│   │   └── memory.ts              # Persistent memory (NEW)
│   ├── tools/
│   │   ├── registry.ts            # ToolRegistry
│   │   ├── circuit.ts             # CircuitBreaker
│   │   ├── retry.ts               # Retry logic
│   │   ├── chain.ts               # Fallback chains
│   │   └── builtins.ts            # 10 built-in tools
│   ├── planner/
│   │   ├── client.ts              # Gemini client
│   │   ├── planner.ts             # Planner
│   │   └── refiner.ts             # Plan refinement (NEW)
│   ├── executor/
│   │   └── executor.ts            # Step execution
│   ├── verifier/
│   │   ├── schema.ts              # Schema verifier
│   │   ├── rules.ts               # Rules verifier
│   │   ├── llm.ts                 # LLM verifier
│   │   └── repair.ts              # Repair engine (NEW)
│   ├── controller/
│   │   └── agentLoop.ts          # Agent controller (NEW)
│   └── orchestrator/
│       └── orchestrator.ts        # Orchestrator
├── web/                           # Next.js frontend
│   ├── src/app/
│   │   ├── page.tsx              # Dashboard UI
│   │   └── api/agent/route.ts    # API endpoint
│   └── package.json
├── .env                          # Environment variables
├── package.json                  # Root package
└── README.md                     # This file
```

---

## 🛠️ Setup

### 1. Install Dependencies

```bash
cd /Users/dally/Hackathon
npm install
```

### 2. Set Environment Variable

Create a `.env` file:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Get API key from: https://aistudio.google.com/app/apikey

### 3. Run the Agent

```bash
# New uncertainty-aware agent loop
npx tsx src/example-agent.ts

# Original orchestrator
npx tsx src/example.ts
```

### 4. Run the Frontend

```bash
cd web
npm run dev
```

Then open **http://localhost:3000**

---

## 📖 Usage Examples

### Basic Agent Loop

```typescript
import { ToolRegistry, DefaultTool, createAgentLoop } from './index.js';
import { z } from 'zod';

// Create tools
const searchTool = new DefaultTool(
  'searchFlights',
  'Search for flights',
  z.object({ origin: z.string(), destination: z.string(), date: z.string() }),
  async (params) => ({ success: true, data: { flights: [...] }, error: '' })
);

// Register tools
const registry = new ToolRegistry();
registry.register(searchTool);

// Run agent with config
const agent = createAgentLoop('Search flights SFO to LAX', registry, {
  maxIterations: 5,
  confidenceThreshold: 0.7,
  enablePartialRefinement: true,
  enableRepair: true,
  enableReflection: true,
  maxRepairsPerStep: 2,
});

const result = await agent.run();
console.log(result.success);   // true/false
console.log(result.steps);      // StepExecution[]
```

### Tool with Fallback

```typescript
const primaryTool = new DefaultTool('api', 'Primary API', schema, handler);
const fallbackTool = new DefaultTool('cache', 'Cached data', schema, cacheHandler);

const chain = new ToolWithFallback({
  primary: primaryTool,
  fallbacks: [fallbackTool],
});
```

### Custom Verifier

```typescript
const verifier = createSchemaVerifier(responseSchema);
const result = await verifier.verify(input, output);
```

---

## 🔧 Available Tools (10)

| Tool | Description |
|------|-------------|
| ✈️ `searchFlights` | Search flights by origin/destination/date |
| 🎫 `bookFlight` | Book a flight by ID |
| 🏨 `searchHotels` | Search hotels by location/dates |
| 🔑 `bookHotel` | Book a hotel by ID |
| 🌤️ `getWeather` | Get weather forecast |
| 🔍 `searchWeb` | Search the web |
| ⏰ `createReminder` | Create a reminder |
| 📧 `sendEmail` | Send an email |
| 🧮 `calculate` | Calculate math expression |
| 🌐 `translateText` | Translate text |

---

## ⚙️ Configuration

### AgentLoopConfig

```typescript
interface AgentLoopConfig {
  maxIterations: number;          // Max iterations (default: 10)
  confidenceThreshold: number;    // Min confidence to continue (default: 0.7)
  enablePartialRefinement: boolean;  // Enable partial replan (default: true)
  enableRepair: boolean;          // Enable auto-repair (default: true)
  enableReflection: boolean;      // Enable pattern detection (default: true)
  maxRepairsPerStep: number;      // Max repairs per step (default: 3)
}
```

### ExecutorConfig

```typescript
interface ExecutorConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  stepTimeout: number;
  circuitFailureThreshold: number;
  circuitResetTimeoutMs: number;
}
```

---

## 🎯 API Reference

### POST /api/agent

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"goal": "Search flights from SFO to LAX on 2024-06-15"}'
```

### Response

```json
{
  "success": true,
  "runId": "run_1234567890_abc123",
  "goal": "Search flights from SFO to LAX on 2024-06-15",
  "steps": [
    {
      "stepId": "step_1",
      "tool": "searchFlights",
      "objective": "Search for available flights",
      "status": "completed",
      "result": { "flights": [...] },
      "attempts": 1,
      "durationMs": 500
    }
  ],
  "durationMs": 1500
}
```

---

## 🔍 How It Works

### 1. Think & Plan
- Agent analyzes the goal
- LLM generates a structured plan
- Plan includes tool selection and inputs

### 2. Act & Observe
- Execute each step with retry/circuit breaker
- Collect results and timing
- Handle tool failures gracefully

### 3. Verify
- Validate outputs with schema/rules/LLM
- Generate confidence scores
- Suggest fixes if invalid

### 4. Reflect & Adapt
- Analyze failures and patterns
- Use memory to avoid repeated mistakes
- Decide: retry, repair, or replan

### 5. Repeat
- Continue until goal achieved or max iterations
- Partial replanning preserves successful steps

---

## 📝 Examples to Try

1. **Flight Search + Book**
   ```
   Search for flights from SFO to LAX on 2024-06-15, then book the cheapest one
   ```

2. **Weather Forecast**
   ```
   Get weather forecast for New York for 5 days
   ```

3. **Hotel Search**
   ```
   Search for hotels in Chicago from June 20-25 for 2 guests
   ```

4. **Calculation**
   ```
   Calculate 25% tip on $250
   ```

5. **Translation**
   ```
   Translate "Hello world" to Spanish
   ```

---

## 🆘 Troubleshooting

### "GEMINI_API_KEY environment variable is required"
Make sure you have a `.env` file with:
```
GEMINI_API_KEY=your_key_here
```

### LLM Quota Exceeded
The system automatically falls back to a mock planner when quota is exceeded.

### Circuit Breaker OPEN
The tool has failed too many times. It will automatically close after the reset timeout.

---

## 🤝 Contributing

Feel free to extend this framework with:
- More tools
- Additional LLM providers
- Enhanced verification strategies
- Persistent storage

---

## 📄 License

MIT