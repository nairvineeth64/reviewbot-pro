const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Define custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_FILE_PATH || './logs';

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: consoleFormat
  })
];

// Add file transports only if logging to file is enabled
if (process.env.LOG_FILE_ENABLED === 'true') {
  // Combined log file (all levels)
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
      level: 'debug'
    })
  );

  // Error log file (error level only)
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
      level: 'error'
    })
  );

  // HTTP log file (for API requests)
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '7d',
      format: fileFormat,
      level: 'http'
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: fileFormat,
  defaultMeta: {
    service: 'reviewbot-pro',
    environment: process.env.NODE_ENV || 'development'
  },
  transports,
  exitOnError: false
});

// Handle uncaught exceptions and rejections
if (process.env.LOG_FILE_ENABLED === 'true') {
  logger.exceptions.handle(
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat
    })
  );

  logger.rejections.handle(
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat
    })
  );
}

// Create stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Enhanced logging methods with additional context
logger.logWithContext = (level, message, context = {}) => {
  logger.log(level, message, {
    ...context,
    timestamp: new Date().toISOString(),
    pid: process.pid
  });
};

// API request logging
logger.apiRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userId: req.user?.id,
    contentLength: res.get('Content-Length')
  };

  const level = res.statusCode >= 400 ? 'warn' : 'http';
  logger.log(level, 'API Request', logData);
};

// Database query logging
logger.dbQuery = (query, duration, rowCount, error = null) => {
  const logData = {
    query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
    duration: `${duration}ms`,
    rowCount,
    error: error?.message
  };

  const level = error ? 'error' : 'debug';
  logger.log(level, 'Database Query', logData);
};

// External API call logging
logger.externalApi = (service, endpoint, method, statusCode, duration, error = null) => {
  const logData = {
    service,
    endpoint,
    method,
    statusCode,
    duration: `${duration}ms`,
    error: error?.message
  };

  const level = error || statusCode >= 400 ? 'warn' : 'debug';
  logger.log(level, 'External API Call', logData);
};

// Business logic logging
logger.business = (action, details, userId = null) => {
  const logData = {
    action,
    details,
    userId,
    timestamp: new Date().toISOString()
  };

  logger.info('Business Action', logData);
};

// Security event logging
logger.security = (event, details, ip = null, userId = null) => {
  const logData = {
    event,
    details,
    ip,
    userId,
    timestamp: new Date().toISOString(),
    severity: 'high'
  };

  logger.warn('Security Event', logData);
};

// Performance monitoring
logger.performance = (operation, duration, details = {}) => {
  const logData = {
    operation,
    duration: `${duration}ms`,
    ...details,
    timestamp: new Date().toISOString()
  };

  const level = duration > 5000 ? 'warn' : 'debug';
  logger.log(level, 'Performance', logData);
};

// Stripe webhook logging
logger.stripe = (event, processed, error = null) => {
  const logData = {
    eventType: event.type,
    eventId: event.id,
    processed,
    error: error?.message,
    timestamp: new Date().toISOString()
  };

  const level = error ? 'error' : 'info';
  logger.log(level, 'Stripe Webhook', logData);
};

// Background job logging
logger.job = (jobType, status, duration = null, error = null) => {
  const logData = {
    jobType,
    status,
    duration: duration ? `${duration}ms` : null,
    error: error?.message,
    timestamp: new Date().toISOString()
  };

  const level = error ? 'error' : 'info';
  logger.log(level, 'Background Job', logData);
};

module.exports = logger;
