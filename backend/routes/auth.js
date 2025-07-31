const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticateToken, blacklistToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const redis = require('../config/redis');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('businessName')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Business name must be between 2 and 255 characters'),
  body('businessType')
    .isIn(['restaurant', 'salon', 'retail', 'medical', 'automotive', 'professional services', 'hotel'])
    .withMessage('Please select a valid business type')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Generate JWT tokens
const generateTokens = (userId) => {
  const payload = { userId };
  
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
  
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  });
  
  return { accessToken, refreshToken };
};

// POST /api/auth/register
router.post('/register', registerValidation, asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { email, password, businessName, businessType } = req.body;

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (existingUser.rows.length > 0) {
    return res.status(409).json({
      error: 'User already exists',
      message: 'An account with this email address already exists'
    });
  }

  // Hash password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Set trial dates
  const trialDays = parseInt(process.env.TRIAL_DAYS) || 14;
  const trialStartDate = new Date();
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + trialDays);

  // Create user in transaction
  const result = await transaction(async (client) => {
    // Insert user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, business_name, business_type, 
                         subscription_tier, usage_limit, trial_start_date, trial_end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, business_name, business_type, subscription_tier, 
                 monthly_usage, usage_limit, trial_end_date, created_at`,
      [email, passwordHash, businessName, businessType, 'starter', 
       parseInt(process.env.TRIAL_USAGE_LIMIT) || 50, trialStartDate, trialEndDate]
    );

    const user = userResult.rows[0];

    // Default automation settings are created by trigger
    
    return user;
  });

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(result.id);

  // Store refresh token in Redis
  await redis.set(`refresh_token:${result.id}`, refreshToken, 30 * 24 * 60 * 60); // 30 days

  // Log successful registration
  logger.business('User registered', {
    userId: result.id,
    email: result.email,
    businessType: result.business_type,
    ip: req.ip
  });

  res.status(201).json({
    message: 'Account created successfully',
    user: {
      id: result.id,
      email: result.email,
      businessName: result.business_name,
      businessType: result.business_type,
      subscriptionTier: result.subscription_tier,
      monthlyUsage: result.monthly_usage,
      usageLimit: result.usage_limit,
      trialEndDate: result.trial_end_date,
      createdAt: result.created_at
    },
    tokens: {
      accessToken,
      refreshToken
    },
    trial: {
      isActive: true,
      daysRemaining: Math.ceil((new Date(result.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24)),
      usageRemaining: result.usage_limit - result.monthly_usage
    }
  });
}));

// POST /api/auth/login
router.post('/login', loginValidation, asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user
  const userResult = await query(
    `SELECT id, email, password_hash, business_name, business_type, 
            subscription_tier, monthly_usage, usage_limit, is_active,
            trial_start_date, trial_end_date, created_at
     FROM users 
     WHERE email = $1`,
    [email]
  );

  if (userResult.rows.length === 0) {
    logger.security('Failed login attempt - user not found', { email, ip: req.ip });
    return res.status(401).json({
      error: 'Invalid credentials',
      message: 'Email or password is incorrect'
    });
  }

  const user = userResult.rows[0];

  // Check if account is active
  if (!user.is_active) {
    logger.security('Login attempt on deactivated account', { 
      userId: user.id, 
      email: user.email, 
      ip: req.ip 
    });
    return res.status(403).json({
      error: 'Account deactivated',
      message: 'Your account has been deactivated. Please contact support.'
    });
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    logger.security('Failed login attempt - incorrect password', { 
      userId: user.id, 
      email: user.email, 
      ip: req.ip 
    });
    return res.status(401).json({
      error: 'Invalid credentials',
      message: 'Email or password is incorrect'
    });
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Store refresh token in Redis
  await redis.set(`refresh_token:${user.id}`, refreshToken, 30 * 24 * 60 * 60); // 30 days

  // Calculate trial status
  const isTrialActive = user.trial_end_date && new Date() < new Date(user.trial_end_date);
  const trialDaysRemaining = isTrialActive 
    ? Math.ceil((new Date(user.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24))
    : 0;

  // Log successful login
  logger.business('User logged in', {
    userId: user.id,
    email: user.email,
    ip: req.ip
  });

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      businessName: user.business_name,
      businessType: user.business_type,
      subscriptionTier: user.subscription_tier,
      monthlyUsage: user.monthly_usage,
      usageLimit: user.usage_limit,
      createdAt: user.created_at
    },
    tokens: {
      accessToken,
      refreshToken
    },
    trial: {
      isActive: isTrialActive,
      daysRemaining: trialDaysRemaining,
      usageRemaining: user.usage_limit - user.monthly_usage
    }
  });
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      error: 'Refresh token required',
      message: 'Please provide a refresh token'
    });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Check if refresh token exists in Redis
    const storedToken = await redis.get(`refresh_token:${decoded.userId}`);
    if (storedToken !== refreshToken) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'The refresh token is invalid or expired'
      });
    }

    // Verify user still exists and is active
    const userResult = await query(
      'SELECT id, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      return res.status(401).json({
        error: 'User not found',
        message: 'User account not found or deactivated'
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);

    // Update refresh token in Redis
    await redis.set(`refresh_token:${decoded.userId}`, newRefreshToken, 30 * 24 * 60 * 60);

    res.json({
      message: 'Tokens refreshed successfully',
      tokens: {
        accessToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'The refresh token is invalid or expired'
      });
    }
    throw error;
  }
}));

// POST /api/auth/logout
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  const { token } = req;
  const { refreshToken } = req.body;

  // Blacklist access token
  await blacklistToken(token);

  // Remove refresh token from Redis
  await redis.del(`refresh_token:${req.user.id}`);

  // If refresh token provided, blacklist it too
  if (refreshToken) {
    await blacklistToken(refreshToken);
  }

  logger.business('User logged out', {
    userId: req.user.id,
    email: req.user.email,
    ip: req.ip
  });

  res.json({
    message: 'Logout successful'
  });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { email } = req.body;

  // Check if user exists
  const userResult = await query(
    'SELECT id, email FROM users WHERE email = $1 AND is_active = true',
    [email]
  );

  // Always return success to prevent email enumeration
  if (userResult.rows.length === 0) {
    return res.json({
      message: 'If an account with this email exists, you will receive a password reset link.'
    });
  }

  const user = userResult.rows[0];

  // Generate reset token
  const resetToken = jwt.sign(
    { userId: user.id, purpose: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Store reset token in Redis with 1 hour expiration
  await redis.set(`password_reset:${user.id}`, resetToken, 3600);

  // TODO: Send email with reset link
  // await emailService.sendPasswordResetEmail(user.email, resetToken);

  logger.business('Password reset requested', {
    userId: user.id,
    email: user.email,
    ip: req.ip
  });

  res.json({
    message: 'If an account with this email exists, you will receive a password reset link.'
  });
}));

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { token, password } = req.body;

  try {
    // Verify reset token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'Invalid reset token'
      });
    }

    // Check if token exists in Redis
    const storedToken = await redis.get(`password_reset:${decoded.userId}`);
    if (storedToken !== token) {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'The reset token is invalid or has expired'
      });
    }

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, decoded.userId]
    );

    // Remove reset token from Redis
    await redis.del(`password_reset:${decoded.userId}`);

    // Invalidate all existing tokens for this user
    await redis.del(`refresh_token:${decoded.userId}`);

    logger.business('Password reset completed', {
      userId: decoded.userId,
      ip: req.ip
    });

    res.json({
      message: 'Password reset successful. Please log in with your new password.'
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'The reset token is invalid or has expired'
      });
    }
    throw error;
  }
}));

// GET /api/auth/me
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  
  // Get subscription status
  const subscriptionResult = await query(
    'SELECT status, current_period_end FROM subscriptions WHERE user_id = $1 AND status = $2',
    [user.id, 'active']
  );

  const hasActiveSubscription = subscriptionResult.rows.length > 0;
  const subscriptionEndDate = hasActiveSubscription ? subscriptionResult.rows[0].current_period_end : null;

  // Calculate trial status
  const isTrialActive = user.trial_end_date && new Date() < new Date(user.trial_end_date);
  const trialDaysRemaining = isTrialActive 
    ? Math.ceil((new Date(user.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24))
    : 0;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      businessName: user.business_name,
      businessType: user.business_type,
      subscriptionTier: user.subscription_tier,
      monthlyUsage: user.monthly_usage,
      usageLimit: user.usage_limit,
      createdAt: user.created_at
    },
    subscription: {
      isActive: hasActiveSubscription,
      endDate: subscriptionEndDate
    },
    trial: {
      isActive: isTrialActive,
      daysRemaining: trialDaysRemaining,
      usageRemaining: user.usage_limit - user.monthly_usage
    }
  });
}));

module.exports = router;
