import { z } from 'zod';
import { Verifier, VerificationResult } from '../types/index.js';

export class SchemaVerifier<T extends z.ZodType> {
  constructor(private schema: T) {}

  async verify(_input: unknown, output: unknown): Promise<VerificationResult> {
    const result = this.schema.safeParse(output);

    if (result.success) {
      return { verified: true, confidence: 0.9 };
    }

    return {
      verified: false,
      errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      confidence: 0.3,
    };
  }
}

export const planResultSchema = z.object({
  goal: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    objective: z.string(),
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
  })),
});

export const executionResultSchema = z.object({
  stepId: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  attempts: z.number(),
  durationMs: z.number(),
});

export const toolResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export function createSchemaVerifier<T extends z.ZodType>(schema: T): Verifier {
  return new SchemaVerifier(schema);
}