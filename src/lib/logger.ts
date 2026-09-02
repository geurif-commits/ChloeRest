/**
 * @file Logging Infrastructure
 * Structured logging with context support
 */

import { ILogEntry } from '../types/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDev = process.env.NODE_ENV === 'development';

  log(level: LogLevel, entry: Partial<Omit<ILogEntry, 'level' | 'timestamp'>>): void {
    const logEntry = {
      level,
      timestamp: new Date().toISOString(),
      context: entry.context ?? 'app',
      action: entry.action ?? 'LOG',
      ...entry,
    } as ILogEntry;

    const output = this.formatLog(logEntry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  private formatLog(entry: ILogEntry): string {
    if (this.isDev) {
      return JSON.stringify(entry, null, 2);
    }

    return JSON.stringify(entry);
  }

  debug(entry: Omit<ILogEntry, 'level' | 'timestamp'>): void {
    if (this.isDev) {
      this.log('debug', entry);
    }
  }

  info(entry: Omit<ILogEntry, 'level' | 'timestamp'>): void {
    this.log('info', entry);
  }

  warn(entry: Omit<ILogEntry, 'level' | 'timestamp'>): void {
    this.log('warn', entry);
  }

  error(entry: Omit<ILogEntry, 'level' | 'timestamp'>): void {
    this.log('error', entry);
  }
}

export const createLogger = (context: string) => {
  return {
    debug: (data: Omit<ILogEntry, 'level' | 'timestamp' | 'context'>) =>
      new Logger().debug({ context, ...data }),
    info: (data: Omit<ILogEntry, 'level' | 'timestamp' | 'context'>) =>
      new Logger().info({ context, ...data }),
    warn: (data: Omit<ILogEntry, 'level' | 'timestamp' | 'context'>) =>
      new Logger().warn({ context, ...data }),
    error: (data: Omit<ILogEntry, 'level' | 'timestamp' | 'context'>) =>
      new Logger().error({ context, ...data }),
  };
};

export default new Logger();
