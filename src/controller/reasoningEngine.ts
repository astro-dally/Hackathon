import { ToolRegistry } from '../tools/registry.js';
import { logger } from '../core/logging.js';

export interface ReasoningStep {
  thought: string;
  reasoning: string;
  action?: string;
  observations?: string;
}

export interface Decision {
  tool: string;
  inputs: Record<string, unknown>;
  reason: string;
}

export class ReasoningEngine {
  constructor(
    private registry: ToolRegistry
  ) {}

  async think(goal: string, context: Map<string, unknown> = new Map()): Promise<{ thought: string; decisions: Decision[] }> {
    logger.info(`Reasoning about: ${goal}`);

    const availableTools = this.registry.list();
    const intentAnalysis = this.analyzeIntent(goal);
    const decisions = this.decideNextSteps(intentAnalysis, context, availableTools);

    return {
      thought: intentAnalysis.thought,
      decisions
    };
  }

  private analyzeIntent(goal: string): { thought: string; intent: string; entities: Record<string, unknown> } {
    const intents: Record<string, { pattern: RegExp; thought: string }> = {
      translation: {
        pattern: /translat|meaning|japans|french|spanish|german|hindi|chinese|korean/i,
        thought: "User wants to translate text from one language to another"
      },
      weather: {
        pattern: /weather|temperature|rain|forecast/i,
        thought: "User wants weather information"
      },
      flight: {
        pattern: /flight|fly|airport|sfo|lax|book.*ticket/i,
        thought: "User wants to search or book flights"
      },
      hotel: {
        pattern: /hotel|stay|accommodation|room|lodge/i,
        thought: "User wants to search or book hotels"
      },
      search: {
        pattern: /search|find|look.*up|research/i,
        thought: "User wants to search the web for information"
      },
      calculator: {
        pattern: /calculat|compute|math|percent|\+|\-|乘法|除法|\*|\//i,
        thought: "User wants to calculate something"
      },
      email: {
        pattern: /email|mail|message/i,
        thought: "User wants to send an email"
      },
      reminder: {
        pattern: /remind|alert|schedule/i,
        thought: "User wants to set a reminder"
      },
      greeting: {
        pattern: /^(hi|hello|hey|sup|yo|hiya|heya|greetings)$/i,
        thought: "User is greeting me"
      },
    };

    for (const [intent, config] of Object.entries(intents)) {
      if (config.pattern.test(goal)) {
        return {
          thought: config.thought,
          intent,
          entities: this.extractEntities(goal, intent)
        };
      }
    }

    return {
      thought: "User wants to accomplish a task. I'll analyze what they need and select the appropriate tool.",
      intent: 'unknown',
      entities: this.extractEntities(goal, 'unknown')
    };
  }

  private extractEntities(goal: string, intent: string): Record<string, unknown> {
    const entities: Record<string, unknown> = {};
    const languages: Record<string, string> = {
      'japanese': 'ja', 'spanish': 'es', 'french': 'fr', 'german': 'de',
      'chinese': 'zh', 'korean': 'ko', 'hindi': 'hi', 'english': 'en'
    };

    if (intent === 'translation') {
      const quotedMatch = goal.match(/"([^"]+)"/);
      if (quotedMatch) {
        entities.text = quotedMatch[1].trim();
      } else {
        const wordMatch = goal.replace(/translat\w*/i, '').trim().split(/\s+to\s+/i)[0];
        if (wordMatch) entities.text = wordMatch.trim();
      }
      
      const targetMatch = goal.match(/to\s+(\w+)/i);
      if (targetMatch) {
        const lang = targetMatch[1].toLowerCase();
        entities.targetLang = languages[lang] || lang;
      }
      
      if (!entities.targetLang) {
        for (const [lang, code] of Object.entries(languages)) {
          if (goal.toLowerCase().includes(lang)) {
            entities.targetLang = code;
            break;
          }
        }
      }
      
      if (!entities.targetLang) entities.targetLang = 'ja';
    }

    const airports: Record<string, string> = {
      'delhi': 'DEL', 'new delhi': 'DEL', 'mumbai': 'BOM', 'bangalore': 'BLR',
      'bengaluru': 'BLR', 'sfo': 'SFO', 'lax': 'LAX', 'london': 'LHR',
      'tokyo': 'NRT', 'paris': 'CDG', 'dubai': 'DXB'
    };

    if (intent === 'flight') {
      const fromToMatch = goal.match(/from\s+(\w+)\s+to\s+(\w+)/i);
      if (fromToMatch) {
        const fromCity = fromToMatch[1].toLowerCase();
        const toCity = fromToMatch[2].toLowerCase();
        if (airports[fromCity]) entities.origin = airports[fromCity];
        if (airports[toCity]) entities.destination = airports[toCity];
      } else {
        for (const [city, code] of Object.entries(airports)) {
          if (goal.includes(city)) {
            if (!entities.origin) {
              entities.origin = code;
            } else {
              entities.destination = code;
            }
          }
        }
      }
      
      if (goal.includes('tomorrow')) {
        const tmr = new Date();
        tmr.setDate(tmr.getDate() + 1);
        entities.date = tmr.toISOString().split('T')[0];
      }
    }

    if (intent === 'weather') {
      const cities = ['delhi', 'mumbai', 'bangalore', 'london', 'tokyo', 'paris', 'new york'];
      for (const city of cities) {
        if (goal.includes(city)) {
          entities.location = city.charAt(0).toUpperCase() + city.slice(1);
          break;
        }
      }
    }

    if (intent === 'calculator') {
      let expr = goal.replace(/divided by/gi, '/').replace(/times/gi, '*').replace(/multiplied by/gi, '*');
      const mathMatch = expr.match(/(\d+\s*[\+\-*\/]\s*\d+)/);
      if (mathMatch) entities.expression = mathMatch[1].replace(/\s+/g, '');
    }

    if (intent === 'reminder') {
      const titleMatch = goal.match(/reminder\s+(?:for\s+)?(.+?)(?:\s+at|\s+tomorrow|\s+today|$)/i);
      if (titleMatch) entities.title = titleMatch[1].trim();
      
      const timeMatch = goal.match(/\bat\s+(\d+(?::\d+)?\s*(?:am|pm)?)/i);
      if (timeMatch) {
        entities.time = timeMatch[1].trim();
      } else if (goal.includes('tomorrow')) {
        entities.time = 'tomorrow';
      } else if (goal.includes('today')) {
        entities.time = 'today';
      }
    }

    return entities;
  }

  private decideNextSteps(
    intentAnalysis: { thought: string; intent: string; entities: Record<string, unknown> },
    context: Map<string, unknown>,
    availableTools: { name: string; description: string }[]
  ): Decision[] {
    const decisions: Decision[] = [];
    const { intent, thought } = intentAnalysis;

    if (intent === 'greeting') {
      decisions.push({
        tool: 'searchWeb',
        inputs: { query: '' },
        reason: thought,
      });
      return decisions;
    }

    const toolMap: Record<string, string> = {
      'translation': 'translateText',
      'flight': 'searchFlights',
      'hotel': 'searchHotels',
      'weather': 'getWeather',
      'search': 'searchWeb',
      'calculator': 'calculate',
      'email': 'sendEmail',
      'reminder': 'createReminder',
    };

    const tool = toolMap[intent];
    if (tool && availableTools.find(t => t.name === tool)) {
      decisions.push({
        tool,
        inputs: intentAnalysis.entities,
        reason: `Based on my analysis: "${thought}". I'll use ${tool} to ${this.getToolAction(tool)}.`
      });
    } else {
      decisions.push({
        tool: 'searchWeb',
        inputs: { query: Object.values(intentAnalysis.entities)[0] || '' },
        reason: "I'll search the web for relevant information."
      });
    }

    return decisions;
  }

  private getToolAction(tool: string): string {
    const actions: Record<string, string> = {
      'translateText': 'translate the text',
      'searchFlights': 'find available flights',
      'searchHotels': 'find available hotels',
      'getWeather': 'get weather information',
      'searchWeb': 'search the web',
      'calculate': 'perform the calculation',
      'sendEmail': 'send an email',
      'createReminder': 'set a reminder',
    };
    return actions[tool] || 'help the user';
  }
}

export function createReasoningEngine(registry: ToolRegistry): ReasoningEngine {
  return new ReasoningEngine(registry);
}