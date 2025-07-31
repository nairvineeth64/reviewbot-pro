const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, incrementUsage, checkUsageLimit } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const openaiService = require('../services/openaiService');

const router = express.Router();

// Validation rules
const responseValidation = [
  body('reviewText')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Review text must be between 10 and 2000 characters'),
  body('businessType')
    .isIn(['restaurant', 'salon', 'retail', 'medical', 'automotive', 'professional services', 'hotel'])
    .withMessage('Please select a valid business type'),
  body('tone')
    .isIn(['professional', 'friendly', 'apologetic', 'grateful', 'formal'])
    .withMessage('Please select a valid tone')
];

// POST /api/responses
router.post('/', authenticateToken, checkUsageLimit, responseValidation, asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { reviewText, businessType, tone } = req.body;
  const businessName = req.user.business_name;

  // Generate responses
  const responseResult = await openaiService.generateResponses(reviewText, businessType, tone, businessName);

  // Persist responses to database
  const insertResult = await query(
    `INSERT INTO generated_responses (user_id, original_review, business_type, tone, 
                                      generated_responses_json, response_status, auto_generated)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [req.user.id, reviewText, businessType, tone, JSON.stringify(responseResult.responses), 'pending', false]
  );

  const responseRecord = insertResult.rows[0];

  // Increment user usage
  await incrementUsage(req, res, () => {});

  // Log successful response generation
  logger.business('Review responses generated successfully', {
    userId: req.user.id,
    reviewId: responseRecord.id,
    businessType,
    tone,
    responseCount: responseResult.responses.length,
    sentiment: responseResult.metadata.sentiment
  });

  res.status(201).json({
    message: 'Review responses generated successfully',
    responses: responseResult.responses,
    metadata: {
      reviewId: responseRecord.id,
      createdAt: responseRecord.created_at,
      sentiment: responseResult.metadata.sentiment
    }
  });
}));


module.exports = router;

