type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  timestamp?: boolean;
  pretty?: boolean;
}

export class Logger {
  constructor(
    private options: LogOptions = { timestamp: true, pretty: true }
  ) {}

  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];
    if (this.options.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    if (this.options.pretty) {
      parts.push(`[${level.toUpperCase()}]`);
    }
    parts.push(message);
    return parts.join(' ');
  }

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.debug(this.formatMessage('debug', message));
    }
  }

  info(message: string): void {
    console.info(this.formatMessage('info', message));
  }

  warn(message: string): void {
    console.warn(this.formatMessage('warn', message));
  }

  error(message: string, error?: Error): void {
    const fullMessage = error ? `${message}: ${error.message}` : message;
    console.error(this.formatMessage('error', fullMessage));
  }
}

export const logger = new Logger();