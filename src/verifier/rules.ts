import { Verifier, VerificationResult } from '../types/index.js';

export interface Rule {
  name: string;
  check: (output: unknown) => boolean;
  message: string;
}

export class RuleVerifier {
  constructor(
    private rules: Rule[] = []
  ) {}

  addRule(rule: Rule): void {
    this.rules.push(rule);
  }

  async verify(_input: unknown, output: unknown): Promise<VerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of this.rules) {
      try {
        if (!rule.check(output)) {
          errors.push(rule.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Rule "${rule.name}" failed: ${message}`);
      }
    }

    return {
      verified: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: errors.length === 0 ? 0.8 : 0.4,
    };
  }
}

export const defaultRules: Rule[] = [
  {
    name: 'no_null_result',
    check: (output) => output !== null && output !== undefined,
    message: 'Output cannot be null or undefined',
  },
  {
    name: 'no_empty_object',
    check: (output) => {
      if (typeof output !== 'object' || output === null) return true;
      return Object.keys(output).length > 0;
    },
    message: 'Output object cannot be empty',
  },
];

export function createRuleVerifier(rules?: Rule[]): Verifier {
  return new RuleVerifier(rules ?? defaultRules);
}