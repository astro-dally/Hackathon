import { Tool, ToolResult } from '../types/index.js';
import { z } from 'zod';
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const searchParams = z.object({
  query: z.string(),
  limit: z.number().optional(),
});

const bookFlightParams = z.object({
  flightId: z.string(),
  passengerName: z.string().optional(),
});

const hotelSearchParams = z.object({
  location: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().optional(),
});

const bookHotelParams = z.object({
  hotelId: z.string(),
  guestName: z.string(),
});

const weatherParams = z.object({
  location: z.string(),
  days: z.number().optional(),
});

const reminderParams = z.object({
  title: z.string(),
  time: z.string(),
  message: z.string().optional(),
});

const sendEmailParams = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

const calculateParams = z.object({
  expression: z.string(),
});

const translateParams = z.object({
  text: z.string(),
  targetLang: z.string(),
});

const selectBestFlightParams = z.object({
  flights: z.array(z.any()).describe('Array of flight objects to compare'),
  objective: z.enum(['cheapest', 'fastest', 'best']).default('cheapest').describe('Optimisation objective'),
});

const parseIntentParams = z.object({
  query: z.string().describe('The raw user query to parse into structured intent'),
});

const aggregateFlightsParams = z.object({
  flightSets: z.array(z.any()).describe('Array of flight result sets from multiple searchFlights calls'),
});

const synthesizeParams = z.object({
  goal: z.string().describe("The user's original goal"),
  bestResult: z.any().describe("The best result computed from a selection step"),
  alternatives: z.array(z.any()).describe("A list of alternative options from the selection step"),
  confidence: z.union([z.number(), z.string()]).optional().describe("Confidence score of the decision"),
});

export const builtInTools: Tool[] = [
  {
    name: 'parseIntent',
    description: 'Parse a raw user query into structured intent: intent type, origin, destination, date range, preference, region, and currency. MUST be called as the FIRST step.',
    parameters: parseIntentParams,
    execute: async (params) => {
      const p = params as { query?: string };
      // Guard: if query is missing (e.g. from a repair retry with {}), return a safe default
      if (!p.query) {
        return { success: false, error: 'parseIntent requires a non-empty query string' };
      }
      const q = p.query.toLowerCase();

      // Detect region and currency
      const indianCities: Record<string, string> = {
        delhi: 'DEL', 'new delhi': 'DEL', mumbai: 'BOM', bangalore: 'BLR',
        bengaluru: 'BLR', hyderabad: 'HYD', chennai: 'MAA', kolkata: 'CCU',
        pune: 'PNQ', goa: 'GOI', ahmedabad: 'AMD', jaipur: 'JAI',
      };
      let origin = 'DEL', destination = 'BOM', region = 'IN', currency = 'INR';

      for (const [city, code] of Object.entries(indianCities)) {
        if (q.includes(`from ${city}`)) origin = code;
        if (q.includes(`to ${city}`)) destination = code;
      }

      // Detect date range
      const now = new Date();
      const isNextWeek = q.includes('next week');
      const start = new Date(now); start.setDate(now.getDate() + 1);
      const end = new Date(now); end.setDate(now.getDate() + (isNextWeek ? 7 : 3));

      const preference = q.includes('cheap') || q.includes('cheapest') ? 'cheapest'
        : q.includes('fast') ? 'fastest' : 'best';

      const greetings = ['hi', 'hello', 'hey', 'greetings', 'sup', 'yo'];
      const isSmallTalk = greetings.some(g => q.includes(g)) && !q.includes('flight') && !q.includes('book');

      return {
        success: true,
        data: {
          intent: isSmallTalk ? 'small_talk' : 'flight_search',
          entities: {
            origin,
            destination,
            dateRange: {
              start: start.toISOString().split('T')[0],
              end: end.toISOString().split('T')[0],
            },
            preference,
            passengers: 1,
          },
          context: { region, currency },
        },
      };
    },
  },
  {
    name: 'aggregateFlights',
    description: 'Merge multiple flight result arrays from several searchFlights calls into a single flat list. Call this BEFORE selectBestFlight.',
    parameters: aggregateFlightsParams,
    execute: async (params) => {
      const p = params as { flightSets: any[] };
      const allFlights: any[] = [];
      for (const set of p.flightSets) {
        const flights = Array.isArray(set)
          ? set
          : set?.flights ?? set?.data?.flights ?? [];
        allFlights.push(...flights);
      }
      return {
        success: true,
        data: { flights: allFlights, count: allFlights.length },
      };
    },
  },
  {
    name: 'searchFlights',
    description: 'Search for available flights (params: origin, destination, date)',
    parameters: z.object({
      origin: z.string(),
      destination: z.string(),
      date: z.string(),
    }),
    execute: async (params) => {
      const p = params as { origin: string; destination: string; date: string };
      await new Promise(r => setTimeout(r, 800));

      const indianAirports = new Set(['DEL','BOM','BLR','HYD','MAA','CCU','PNQ','GOI','AMD','JAI','COK','IXC']);
      const isIndia = indianAirports.has(p.origin?.toUpperCase()) || indianAirports.has(p.destination?.toUpperCase());

      const flights = isIndia
        ? [
            { id: `6E-${Math.floor(Math.random()*900)+100}`, origin: p.origin, destination: p.destination, price: 3499, currency: 'INR', airline: 'IndiGo', duration: '2h 05m', date: p.date, departure: '06:15', arrival: '08:20' },
            { id: `AI-${Math.floor(Math.random()*900)+100}`, origin: p.origin, destination: p.destination, price: 4850, currency: 'INR', airline: 'Air India', duration: '2h 20m', date: p.date, departure: '09:30', arrival: '11:50' },
            { id: `UK-${Math.floor(Math.random()*900)+100}`, origin: p.origin, destination: p.destination, price: 5200, currency: 'INR', airline: 'Vistara', duration: '2h 10m', date: p.date, departure: '13:45', arrival: '15:55' },
            { id: `SG-${Math.floor(Math.random()*900)+100}`, origin: p.origin, destination: p.destination, price: 2999, currency: 'INR', airline: 'SpiceJet', duration: '2h 30m', date: p.date, departure: '17:00', arrival: '19:30' },
          ]
        : [
            { id: 'FL001', origin: p.origin, destination: p.destination, price: 299, currency: 'USD', airline: 'Delta', duration: '2h 30m', date: p.date, departure: '08:00', arrival: '10:30' },
            { id: 'FL002', origin: p.origin, destination: p.destination, price: 349, currency: 'USD', airline: 'United', duration: '2h 45m', date: p.date, departure: '11:00', arrival: '13:45' },
            { id: 'FL003', origin: p.origin, destination: p.destination, price: 199, currency: 'USD', airline: 'Southwest', duration: '3h 00m', date: p.date, departure: '15:00', arrival: '18:00' },
          ];

      return {
        success: true,
        data: { flights, searchedAt: new Date().toISOString(), date: p.date },
      };
    },
  },
  {
    name: 'bookFlight',
    description: 'Book a flight by ID (params: flightId, passengerName?)',
    parameters: bookFlightParams,
    execute: async (params) => {
      const p = params as { flightId: string; passengerName?: string };
      await new Promise(r => setTimeout(r, 500));
      return {
        success: true,
        data: {
          confirmationNumber: `BK-${p.flightId}-${Date.now().toString(36).toUpperCase()}`,
          status: 'confirmed',
          flightId: p.flightId,
          passengerName: p.passengerName || 'Passenger',
          bookedAt: new Date().toISOString(),
        },
      };
    },
  },
  {
    name: 'searchHotels',
    description: 'Search for hotels (params: location, checkIn, checkOut, guests?)',
    parameters: hotelSearchParams,
    execute: async (params) => {
      const p = params as { location: string; checkIn: string; checkOut: string; guests?: number };
      await new Promise(r => setTimeout(r, 700));
      return {
        success: true,
        data: {
          hotels: [
            { id: 'HTL001', name: 'Grand Hotel', location: p.location, price: 199, rating: 4.5, amenities: ['pool', 'wifi', 'gym'] },
            { id: 'HTL002', name: 'City Inn', location: p.location, price: 129, rating: 4.0, amenities: ['wifi', 'breakfast'] },
            { id: 'HTL003', name: 'Seaside Resort', location: p.location, price: 299, rating: 4.8, amenities: ['pool', 'spa', 'wifi', 'gym'] },
          ],
          checkIn: p.checkIn,
          checkOut: p.checkOut,
        },
      };
    },
  },
  {
    name: 'bookHotel',
    description: 'Book a hotel (params: hotelId, guestName)',
    parameters: bookHotelParams,
    execute: async (params) => {
      const p = params as { hotelId: string; guestName: string };
      await new Promise(r => setTimeout(r, 400));
      return {
        success: true,
        data: {
          confirmationId: `HTL-${p.hotelId}-${Date.now().toString(36).toUpperCase()}`,
          status: 'confirmed',
          hotelId: p.hotelId,
          guestName: p.guestName,
          bookedAt: new Date().toISOString(),
        },
      };
    },
  },
  {
    name: 'getWeather',
    description: 'Get weather forecast (params: location, days?)',
    parameters: weatherParams,
    execute: async (params) => {
      const p = params as { location: string; days?: number };
      await new Promise(r => setTimeout(r, 300));
      const days = p.days || 3;
      const weather = ['sunny', 'partly cloudy', 'rainy', 'sunny', 'clear'];
      return {
        success: true,
        data: {
          location: p.location,
          current: { temp: 72, condition: 'sunny', humidity: 45 },
          forecast: Array.from({ length: days }, (_, i) => ({
            day: ['Today', 'Tomorrow', 'Wed', 'Thu', 'Fri'][i] || `Day ${i + 1}`,
            high: 70 + Math.floor(Math.random() * 15),
            low: 55 + Math.floor(Math.random() * 10),
            condition: weather[i % weather.length],
          })),
          updatedAt: new Date().toISOString(),
        },
      };
    },
  },
  {
    name: 'searchWeb',
    description: 'Search the web (params: query, limit?)',
    parameters: searchParams,
    execute: async (params) => {
      const p = params as { query: string; limit?: number };
      await new Promise(r => setTimeout(r, 600));
      return {
        success: true,
        data: {
          results: [
            { title: `${p.query} - Result 1`, url: 'https://example.com/1', snippet: `Relevant information about ${p.query}...` },
            { title: `${p.query} - Result 2`, url: 'https://example.com/2', snippet: `Additional details on ${p.query}...` },
            { title: `${p.query} - Result 3`, url: 'https://example.com/3', snippet: `More about ${p.query}...` },
          ].slice(0, p.limit || 3),
          totalResults: 42,
          query: p.query,
        },
      };
    },
  },
  {
    name: 'createReminder',
    description: 'Create a reminder (params: title, time, message?)',
    parameters: reminderParams,
    execute: async (params) => {
      const p = params as { title: string; time: string; message?: string };
      await new Promise(r => setTimeout(r, 200));
      return {
        success: true,
        data: {
          reminderId: `REM-${Date.now().toString(36).toUpperCase()}`,
          title: p.title,
          time: p.time,
          message: p.message || '',
          status: 'scheduled',
          createdAt: new Date().toISOString(),
        },
      };
    },
  },
  {
    name: 'sendEmail',
    description: 'Send an email (params: to, subject, body)',
    parameters: sendEmailParams,
    execute: async (params) => {
      const p = params as { to: string; subject: string; body: string };
      await new Promise(r => setTimeout(r, 500));
      return {
        success: true,
        data: {
          messageId: `MSG-${Date.now().toString(36).toUpperCase()}`,
          to: p.to,
          subject: p.subject,
          status: 'sent',
          sentAt: new Date().toISOString(),
        },
      };
    },
  },
  {
    name: 'calculate',
    description: 'Calculate a math expression (params: expression)',
    parameters: calculateParams,
    execute: async (params) => {
      const p = params as { expression: string };
      await new Promise(r => setTimeout(r, 100));
      try {
        const result = Function(`"use strict"; return (${p.expression})`)();
        return {
          success: true,
          data: {
            expression: p.expression,
            result: typeof result === 'number' ? result : String(result),
            calculatedAt: new Date().toISOString(),
          },
        };
      } catch {
        return { success: false, error: 'Invalid expression' };
      }
    },
  },
  {
    name: 'translateText',
    description: 'Translate text (params: text, targetLang)',
    parameters: translateParams,
    execute: async (params) => {
      const p = params as { text: string; targetLang: string };
      await new Promise(r => setTimeout(r, 400));
      const translations: Record<string, string> = {
        'es': 'Translated (Spanish)',
        'fr': 'Translated (French)',
        'de': 'Translated (German)',
        'ja': 'Translated (Japanese)',
        'zh': 'Translated (Chinese)',
      };
      return {
        success: true,
        data: {
          original: p.text,
          translated: `${p.text} [${translations[p.targetLang] || p.targetLang}]`,
          targetLang: p.targetLang,
          detectedLang: 'en',
        },
      };
    },
  },
  {
    name: 'selectBestFlight',
    description: 'Compare a list of flights and select the best one based on an objective (cheapest, fastest, best). Returns bestFlight, alternatives, and confidence. MUST be called before synthesizeFinalResponse.',
    parameters: selectBestFlightParams,
    execute: async (params) => {
      const p = params as { flights: any[]; objective: string };
      if (!p.flights || p.flights.length === 0) {
        return { success: false, error: 'No flights provided' };
      }
      const sorted = [...p.flights].sort((a, b) => {
        if (p.objective === 'fastest') {
          const durA = parseInt(String(a.duration || '999').replace(/\D/g, ''));
          const durB = parseInt(String(b.duration || '999').replace(/\D/g, ''));
          return durA - durB;
        }
        return (a.price ?? Infinity) - (b.price ?? Infinity);
      });
      const [best, ...rest] = sorted;
      return {
        success: true,
        data: {
          bestFlight: best,
          alternatives: rest.slice(0, 2),
          confidence: rest.length > 0 ? 0.85 : 0.6,
        },
      };
    },
  },
  {
    name: 'synthesizeFinalResponse',
    description: 'Use as the FINAL step to evaluate raw data, enforce regional realism, normalize currency/airlines, and output the final human-readable conversational answer.',
    parameters: synthesizeParams,
    execute: async (params) => {
      const p = params as { goal: string; bestResult: any; alternatives: any[]; confidence?: any };

      // ── Local fallback formatter (no LLM needed) ─────────────────────────────
      function localFormat(): string {
        const b = p.bestResult;
        if (!b) return 'I was unable to find a suitable result for your query.';
        
        // Handle generic message results (like greetings)
        if (b.message) return b.message;

        const currency = b.currency === 'INR' ? '₹' : (b.currency === 'USD' ? '$' : '');
        const price = b.price != null ? `${currency}${b.price.toLocaleString()}` : 'unknown price';
        const alts = (p.alternatives || []).slice(0, 2).map((a: any) => {
          const aC = a.currency === 'INR' ? '₹' : (a.currency === 'USD' ? '$' : '');
          return `${a.airline} for ${aC}${a.price?.toLocaleString() ?? '?'} (${a.duration})`;
        });
        let msg = `✈️ The best option for your query is **${b.airline}** on ${b.date ?? 'your chosen date'} — `
          + `departing ${b.departure ?? ''} and arriving ${b.arrival ?? ''}, `
          + `duration ${b.duration}, priced at **${price}**. `
          + `Confidence: ${Math.round((p.confidence ?? 0.85) * 100)}%.`;
        if (alts.length) msg += `\n\nAlternatives: ${alts.join(' · ')}.`;
        return msg;
      }

      // ── Try Gemini first ─────────────────────────────────────────────────────
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `You are a final synthesis engine for an AI agent.
Original Goal: ${p.goal}
Best Result: ${JSON.stringify(p.bestResult)}
Alternatives: ${JSON.stringify(p.alternatives)}
Confidence: ${p.confidence}

Rules:
1. REGION AWARENESS: Use correct currency symbol (₹ for India, $ for US). Use correct airline names.
2. Write a polished, human-readable answer starting with the best recommendation.
3. Include airline, price, duration, departure/arrival times.
4. Mention 1-2 alternatives.
5. Do NOT return JSON.

Return ONLY the human-readable text.`;
        try {
          const result = await model.generateContent(prompt);
          return {
            success: true,
            data: {
              finalAnswer: result.response.text(),
              source: 'llm',
              normalizedContextUsed: { bestResult: p.bestResult, alternatives: p.alternatives },
            }
          };
        } catch (err: any) {
          console.warn('[synthesizeFinalResponse] LLM unavailable, using local formatter:', err.message);
        }
      }

      // ── Local fallback ───────────────────────────────────────────────────────
      return {
        success: true,
        data: {
          finalAnswer: localFormat(),
          source: 'local',
          normalizedContextUsed: { bestResult: p.bestResult, alternatives: p.alternatives },
        }
      };
    }
  }
];

export function registerAllTools(registry: { register: (tool: Tool) => void }) {
  for (const tool of builtInTools) {
    registry.register(tool);
  }
}