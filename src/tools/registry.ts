import { z } from 'zod';
import { Tool, ToolResult } from '../types/index.js';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
  }
}

export class DefaultTool implements Tool {
  constructor(
    public name: string,
    public description: string,
    public parameters: Tool['parameters'],
    private handler: (params: unknown) => Promise<ToolResult>,
    private paramType?: z.ZodSchema
  ) {}

  async execute(params: unknown): Promise<ToolResult> {
    const parsed = this.parameters.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid parameters: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      };
    }

    try {
      return await this.handler(parsed.data);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}