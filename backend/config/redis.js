const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  family: 4, // 4 (IPv4) or 6 (IPv6)
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnFailover: 100,
  db: 0
};

// Use connection string if provided
if (process.env.REDIS_URL) {
  redisConfig.connectionString = process.env.REDIS_URL;
}

async function connectRedis() {
  try {
    if (redisClient && redisClient.status === 'ready') {
      return redisClient;
    }

    redisClient = new Redis(redisConfig);

    // Test the connection
    await redisClient.ping();
    logger.info('Redis connected successfully');

    // Handle connection events
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', (time) => {
      logger.info(`Redis reconnecting in ${time}ms`);
    });

    redisClient.on('end', () => {
      logger.warn('Redis connection ended');
    });

    return redisClient;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

// Cache operations
async function get(key) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis GET error:', error);
    return null;
  }
}

async function set(key, value, ttlSeconds = 3600) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const serializedValue = JSON.stringify(value);
    await redisClient.setex(key, ttlSeconds, serializedValue);
    return true;
  } catch (error) {
    logger.error('Redis SET error:', error);
    return false;
  }
}

async function del(key) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const result = await redisClient.del(key);
    return result === 1;
  } catch (error) {
    logger.error('Redis DEL error:', error);
    return false;
  }
}

async function exists(key) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Redis EXISTS error:', error);
    return false;
  }
}

async function expire(key, ttlSeconds) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const result = await redisClient.expire(key, ttlSeconds);
    return result === 1;
  } catch (error) {
    logger.error('Redis EXPIRE error:', error);
    return false;
  }
}

// Hash operations
async function hset(key, field, value) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const serializedValue = JSON.stringify(value);
    await redisClient.hset(key, field, serializedValue);
    return true;
  } catch (error) {
    logger.error('Redis HSET error:', error);
    return false;
  }
}

async function hget(key, field) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const value = await redisClient.hget(key, field);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis HGET error:', error);
    return null;
  }
}

async function hgetall(key) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const hash = await redisClient.hgetall(key);
    const result = {};
    for (const [field, value] of Object.entries(hash)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }
    return result;
  } catch (error) {
    logger.error('Redis HGETALL error:', error);
    return {};
  }
}

// List operations
async function lpush(key, ...values) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const serializedValues = values.map(v => JSON.stringify(v));
    return await redisClient.lpush(key, ...serializedValues);
  } catch (error) {
    logger.error('Redis LPUSH error:', error);
    return 0;
  }
}

async function rpop(key) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const value = await redisClient.rpop(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis RPOP error:', error);
    return null;
  }
}

// Session management
async function setSession(sessionId, data, ttlSeconds = 86400) { // 24 hours default
  return await set(`session:${sessionId}`, data, ttlSeconds);
}

async function getSession(sessionId) {
  return await get(`session:${sessionId}`);
}

async function deleteSession(sessionId) {
  return await del(`session:${sessionId}`);
}

// Rate limiting
async function incrementRateLimit(key, windowSeconds = 900, maxRequests = 100) {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    
    const multi = redisClient.multi();
    multi.incr(key);
    multi.expire(key, windowSeconds);
    const results = await multi.exec();
    
    const count = results[0][1];
    return {
      count,
      remaining: Math.max(0, maxRequests - count),
      resetTime: Date.now() + (windowSeconds * 1000),
      exceeded: count > maxRequests
    };
  } catch (error) {
    logger.error('Redis rate limit error:', error);
    return { count: 0, remaining: maxRequests, resetTime: Date.now(), exceeded: false };
  }
}

// Health check
async function healthCheck() {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

// Get Redis info
async function getInfo() {
  try {
    if (!redisClient) {
      await connectRedis();
    }
    const info = await redisClient.info();
    return info;
  } catch (error) {
    logger.error('Redis info error:', error);
    return null;
  }
}

module.exports = {
  connectRedis,
  disconnectRedis,
  get,
  set,
  del,
  exists,
  expire,
  hset,
  hget,
  hgetall,
  lpush,
  rpop,
  setSession,
  getSession,
  deleteSession,
  incrementRateLimit,
  healthCheck,
  getInfo,
  client: () => redisClient
};
