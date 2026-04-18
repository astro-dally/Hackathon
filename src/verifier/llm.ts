import { Verifier, VerificationResult } from '../types/index.js';
import { genAI } from '../planner/client.js';

export interface LLMVerifierConfig {
  model?: string;
  criteria?: string[];
}

export class LLMVerifier {
  constructor(
    private config: LLMVerifierConfig = {}
  ) {}

  async verify(input: unknown, output: unknown): Promise<VerificationResult> {
    const criteria = this.config.criteria ?? [
      'Output is not null or undefined',
      'Output contains meaningful data',
      'Output is properly formatted',
      'No errors in the output',
    ];

    const prompt = `Verify the following output against these criteria:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Input: ${JSON.stringify(input)}
Output: ${JSON.stringify(output)}

Return JSON:
{
  "verified": boolean,
  "issues": string[] (empty if verified)
}`;

    try {
      const model = genAI.getGenerativeModel({ model: this.config.model || 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text().trim();

      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        return { verified: false, errors: ['Could not parse verification result'], confidence: 0.2 };
      }

      const parsed = JSON.parse(match[0]);

      return {
        verified: parsed.verified ?? false,
        errors: parsed.issues?.length > 0 ? parsed.issues : undefined,
        metadata: { rawResponse: text },
        confidence: parsed.verified ? 0.8 : 0.4,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { verified: false, errors: [`LLM verification failed: ${message}`], confidence: 0.1 };
    }
  }
}

export function createLLMVerifier(config?: LLMVerifierConfig): Verifier {
  return new LLMVerifier(config);
}