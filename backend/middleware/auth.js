const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const redis = require('../config/redis');

// Middleware to authenticate JWT tokens
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid access token'
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is blacklisted (for logout functionality)
    const isBlacklisted = await redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        error: 'Token invalidated',
        message: 'This token has been invalidated'
      });
    }

    // Fetch fresh user data from database
    const userResult = await query(
      `SELECT id, email, business_name, business_type, subscription_tier, 
              monthly_usage, usage_limit, is_active, trial_end_date,
              created_at, updated_at
       FROM users 
       WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'User not found',
        message: 'User account not found or deactivated'
      });
    }

    const user = userResult.rows[0];

    // Check if trial has expired
    if (user.trial_end_date && new Date() > new Date(user.trial_end_date)) {
      // Check if user has active subscription
      const subscriptionResult = await query(
        `SELECT status FROM subscriptions 
         WHERE user_id = $1 AND status = 'active'`,
        [user.id]
      );

      if (subscriptionResult.rows.length === 0) {
        return res.status(402).json({
          error: 'Subscription required',
          message: 'Your trial has expired. Please upgrade to continue using ReviewBot Pro.',
          code: 'TRIAL_EXPIRED'
        });
      }
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    
    // Log successful authentication
    logger.debug('User authenticated', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'The provided token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    logger.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      message: 'Internal server error during authentication'
    });
  }
};

// Middleware to check subscription tier
const requireSubscription = (requiredTiers = []) => {
  return (req, res, next) => {
    const userTier = req.user.subscription_tier;
    
    if (!requiredTiers.includes(userTier)) {
      return res.status(403).json({
        error: 'Insufficient subscription',
        message: `This feature requires a ${requiredTiers.join(' or ')} subscription`,
        currentTier: userTier,
        requiredTiers
      });
    }
    
    next();
  };
};

// Middleware to check usage limits
const checkUsageLimit = async (req, res, next) => {
  try {
    const { monthly_usage, usage_limit } = req.user;
    
    if (monthly_usage >= usage_limit) {
      return res.status(429).json({
        error: 'Usage limit exceeded',
        message: 'You have reached your monthly usage limit. Please upgrade your plan or wait for the next billing cycle.',
        currentUsage: monthly_usage,
        limit: usage_limit,
        code: 'USAGE_LIMIT_EXCEEDED'
      });
    }
    
    next();
  } catch (error) {
    logger.error('Usage limit check error:', error);
    return res.status(500).json({
      error: 'Usage check failed',
      message: 'Failed to verify usage limits'
    });
  }
};

// Middleware for optional authentication (user may or may not be logged in)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is blacklisted
    const isBlacklisted = await redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      req.user = null;
      return next();
    }

    // Fetch user data
    const userResult = await query(
      `SELECT id, email, business_name, business_type, subscription_tier, 
              monthly_usage, usage_limit, is_active
       FROM users 
       WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    req.user = userResult.rows.length > 0 ? userResult.rows[0] : null;
    req.token = token;
    
    next();
  } catch (error) {
    // If there's an error with the token, just continue without user
    req.user = null;
    next();
  }
};

// Middleware to validate API key for external integrations
const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Please provide a valid API key'
      });
    }

    // In a real implementation, you'd store API keys in the database
    // For now, we'll use a simple validation
    const userResult = await query(
      `SELECT id, email, business_name, subscription_tier 
       FROM users 
       WHERE api_key = $1 AND is_active = true`,
      [apiKey]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid'
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    logger.error('API key validation error:', error);
    return res.status(500).json({
      error: 'API key validation failed',
      message: 'Internal server error during API key validation'
    });
  }
};

// Middleware to blacklist tokens (for logout)
const blacklistToken = async (token, expiresIn = '7d') => {
  try {
    // Calculate TTL based on token expiration
    const ttlSeconds = jwt.decode(token).exp - Math.floor(Date.now() / 1000);
    
    if (ttlSeconds > 0) {
      await redis.set(`blacklist:${token}`, true, ttlSeconds);
    }
    
    return true;
  } catch (error) {
    logger.error('Token blacklist error:', error);
    return false;
  }
};

// Middleware for role-based access (if you implement roles later)
const requireRole = (roles = []) => {
  return (req, res, next) => {
    const userRole = req.user.role || 'user';
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'You do not have permission to access this resource',
        requiredRoles: roles
      });
    }
    
    next();
  };
};

// Middleware to increment user usage
const incrementUsage = async (req, res, next) => {
  try {
    await query(
      'UPDATE users SET monthly_usage = monthly_usage + 1 WHERE id = $1',
      [req.user.id]
    );
    
    // Update the user object
    req.user.monthly_usage += 1;
    
    next();
  } catch (error) {
    logger.error('Usage increment error:', error);
    // Don't fail the request, just log the error
    next();
  }
};

module.exports = {
  authenticateToken,
  requireSubscription,
  checkUsageLimit,
  optionalAuth,
  validateApiKey,
  blacklistToken,
  requireRole,
  incrementUsage
};
