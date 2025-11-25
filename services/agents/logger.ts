/**
 * Agent Logger
 * Professional logging system for all Stanse agents
 * Provides structured, timestamped logs with different levels
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type AgentName = 'NEWS' | 'PUBLISHING' | 'STANCE' | 'SENSE' | 'ORCHESTRATOR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  agent: AgentName;
  action: string;
  message: string;
  data?: any;
  duration?: number;
  error?: string;
}

// Colors for console output
const COLORS = {
  DEBUG: '\x1b[36m',   // Cyan
  INFO: '\x1b[32m',    // Green
  WARN: '\x1b[33m',    // Yellow
  ERROR: '\x1b[31m',   // Red
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
};

const AGENT_ICONS: Record<AgentName, string> = {
  NEWS: '📰',
  PUBLISHING: '📤',
  STANCE: '🎯',
  SENSE: '🔍',
  ORCHESTRATOR: '🎭',
};

/**
 * Format timestamp for logs
 */
const formatTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Format duration in human-readable form
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

/**
 * Create a log entry and output to console
 */
const log = (entry: LogEntry): void => {
  const icon = AGENT_ICONS[entry.agent];
  const color = COLORS[entry.level];
  const timestamp = COLORS.DIM + entry.timestamp + COLORS.RESET;
  const level = color + COLORS.BOLD + `[${entry.level}]` + COLORS.RESET;
  const agent = COLORS.BOLD + `[${icon} ${entry.agent}]` + COLORS.RESET;
  const action = color + entry.action + COLORS.RESET;

  let output = `${timestamp} ${level} ${agent} ${action}: ${entry.message}`;

  if (entry.duration !== undefined) {
    output += ` ${COLORS.DIM}(${formatDuration(entry.duration)})${COLORS.RESET}`;
  }

  console.log(output);

  // Log additional data if present
  if (entry.data && Object.keys(entry.data).length > 0) {
    console.log(`${COLORS.DIM}  └─ Data:${COLORS.RESET}`, JSON.stringify(entry.data, null, 2).split('\n').map((line, i) => i === 0 ? line : `     ${line}`).join('\n'));
  }

  // Log error details if present
  if (entry.error) {
    console.log(`${COLORS.ERROR}  └─ Error: ${entry.error}${COLORS.RESET}`);
  }
};

/**
 * Agent Logger Class
 * Use this to create loggers for specific agents
 */
export class AgentLogger {
  private agent: AgentName;
  private startTimes: Map<string, number> = new Map();

  constructor(agent: AgentName) {
    this.agent = agent;
  }

  /**
   * Start timing an operation
   */
  startTimer(operationId: string): void {
    this.startTimes.set(operationId, Date.now());
  }

  /**
   * Get elapsed time for an operation
   */
  getElapsed(operationId: string): number | undefined {
    const startTime = this.startTimes.get(operationId);
    if (startTime) {
      return Date.now() - startTime;
    }
    return undefined;
  }

  /**
   * End timing and get duration
   */
  endTimer(operationId: string): number | undefined {
    const duration = this.getElapsed(operationId);
    this.startTimes.delete(operationId);
    return duration;
  }

  debug(action: string, message: string, data?: any): void {
    log({
      timestamp: formatTimestamp(),
      level: 'DEBUG',
      agent: this.agent,
      action,
      message,
      data,
    });
  }

  info(action: string, message: string, data?: any, duration?: number): void {
    log({
      timestamp: formatTimestamp(),
      level: 'INFO',
      agent: this.agent,
      action,
      message,
      data,
      duration,
    });
  }

  warn(action: string, message: string, data?: any): void {
    log({
      timestamp: formatTimestamp(),
      level: 'WARN',
      agent: this.agent,
      action,
      message,
      data,
    });
  }

  error(action: string, message: string, error?: Error | string, data?: any): void {
    log({
      timestamp: formatTimestamp(),
      level: 'ERROR',
      agent: this.agent,
      action,
      message,
      data,
      error: error instanceof Error ? `${error.name}: ${error.message}` : error,
    });
  }

  /**
   * Log the start of an operation
   */
  operationStart(operation: string, details?: any): string {
    const operationId = `${operation}-${Date.now()}`;
    this.startTimer(operationId);
    this.info(operation, `Starting ${operation}`, details);
    return operationId;
  }

  /**
   * Log the successful completion of an operation
   */
  operationSuccess(operationId: string, operation: string, result?: any): void {
    const duration = this.endTimer(operationId);
    this.info(operation, `Completed ${operation} successfully`, result, duration);
  }

  /**
   * Log the failure of an operation
   */
  operationFailed(operationId: string, operation: string, error: Error | string, data?: any): void {
    const duration = this.endTimer(operationId);
    log({
      timestamp: formatTimestamp(),
      level: 'ERROR',
      agent: this.agent,
      action: operation,
      message: `Failed ${operation}`,
      data,
      duration,
      error: error instanceof Error ? `${error.name}: ${error.message}` : error,
    });
  }

  /**
   * Log a summary of processed items
   */
  summary(operation: string, stats: Record<string, number>): void {
    const statsStr = Object.entries(stats)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    this.info(operation, `Summary - ${statsStr}`);
  }
}

// Pre-configured loggers for each agent
export const newsLogger = new AgentLogger('NEWS');
export const publishingLogger = new AgentLogger('PUBLISHING');
export const stanceLogger = new AgentLogger('STANCE');
export const senseLogger = new AgentLogger('SENSE');
export const orchestratorLogger = new AgentLogger('ORCHESTRATOR');
