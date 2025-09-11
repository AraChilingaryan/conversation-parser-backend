import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}

interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    meta?: any;
}

class Logger {
    private logLevel: LogLevel;
    private logDirectory: string;

    constructor() {
        this.logLevel = this.parseLogLevel(process.env['LOG_LEVEL'] || 'info');
        this.logDirectory = join(process.cwd(), 'logs');

        // Create logs directory if it doesn't exist
        if (!existsSync(this.logDirectory)) {
            mkdirSync(this.logDirectory, { recursive: true });
        }
    }

    private parseLogLevel(level: string): LogLevel {
        switch (level.toLowerCase()) {
            case 'error': return LogLevel.ERROR;
            case 'warn': return LogLevel.WARN;
            case 'info': return LogLevel.INFO;
            case 'debug': return LogLevel.DEBUG;
            default: return LogLevel.INFO;
        }
    }

    private formatLogEntry(level: string, message: string, meta?: any): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message,
            ...(meta && { meta })
        };
    }

    private writeLog(logEntry: LogEntry): void {
        const logLine = JSON.stringify(logEntry) + '\n';

        // Console output with colors
        const colors = {
            ERROR: '\x1b[31m',  // Red
            WARN: '\x1b[33m',   // Yellow
            INFO: '\x1b[36m',   // Cyan
            DEBUG: '\x1b[90m',  // Gray
            RESET: '\x1b[0m'
        };

        const color = colors[logEntry.level as keyof typeof colors] || colors.RESET;
        const consoleMessage = `${color}[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}${colors.RESET}`;

        if (logEntry.meta) {
            console.log(consoleMessage, logEntry.meta);
        } else {
            console.log(consoleMessage);
        }

        // File output (in production)
        if (process.env['NODE_ENV'] === 'production') {
            const logFile = join(this.logDirectory, `app-${new Date().toISOString().split('T')[0]}.log`);
            const stream = createWriteStream(logFile, { flags: 'a' });
            stream.write(logLine);
            stream.end();
        }
    }

    error(message: string, meta?: any, p0?: { fromNumber: string; toNumber: string; callSid: string; }): void {
        if (this.logLevel >= LogLevel.ERROR) {
            this.writeLog(this.formatLogEntry('error', message, meta));
        }
    }

    warn(message: string, meta?: any): void {
        if (this.logLevel >= LogLevel.WARN) {
            this.writeLog(this.formatLogEntry('warn', message, meta));
        }
    }

    info(message: string, meta?: any): void {
        if (this.logLevel >= LogLevel.INFO) {
            this.writeLog(this.formatLogEntry('info', message, meta));
        }
    }

    debug(message: string, meta?: any): void {
        if (this.logLevel >= LogLevel.DEBUG) {
            this.writeLog(this.formatLogEntry('debug', message, meta));
        }
    }
}

export const logger = new Logger();
