const logger = require('../utils/logger');

// Custom error class for API errors
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Handle different types of errors
const handleDatabaseError = (error) => {
  logger.error('Database error:', error);
  
  // PostgreSQL specific error codes
  switch (error.code) {
    case '23505': // Unique constraint violation
      return new ApiError(409, 'A record with this information already exists');
    case '23503': // Foreign key constraint violation
      return new ApiError(400, 'Invalid reference to related data');
    case '23502': // Not null constraint violation
      return new ApiError(400, 'Required field is missing');
    case '42P01': // Undefined table
      return new ApiError(500, 'Database configuration error');
    case '42703': // Undefined column
      return new ApiError(500, 'Database schema error');
    case '28P01': // Invalid password
    case '28000': // Invalid authorization
      return new ApiError(500, 'Database connection error');
    case '3D000': // Invalid catalog name
      return new ApiError(500, 'Database not found');
    default:
      return new ApiError(500, 'Database operation failed');
  }
};

const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new ApiError(401, 'Invalid authentication token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return new ApiError(401, 'Authentication token has expired');
  }
  
  if (error.name === 'NotBeforeError') {
    return new ApiError(401, 'Token not active yet');
  }
  
  return new ApiError(401, 'Authentication failed');
};

const handleValidationError = (error) => {
  if (error.isJoi) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
    
    return new ApiError(400, 'Validation failed', true, JSON.stringify(details));
  }
  
  return new ApiError(400, 'Invalid input data');
};

const handleStripeError = (error) => {
  logger.error('Stripe error:', error);
  
  switch (error.type) {
    case 'StripeCardError':
      return new ApiError(402, error.message || 'Payment failed');
    case 'StripeRateLimitError':
      return new ApiError(429, 'Too many requests to payment processor');
    case 'StripeInvalidRequestError':
      return new ApiError(400, 'Invalid payment request');
    case 'StripeAPIError':
      return new ApiError(502, 'Payment processor error');
    case 'StripeConnectionError':
      return new ApiError(503, 'Payment processor unavailable');
    case 'StripeAuthenticationError':
      return new ApiError(500, 'Payment configuration error');
    default:
      return new ApiError(500, 'Payment processing failed');
  }
};

const handleOpenAIError = (error) => {
  logger.error('OpenAI error:', error);
  
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.error?.message || 'AI service error';
    
    switch (status) {
      case 400:
        return new ApiError(400, 'Invalid request to AI service');
      case 401:
        return new ApiError(500, 'AI service authentication failed');
      case 429:
        return new ApiError(429, 'AI service rate limit exceeded');
      case 500:
        return new ApiError(502, 'AI service is currently unavailable');
      default:
        return new ApiError(502, message);
    }
  }
  
  return new ApiError(502, 'AI service communication failed');
};

const handleMulterError = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new ApiError(413, 'File size exceeds the allowed limit');
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return new ApiError(400, 'Too many files uploaded');
  }
  
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new ApiError(400, 'Unexpected file field');
  }
  
  return new ApiError(400, 'File upload failed');
};

// Convert operational errors to ApiError
const handleError = (error) => {
  let convertedError = error;
  
  // Database errors
  if (error.code && typeof error.code === 'string') {
    convertedError = handleDatabaseError(error);
  }
  // JWT errors
  else if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
    convertedError = handleJWTError(error);
  }
  // Validation errors
  else if (error.isJoi || error.name === 'ValidationError') {
    convertedError = handleValidationError(error);
  }
  // Stripe errors
  else if (error.type && error.type.startsWith('Stripe')) {
    convertedError = handleStripeError(error);
  }
  // OpenAI errors
  else if (error.response && error.config && error.config.url && error.config.url.includes('openai')) {
    convertedError = handleOpenAIError(error);
  }
  // Multer errors
  else if (error.code && ['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) {
    convertedError = handleMulterError(error);
  }
  // Generic errors
  else if (!(error instanceof ApiError)) {
    convertedError = new ApiError(500, 'Internal server error');
  }
  
  return convertedError;
};

// Main error handling middleware
const errorHandler = (error, req, res, next) => {
  const convertedError = handleError(error);
  
  // Log the error
  const errorLog = {
    message: convertedError.message,
    statusCode: convertedError.statusCode,
    stack: convertedError.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };
  
  // Log based on severity
  if (convertedError.statusCode >= 500) {
    logger.error('Server error:', errorLog);
  } else if (convertedError.statusCode >= 400) {
    logger.warn('Client error:', errorLog);
  }
  
  // Prepare error response
  const errorResponse = {
    error: convertedError.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };
  
  // Add additional details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = convertedError.stack;
    errorResponse.details = error.details || null;
  }
  
  // Add request ID if available
  if (req.id) {
    errorResponse.requestId = req.id;
  }
  
  // Send error response
  res.status(convertedError.statusCode).json(errorResponse);
};

// Async error wrapper for route handlers
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for unmatched routes
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`);
  next(error);
};

module.exports = {
  ApiError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  handleDatabaseError,
  handleJWTError,
  handleValidationError,
  handleStripeError,
  handleOpenAIError
};
