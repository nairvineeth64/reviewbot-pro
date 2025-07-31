const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Business type specific contexts
const businessContexts = {
  restaurant: {
    keywords: ['food', 'service', 'dining', 'meal', 'chef', 'menu', 'taste', 'atmosphere'],
    specialties: 'Focus on food quality, service speed, ambiance, and overall dining experience'
  },
  salon: {
    keywords: ['hair', 'styling', 'cut', 'color', 'treatment', 'stylist', 'appointment'],
    specialties: 'Emphasize expertise, cleanliness, professionalism, and customer satisfaction'
  },
  retail: {
    keywords: ['product', 'quality', 'price', 'staff', 'selection', 'store', 'shopping'],
    specialties: 'Focus on product quality, customer service, value, and shopping experience'
  },
  medical: {
    keywords: ['treatment', 'care', 'doctor', 'staff', 'appointment', 'professional', 'health'],
    specialties: 'Emphasize professionalism, care quality, staff expertise, and patient comfort'
  },
  automotive: {
    keywords: ['service', 'repair', 'mechanic', 'parts', 'vehicle', 'maintenance', 'quality'],
    specialties: 'Focus on technical expertise, reliability, honesty, and customer service'
  },
  'professional services': {
    keywords: ['service', 'expertise', 'professional', 'quality', 'communication', 'results'],
    specialties: 'Emphasize expertise, professionalism, results, and client satisfaction'
  },
  hotel: {
    keywords: ['stay', 'room', 'service', 'staff', 'amenities', 'location', 'experience'],
    specialties: 'Focus on comfort, service quality, amenities, and overall guest experience'
  }
};

// Tone-specific instructions
const toneInstructions = {
  professional: 'Use formal, business-appropriate language. Be courteous and maintain professional boundaries.',
  friendly: 'Use warm, conversational tone. Be personable while remaining appropriate.',
  apologetic: 'Express genuine remorse and commitment to improvement. Focus on making things right.',
  grateful: 'Express sincere appreciation and gratitude. Highlight positive aspects mentioned.',
  formal: 'Use very formal, traditional business language. Be respectful and conservative in tone.'
};

// Sentiment-based response strategies
const sentimentStrategies = {
  positive: {
    approach: 'Express gratitude, reinforce positive experience, encourage future visits',
    elements: ['thank the customer', 'highlight specific positive points', 'invite them back']
  },
  negative: {
    approach: 'Acknowledge concerns, apologize sincerely, offer resolution, invite direct contact',
    elements: ['acknowledge the issue', 'take responsibility', 'offer solution', 'provide contact info']
  },
  neutral: {
    approach: 'Thank for feedback, provide helpful information, encourage future engagement',
    elements: ['thank for feedback', 'provide additional value', 'invite future interaction']
  }
};

// Analyze sentiment of the review
async function analyzeSentiment(reviewText) {
  try {
    const prompt = `Analyze the sentiment of this review and return ONLY a JSON object with the following format:
{
  "sentiment": "positive|negative|neutral",
  "score": 0.85,
  "confidence": "high|medium|low",
  "key_emotions": ["satisfied", "disappointed", "etc"],
  "main_concerns": ["service", "quality", "etc"]
}

Review: "${reviewText}"`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a sentiment analysis expert. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    
    logger.debug('Sentiment analysis completed', {
      sentiment: analysis.sentiment,
      score: analysis.score,
      confidence: analysis.confidence
    });

    return analysis;
  } catch (error) {
    logger.error('Sentiment analysis failed:', error);
    
    // Fallback simple sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'awesome'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disappointed'];
    
    const text = reviewText.toLowerCase();
    const positiveCount = positiveWords.filter(word => text.includes(word)).length;
    const negativeCount = negativeWords.filter(word => text.includes(word)).length;
    
    let sentiment = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';
    
    return {
      sentiment,
      score: 0.5,
      confidence: 'low',
      key_emotions: [],
      main_concerns: []
    };
  }
}

// Generate multiple response options
async function generateResponses(reviewText, businessType, tone, businessName = 'our business') {
  try {
    const sentiment = await analyzeSentiment(reviewText);
    const businessContext = businessContexts[businessType] || businessContexts['professional services'];
    const toneInstruction = toneInstructions[tone] || toneInstructions.professional;
    const strategy = sentimentStrategies[sentiment.sentiment];

    const systemPrompt = `You are an expert at writing professional review responses for ${businessType} businesses. 

BUSINESS CONTEXT: ${businessContext.specialties}
TONE: ${toneInstruction}
STRATEGY: ${strategy.approach}

REQUIREMENTS:
- Generate exactly 3 different response options
- Each response should be 2-4 sentences long
- Include the business name: "${businessName}"
- Address specific points mentioned in the review
- ${strategy.elements.join(', ')}
- Make each response unique but appropriate
- Keep responses between 50-150 words each
- Use natural, human-like language
- Avoid generic templates

Return ONLY a JSON array with this exact format:
[
  {
    "response": "Response text here...",
    "length": 95,
    "key_points": ["point1", "point2"]
  },
  {
    "response": "Response text here...",
    "length": 87,
    "key_points": ["point1", "point2"]
  },
  {
    "response": "Response text here...",
    "length": 102,
    "key_points": ["point1", "point2"]
  }
]`;

    const userPrompt = `Original Review: "${reviewText}"

Business: ${businessName}
Business Type: ${businessType}
Requested Tone: ${tone}
Review Sentiment: ${sentiment.sentiment}`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const generatedResponses = JSON.parse(response.choices[0].message.content);
    
    // Validate and enhance the responses
    const enhancedResponses = generatedResponses.map((resp, index) => ({
      ...resp,
      id: index + 1,
      tone: tone,
      sentiment_addressed: sentiment.sentiment,
      estimated_reading_time: Math.ceil(resp.response.split(' ').length / 200) // words per minute
    }));

    logger.business('Review responses generated', {
      reviewLength: reviewText.length,
      businessType,
      tone,
      sentiment: sentiment.sentiment,
      responsesCount: enhancedResponses.length
    });

    return {
      responses: enhancedResponses,
      metadata: {
        originalReview: reviewText,
        businessType,
        tone,
        sentiment,
        generatedAt: new Date().toISOString(),
        model: process.env.OPENAI_MODEL || 'gpt-4'
      }
    };

  } catch (error) {
    logger.error('Response generation failed:', error);
    throw new Error('Failed to generate review responses. Please try again.');
  }
}

// Generate a single response for automation
async function generateSingleResponse(reviewText, businessType, tone, businessName) {
  try {
    const result = await generateResponses(reviewText, businessType, tone, businessName);
    
    // Return the first response for automation
    return {
      response: result.responses[0].response,
      sentiment: result.metadata.sentiment,
      metadata: result.metadata
    };
  } catch (error) {
    logger.error('Single response generation failed:', error);
    throw error;
  }
}

// Validate OpenAI API connection
async function validateConnection() {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 5
    });
    
    logger.info('OpenAI connection validated successfully');
    return true;
  } catch (error) {
    logger.error('OpenAI connection validation failed:', error);
    return false;
  }
}

// Get usage statistics (if available in API)
async function getUsageStats() {
  try {
    // Note: OpenAI doesn't provide usage stats through the API currently
    // This is a placeholder for future implementation
    return {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0
    };
  } catch (error) {
    logger.error('Failed to get OpenAI usage stats:', error);
    return null;
  }
}

// Batch process multiple reviews
async function batchGenerateResponses(reviews, businessType, tone, businessName) {
  const results = [];
  const errors = [];

  for (const review of reviews) {
    try {
      const result = await generateSingleResponse(
        review.text,
        businessType,
        tone,
        businessName
      );
      
      results.push({
        reviewId: review.id,
        ...result
      });
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      errors.push({
        reviewId: review.id,
        error: error.message
      });
    }
  }

  return { results, errors };
}

module.exports = {
  generateResponses,
  generateSingleResponse,
  analyzeSentiment,
  validateConnection,
  getUsageStats,
  batchGenerateResponses,
  businessContexts,
  toneInstructions
};
