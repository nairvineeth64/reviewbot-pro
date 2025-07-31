# ReviewBot Pro - AI-Powered Review Response Generator

![ReviewBot Pro Logo](https://via.placeholder.com/600x200/4338ca/ffffff?text=ReviewBot+Pro)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![GitHub Stars](https://img.shields.io/github/stars/nairvineeth64/reviewbot-pro?style=social)](https://github.com/nairvineeth64/reviewbot-pro)

## 🚀 Overview

ReviewBot Pro is a comprehensive AI-powered SaaS application that helps small businesses automatically generate professional responses to customer reviews across multiple platforms including Google My Business, Yelp, Facebook, and more. 

**Target Market**: Small businesses who spend 30+ minutes daily writing review responses manually.

### 🎯 Key Features

- **AI-Powered Response Generation**: Generate 3 different professional response options using GPT-4
- **Multi-Platform Integration**: Connect Google My Business and Yelp Business APIs
- **Automated Review Monitoring**: Check for new reviews every 15 minutes
- **Smart Automation**: Auto-respond to positive reviews, human-in-the-loop for negative reviews
- **Sentiment Analysis**: AI-powered sentiment categorization (positive, negative, neutral)
- **Multiple Business Types**: Restaurant, salon, retail, medical, automotive, professional services, hotel
- **Flexible Tones**: Professional, friendly, apologetic, grateful, formal
- **Usage Analytics**: Track monthly usage, response history, and automation metrics
- **Subscription Billing**: Stripe integration with 3 pricing tiers and 14-day free trial

## 📋 Table of Contents

- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## 🛠 Technology Stack

### Backend
- **Node.js** with Express.js framework
- **PostgreSQL** database with connection pooling
- **Redis** for caching and session management
- **Bull** for background job processing
- **OpenAI GPT-4** for response generation
- **Stripe** for subscription billing
- **JWT** authentication with refresh tokens
- **bcrypt** for password hashing
- **Winston** for comprehensive logging

### Frontend (Planned)
- **React** with modern hooks
- **Tailwind CSS** for styling
- **Axios** for API communication
- **React Router** for navigation
- **Context API** for state management

### External Integrations
- **Google My Business API** for review monitoring
- **Yelp Fusion API** for review monitoring
- **OpenAI API** for AI response generation
- **Stripe API** for payment processing
- **Nodemailer** for email notifications

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend │    │  Express Backend │    │   PostgreSQL    │
│                 │◄───┤                 │◄───┤    Database     │
│  - Landing Page │    │  - Authentication│    │                 │
│  - Dashboard    │    │  - API Routes   │    │  - Users        │
│  - Automation   │    │  - Middleware   │    │  - Reviews      │
└─────────────────┘    └─────────────────┘    │  - Responses    │
                                               └─────────────────┘
         │                       │
         │              ┌─────────────────┐
         │              │      Redis      │
         └──────────────┤                 │
                        │  - Sessions     │
                        │  - Rate Limiting│
                        │  - Job Queue    │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │ Background Jobs │
                        │                 │
                        │ - Review Sync   │
                        │ - Auto Response │
                        │ - Email Alerts  │
                        └─────────────────┘
```

## 📦 Prerequisites

Before installing ReviewBot Pro, ensure you have the following:

- **Node.js** (v18.0.0 or higher)
- **PostgreSQL** (v13 or higher)
- **Redis** (v6 or higher)
- **Git** for version control

### Required API Keys

1. **OpenAI API Key** - [Get here](https://platform.openai.com/api-keys)
2. **Stripe Keys** - [Get here](https://dashboard.stripe.com/apikeys)
3. **Google Cloud Console** - For Google My Business API
4. **Yelp Developer Account** - For Yelp Fusion API

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/nairvineeth64/reviewbot-pro.git
cd reviewbot-pro
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies (when ready)

```bash
cd ../frontend
npm install
```

## ⚙️ Configuration

### 1. Environment Variables

Copy the example environment file and configure your settings:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/reviewbot_pro
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reviewbot_pro
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Server Configuration
PORT=5000
NODE_ENV=development
API_BASE_URL=http://localhost:5000

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRES_IN=30d

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=1000

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# Google OAuth & My Business API
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Yelp API Configuration
YELP_API_KEY=your-yelp-api-key

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Email Configuration
EMAIL_FROM=noreply@reviewbotpro.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

## 🗄️ Database Setup

### 1. Create PostgreSQL Database

```sql
CREATE DATABASE reviewbot_pro;
CREATE USER reviewbot_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE reviewbot_pro TO reviewbot_user;
```

### 2. Run Database Migrations

```bash
cd backend
npm run migrate
```

This will execute the schema from `database/schema.sql` and create all necessary tables.

### 3. Seed Database (Optional)

```bash
npm run seed
```

## 🏃‍♂️ Running the Application

### Development Mode

1. **Start Redis Server**
```bash
redis-server
```

2. **Start PostgreSQL Service**
```bash
# On macOS with Homebrew
brew services start postgresql

# On Ubuntu/Debian
sudo systemctl start postgresql

# On Windows
# Start from Services or pgAdmin
```

3. **Start Backend Development Server**
```bash
cd backend
npm run dev
```

4. **Start Background Worker**
```bash
cd backend
npm run worker
```

5. **Start Frontend Development Server** (when ready)
```bash
cd frontend
npm start
```

### Production Mode

```bash
cd backend
npm start
```

## 📡 API Documentation

### Authentication Endpoints

#### POST `/api/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "businessName": "My Business",
  "businessType": "restaurant"
}
```

**Response:**
```json
{
  "message": "Account created successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "businessName": "My Business",
    "businessType": "restaurant",
    "subscriptionTier": "starter"
  },
  "tokens": {
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token"
  },
  "trial": {
    "isActive": true,
    "daysRemaining": 14,
    "usageRemaining": 50
  }
}
```

#### POST `/api/auth/login`
Authenticate user and get access tokens.

#### POST `/api/auth/logout`
Logout user and invalidate tokens.

#### POST `/api/auth/refresh`
Refresh access token using refresh token.

### Response Generation Endpoints

#### POST `/api/responses`
Generate AI-powered review responses.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "reviewText": "Great food and excellent service! Will definitely come back.",
  "businessType": "restaurant",
  "tone": "grateful"
}
```

**Response:**
```json
{
  "message": "Review responses generated successfully",
  "responses": [
    {
      "id": 1,
      "response": "Thank you so much for your wonderful feedback! We're thrilled that you enjoyed both our food and service. We can't wait to welcome you back to My Restaurant soon!",
      "length": 156,
      "tone": "grateful",
      "sentiment_addressed": "positive",
      "key_points": ["food quality", "service", "return visit"]
    }
  ],
  "metadata": {
    "reviewId": "uuid",
    "sentiment": {
      "sentiment": "positive",
      "score": 0.95,
      "confidence": "high"
    }
  }
}
```

### Subscription Management

#### POST `/api/stripe/create-checkout-session`
Create Stripe checkout session for subscription.

#### POST `/api/stripe/webhook`
Handle Stripe webhooks for subscription updates.

### Platform Integration

#### POST `/api/platforms/connect-google`
Connect Google My Business account.

#### POST `/api/platforms/connect-yelp`
Connect Yelp Business account.

#### GET `/api/reviews/pending`
Get pending reviews requiring human approval.

## 🚀 Deployment

### Using Docker (Recommended)

```dockerfile
# Dockerfile for backend
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

### Deploy to Cloud Platforms

#### Heroku
```bash
# Add PostgreSQL and Redis add-ons
heroku addons:create heroku-postgresql:hobby-dev
heroku addons:create heroku-redis:hobby-dev

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set OPENAI_API_KEY=your_key
# ... other env vars

# Deploy
git push heroku main
```

#### AWS, DigitalOcean, or VPS
1. Set up PostgreSQL and Redis instances
2. Configure environment variables
3. Set up SSL certificates
4. Configure reverse proxy (Nginx)
5. Set up process manager (PM2)

## 💳 Subscription Tiers

### Starter - $29/month
- 100 manual response generations
- Basic sentiment analysis
- Email support
- 14-day free trial

### Professional - $49/month
- 500 response generations
- Basic automation (positive reviews only)
- Platform integrations
- Priority support

### Business - $99/month
- Unlimited response generations
- Full automation with custom rules
- Human-in-the-loop for negative reviews
- Advanced analytics
- Phone support

## 📊 Features in Detail

### AI Response Generation
- **Multiple Options**: Generate 3 different response variations
- **Business Context**: Tailored responses based on business type
- **Tone Control**: Choose from 5 different response tones
- **Sentiment Awareness**: Responses adapt to review sentiment

### Automation Engine
- **Smart Scheduling**: Respect business hours and response delays
- **Approval Workflow**: Human oversight for negative reviews
- **Custom Rules**: Set up business-specific automation rules
- **Rate Limiting**: Respect platform API limits

### Platform Integrations
- **Google My Business**: Monitor and respond to Google reviews
- **Yelp Business**: Monitor and respond to Yelp reviews
- **Facebook** (coming soon): Business page review monitoring
- **TripAdvisor** (coming soon): Hotel and restaurant reviews

### Analytics Dashboard
- **Usage Tracking**: Monitor monthly response generation usage
- **Response History**: View all generated and posted responses
- **Sentiment Trends**: Track review sentiment over time
- **Platform Performance**: Compare response rates across platforms

## 🔒 Security Features

- **JWT Authentication** with refresh tokens
- **Password Hashing** using bcrypt with salt rounds
- **Rate Limiting** to prevent abuse
- **Input Sanitization** and validation
- **CORS Configuration** for secure cross-origin requests
- **Helmet.js** for security headers
- **Encrypted API Credentials** stored in database

## 🧪 Testing

```bash
# Run backend tests
cd backend
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## 📈 Monitoring and Logging

### Winston Logging
- **Multiple Log Levels**: error, warn, info, http, debug
- **File Rotation**: Daily log rotation with compression
- **Structured Logging**: JSON format for easy parsing
- **Performance Monitoring**: Track API response times

### Health Checks
- **Database Connection**: Monitor PostgreSQL health
- **Redis Connection**: Monitor cache availability
- **External APIs**: Monitor OpenAI and platform API status

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes.

## 🆘 Support

- **Documentation**: [Full API Documentation](https://docs.reviewbotpro.com)
- **Community**: [Discord Server](https://discord.gg/reviewbotpro)
- **Email Support**: support@reviewbotpro.com
- **Business Hours**: Monday-Friday, 9 AM - 6 PM EST

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for providing the GPT-4 API
- **Stripe** for seamless payment processing
- **Google** and **Yelp** for their review APIs
- **Node.js Community** for excellent open-source packages

---

**Built with ❤️ by the ReviewBot Pro Team**

[Website](https://reviewbotpro.com) • [Documentation](https://docs.reviewbotpro.com) • [Support](mailto:support@reviewbotpro.com)
