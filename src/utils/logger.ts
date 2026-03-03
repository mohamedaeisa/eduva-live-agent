
/**
 * EDUVA v6.5 System Logger
 * "God Mode" High-Fidelity Observability
 * 
 * v1.3: Added configurable log levels
 */

import { LOG_LEVEL } from '../constants';

type LogNamespace =
  | 'AI'
  | 'STATE'
  | 'DB'
  | 'USER'
  | 'MODULE'
  | 'ERROR'
  | 'ORCHESTRATOR'
  | 'TELEMETRY'
  | 'ATOMS'
  | 'NOTES'
  | 'QUIZ'
  | 'LIBRARY'
  | 'ASSEMBLER'
  | 'PDF'
  | 'INGESTION'
  | 'EXAM';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const colors: Record<LogNamespace, string> = {
  AI: '#a855f7',          // Purple
  STATE: '#3b82f6',       // Blue
  DB: '#f97316',          // Orange
  USER: '#22c55e',        // Green
  MODULE: '#eab308',      // Yellow
  ERROR: '#ef4444',       // Red
  ORCHESTRATOR: '#ec4899', // Pink
  TELEMETRY: '#06b6d4',   // Cyan
  ATOMS: '#6366f1',       // Indigo
  NOTES: '#64748b',       // Slate
  QUIZ: '#f43f5e',        // Rose
  LIBRARY: '#10b981',     // Emerald
  ASSEMBLER: '#0ea5e9',   // Sky
  PDF: '#be185d',         // Pink-700
  INGESTION: '#84cc16',   // Lime
  EXAM: '#8b5cf6'         // Violet
};

// Log level hierarchy
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * Check if a message should be logged based on current LOG_LEVEL
 */
const shouldLog = (messageLevel: LogLevel): boolean => {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[LOG_LEVEL];
};

export const logger = {
  log: (namespace: LogNamespace, message: string, data?: any, level: LogLevel = 'DEBUG') => {
    if (!shouldLog(level)) return;

    const color = colors[namespace];
    const timestamp = new Date().toLocaleTimeString();
    const levelPrefix = level !== 'DEBUG' ? `[${level}] ` : '';

    if (data !== undefined) {
      console.groupCollapsed(`%c[${timestamp}] ${levelPrefix}[${namespace}] ${message}`, `color: ${color}; font-weight: bold;`);
      console.log('Payload:', data);
      console.groupEnd();
    } else {
      console.log(
        `%c[${timestamp}] ${levelPrefix}[${namespace}] ${message}`,
        `color: ${color}; font-weight: bold;`
      );
    }
  },

  // Convenience wrappers with explicit levels
  debug: (namespace: LogNamespace, msg: string, data?: any) => logger.log(namespace, msg, data, 'DEBUG'),
  info: (namespace: LogNamespace, msg: string, data?: any) => logger.log(namespace, msg, data, 'INFO'),
  warn: (namespace: LogNamespace, msg: string, data?: any) => logger.log(namespace, '⚠️ ' + msg, data, 'WARN'),
  error: (namespace: LogNamespace, msg: string, data?: any) => logger.log(namespace, '❌ ' + msg, data, 'ERROR'),

  // Legacy convenience wrappers (auto DEBUG level)
  ai: (msg: string, data?: any) => logger.log('AI', msg, data, 'DEBUG'),
  state: (msg: string, data?: any) => logger.log('STATE', msg, data, 'DEBUG'),
  db: (msg: string, data?: any) => logger.log('DB', msg, data, 'DEBUG'),
  user: (msg: string, data?: any) => logger.log('USER', msg, data, 'DEBUG'),
  module: (msg: string, data?: any) => logger.log('MODULE', msg, data, 'DEBUG'),
  orchestrator: (msg: string, data?: any) => logger.log('ORCHESTRATOR', msg, data, 'DEBUG'),
  telemetry: (msg: string, data?: any) => logger.log('TELEMETRY', msg, data, 'DEBUG'),
  atoms: (msg: string, data?: any) => logger.log('ATOMS', msg, data, 'DEBUG'),
  notes: (msg: string, data?: any) => logger.log('NOTES', msg, data, 'DEBUG'),
  quiz: (msg: string, data?: any) => logger.log('QUIZ', msg, data, 'DEBUG'),
  library: (msg: string, data?: any) => logger.log('LIBRARY', msg, data, 'DEBUG'),
  assembler: (msg: string, data?: any) => logger.log('ASSEMBLER', msg, data, 'DEBUG'),
  pdf: (msg: string, data?: any) => logger.log('PDF', msg, data, 'DEBUG'),
  ingestion: (msg: string, data?: any) => logger.log('INGESTION', msg, data, 'DEBUG'),
  exam: (msg: string, data?: any) => logger.log('EXAM', msg, data, 'DEBUG'),
};
