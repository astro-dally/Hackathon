# AI Agent Orchestration Framework - Project Context

## Overview

This project is a **resilient multi-step AI agent framework** that reliably executes tasks under uncertainty. It has been upgraded from a simple workflow engine to an **uncertainty-aware, self-correcting agent loop** with intelligent recovery mechanisms.

### Tech Stack

| Component | Technology |
|----------|----------|
| Language | TypeScript |
| Runtime | Node.js |
| LLM | Google Gemini (gemini-2.5-flash) |
| Frontend | Next.js 16 |
| UI | React + Framer Motion + Tailwind CSS |
| Schema Validation | Zod |

---

## Architecture

### Control Loop: THINK → PLAN → ACT → OBSERVE → VERIFY → REFLECT → ADAPT → REPEAT

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AGENT CONTROLLER LOOP                             │
│                                                                         │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐            │
│  │  THINK  │───▶│  PLAN   │───▶│   ACT   │───▶│ OBSERVE │            │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘            │
│       ▲                                                  │            │
│       │                                                  ▼            │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐            │
│  │ REPEAT  │◀───│  ADAPT  │◀───│ REFLECT │◀───│ VERIFY  │            │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
/Users/dally/Hackathon/
├── src/
│   ├── types/index.ts             # All TypeScript interfaces + new types
│   ├── core/
│   │   ├── state.ts               # StateStore (run tracking)
│   │   ├── logging.ts            # Logger
│   │   └── memory.ts             # Persistent Memory Layer (NEW)
│   ├── tools/
│   │   ├── registry.ts           # ToolRegistry + DefaultTool
│   │   ├── circuit.ts            # CircuitBreaker class
│   │   ├── retry.ts              # withSmartRetry utility
│   │   ├── chain.ts              # ToolWithFallback
│   │   └── builtins.ts           # 10 pre-built tools
│   ├── planner/
│   │   ├── client.ts             # Gemini API client
│   │   ├── planner.ts            # LLM-based planner
│   │   └── refiner.ts           # Partial Plan Refinement (NEW)
│   ├── executor/
│   │   └── executor.ts           # Step execution engine
│   ├── verifier/
│   │   ├── schema.ts             # Zod-based verification
│   │   ├── rules.ts              # Rule-based verification
│   │   ├── llm.ts                # LLM-based verification
│   │   └── repair.ts             # Repair Engine (NEW)
│   ├── controller/
│   │   └── agentLoop.ts          # Main Agent Controller (NEW)
│   └── orchestrator/
│       └── orchestrator.ts       # Main orchestration
├── web/                          # Next.js frontend
│   ├── src/app/
│   │   ├── page.tsx             # Dashboard UI
│   │   └── api/agent/route.ts  # Agent API endpoint
│   └── package.json
├── .env                          # Environment variables
├── package.json                  # Root package.json
├── README.md                     # Documentation
├── PLAN.md                       # Project plan
└── CONTEXT.md                    # This file
```

---

## What We Built

### 1. Core Agent Framework (`/src`)

#### Types (`src/types/index.ts`) - Updated
- `Step` - Now includes `confidence?: number` and `uncertaintyReason?: string`
- `Plan` - Metadata now includes `iteration` and `partialReplan`
- `ToolResult` - Success/failure result with optional error
- `Tool` - Tool interface with Zod schema validation
- `VerificationResult` - Now includes `suggestedFixes`, `confidence`
- **NEW:** `StepExecution`, `ToolPerformance`, `MemoryEntry`, `ReflectionResult`, `AgentLoopConfig`, `IterationResult`, `FixSuggestion`

#### Core (`src/core/`)
- **StateStore** - Tracks run state across execution
- **Logger** - Formatted console logging
- **MemoryStore** (NEW) - Persistent memory with tool performance tracking, cached results, failure pattern detection

#### Tools (`src/tools/`)
- **ToolRegistry** - Register, get, list tools
- **CircuitBreaker** - CLOSED → OPEN → HALF_OPEN → CLOSED
- **Retrier** - Exponential backoff with jitter
- **ToolWithFallback** - Primary → Fallback chain
- **Built-in Tools** - 10 tools: searchFlights, bookFlight, searchHotels, bookHotel, getWeather, searchWeb, createReminder, sendEmail, calculate, translateText

#### Planner (`src/planner/`)
- **Client** - Google Gemini API integration with mock fallback
- **Planner** - LLM-based plan generation
- **PlanRefiner** (NEW) - Partial replanning - modifies only failed steps while preserving successful ones

#### Executor (`src/executor/`)
- **Executor** - Step execution with retry + circuit breaker

#### Verifier (`src/verifier/`)
- **SchemaVerifier** - Zod-based validation
- **RuleVerifier** - Rule-based validation
- **LLMVerifier** - Gemini-based semantic verification
- **RepairEngine** (NEW) - Analyzes failures, suggests fixes, can regenerate inputs or switch tools

#### Controller (`src/controller/`) - NEW
- **AgentLoop** - Main iterative agent controller:
  - Generates or refines plan
  - Executes next step(s)
  - Verifies outputs
  - Repairs or adapts if needed
  - Updates state
  - Decides whether to continue, replan, or terminate
  - Supports partial refinement (not full replan every time)
  - Pre-execution guard validates tool choice and inputs
  - Reflection step analyzes failures and detects patterns

### 2. Frontend (`/web`)

#### API Route (`/web/src/app/api/agent/route.ts`)
- POST /api/agent - Run agent with goal
- GET /api/agent - List available tools

#### Dashboard UI (`/web/src/app/page.tsx`)
- Glassmorphism dark UI with animated workflow
- Real-time activity feed
- Step cards with tool icons
- Progress indicator

---

## Key Design Patterns

### 1. Uncertainty-Aware Agent Loop
```
THINK → PLAN → ACT → OBSERVE → VERIFY → REFLECT → ADAPT → REPEAT
```

### 2. Resilience Layers (Preserved)
- **Retry** - Exponential backoff for transient failures
- **Circuit Breaker** - Fail fast on persistent failures
- **Fallback** - Graceful degradation

### 3. Self-Healing Mechanisms
- **Partial Replanning** - Fix only failed steps, preserve successful ones
- **Repair Engine** - Regenerate inputs, switch tools, retry
- **Pre-execution Guard** - Validate before executing
- **Memory Layer** - Track tool reliability, avoid repeated mistakes

### 4. Confidence Modeling
Each step includes:
```typescript
interface Step {
  confidence: number;       // 0-1
  uncertaintyReason?: string;
}
```

---

## Environment Variables

```bash
# .env file (in /Users/dally/Hackathon/)
GEMINI_API_KEY=your_google_gemini_api_key
```

---

## How to Run

### Backend (Agent Framework)

```bash
cd /Users/dally/Hackathon

# Test new agent loop
npx tsx src/example-agent.ts

# Test original orchestrator
npx tsx src/example.ts
```

### Frontend

```bash
cd /Users/dally/Hackathon/web
npm run dev
```

Then open http://localhost:3000

---

## API Reference

### createAgentLoop(goal, registry, config)

Creates an uncertainty-aware agent loop.

```typescript
const agent = createAgentLoop(goal, registry, {
  maxIterations: 5,
  confidenceThreshold: 0.7,
  enablePartialRefinement: true,
  enableRepair: true,
  enableReflection: true,
  maxRepairsPerStep: 2,
});

const result = await agent.run();
```

### AgentLoopConfig

```typescript
interface AgentLoopConfig {
  maxIterations: number;          // Max iterations (default: 10)
  confidenceThreshold: number;    // Min confidence to continue (default: 0.7)
  enablePartialRefinement: boolean;  // Enable partial replan (default: true)
  enableRepair: boolean;         // Enable auto-repair (default: true)
  enableReflection: boolean;     // Enable pattern detection (default: true)
  maxRepairsPerStep: number;      // Max repairs per step (default: 3)
}
```

### runAgent(goal, config)

Original orchestrator entry point.

---

## Features Implemented

### Core Agent Features
- [x] Agent Controller Loop (iterative execution)
- [x] Retry with exponential backoff
- [x] Circuit breaker (CLOSED → OPEN → HALF_OPEN)
- [x] Fallback chains
- [x] Timeout handling

### New Uncertainty-Aware Features
- [x] Partial replanning (fix failed steps only)
- [x] Repair engine (regenerate inputs, switch tools)
- [x] Pre-execution validation
- [x] Confidence modeling (0-1 per step)
- [x] Persistent memory layer
- [x] Reflection & pattern detection
- [x] DAG execution (parallel independent steps)

### LLM Integration
- [x] Google Gemini API
- [x] Structured plan generation
- [x] Mock fallback when unavailable
- [x] Configurable model

### Verification
- [x] Schema validation (Zod)
- [x] Rule-based validation
- [x] LLM-based verification
- [x] Fix suggestions

### Frontend
- [x] Dark glassmorphism UI
- [x] Real-time activity log
- [x] Step visualization
- [x] Progress tracking
- [x] Framer Motion animations

### Tools (10 built-in)
1. ✈️ `searchFlights` - Search flights
2. 🎫 `bookFlight` - Book flight
3. 🏨 `searchHotels` - Search hotels
4. 🔑 `bookHotel` - Book hotel
5. 🌤️ `getWeather` - Weather forecast
6. 🔍 `searchWeb` - Web search
7. ⏰ `createReminder` - Create reminder
8. 📧 `sendEmail` - Send email
9. 🧮 `calculate` - Math calculation
10. 🌐 `translateText` - Translation

---

## Lessons Learned / Notes

1. **API Keys** - Gemini free tier has limited quota. When exhausted, uses mock planner automatically.

2. **Zod in API Routes** - TypeScript issues with Zod errors. Use `(error as any).issues` for compatibility.

3. **Next.js TypeScript** - Sometimes need explicit null checks like `step.result !== undefined && step.result !== null`.

4. **Model Selection** - gemini-2.5-flash works better than gemini-2.0-flash for this API key.

5. **Confidence Threshold** - Use 0.7 as default; steps below this trigger repair/replan logic.

6. **Memory Layer** - Accumulates tool performance data over time; helps avoid unreliable tools.

---

## Files Created

| File | Description |
|------|------------|
| `/src/types/index.ts` | Core types (updated with new interfaces) |
| `/src/core/state.ts` | State store |
| `/src/core/logging.ts` | Logger |
| `/src/core/memory.ts` | Persistent memory layer (NEW) |
| `/src/tools/registry.ts` | Tool registry |
| `/src/tools/circuit.ts` | Circuit breaker |
| `/src/tools/retry.ts` | Retry logic |
| `/src/tools/chain.ts` | Fallback chains |
| `/src/tools/builtins.ts` | Built-in tools |
| `/src/planner/client.ts` | Gemini client |
| `/src/planner/planner.ts` | Planner |
| `/src/planner/refiner.ts` | Partial plan refiner (NEW) |
| `/src/executor/executor.ts` | Executor |
| `/src/verifier/schema.ts` | Schema verifier |
| `/src/verifier/rules.ts` | Rules verifier |
| `/src/verifier/llm.ts` | LLM verifier |
| `/src/verifier/repair.ts` | Repair engine (NEW) |
| `/src/controller/agentLoop.ts` | Main agent loop (NEW) |
| `/src/orchestrator/orchestrator.ts` | Orchestrator |
| `/src/index.ts` | Main export |
| `/src/example.ts` | Original example |
| `/src/example-agent.ts` | New agent loop example |
| `/web/src/app/page.tsx` | Dashboard UI |
| `/web/src/app/api/agent/route.ts` | API route |
| `/package.json` | Root package |
| `/web/package.json` | Frontend package |
| `/tsconfig.json` | TypeScript config |
| `/README.md` | Documentation |
| `/PLAN.md` | Project plan |
| `/.env` | Environment |
| `/CONTEXT.md` | This file |

---

## Current Status

✅ Framework complete with all resilience patterns
✅ Uncertainty-aware agent loop implemented
✅ Partial replanning and repair engine working
✅ Memory layer for tool performance tracking
✅ Frontend with beautiful dark UI
✅ 10 tools working
✅ Agent API functional
✅ Live demo possible

**Next potential improvements:**
- WebSocket for real-time updates
- Add user authentication
- Persistent state storage (SQLite)
- Multi-agent coordination
- More sophisticated confidence modeling