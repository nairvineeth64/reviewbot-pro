const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection pool
let pool;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'reviewbot_pro',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in pool
  min: 2, // Minimum number of clients in pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection could not be established
  maxUses: 7500, // Close connection after 7500 queries
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Alternative: Use connection string if provided
if (process.env.DATABASE_URL) {
  dbConfig.connectionString = process.env.DATABASE_URL;
}

async function connectDB() {
  try {
    if (pool) {
      return pool;
    }

    pool = new Pool(dbConfig);

    // Test the connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connected successfully at:', result.rows[0].now);
    
    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client:', err);
    });

    pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    pool.on('remove', () => {
      logger.debug('Database connection removed from pool');
    });

    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

async function disconnectDB() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool has ended');
  }
}

// Execute a query with error handling
async function query(text, params = []) {
  const start = Date.now();
  
  try {
    if (!pool) {
      await connectDB();
    }
    
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Executed query:', {
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query error:', {
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      duration: `${duration}ms`,
      error: error.message
    });
    throw error;
  }
}

// Execute a transaction
async function transaction(callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Get a client from the pool for multiple queries
async function getClient() {
  if (!pool) {
    await connectDB();
  }
  return await pool.connect();
}

// Health check for database
async function healthCheck() {
  try {
    const result = await query('SELECT 1 as healthy');
    return result.rows[0].healthy === 1;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}

// Get database statistics
async function getStats() {
  try {
    const stats = {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingConnections: pool.waitingCount
    };
    return stats;
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    return null;
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  query,
  transaction,
  getClient,
  healthCheck,
  getStats,
  pool: () => pool
};
