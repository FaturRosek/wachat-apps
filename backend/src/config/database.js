const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    }
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'wachat_ai',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[PostgreSQL Error]: Unexpected error on idle client', err.message);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('[Database Query Error]:', { text, error: error.message });
    throw error;
  }
};

const getClient = async () => {
  const client = await pool.connect();
  return client;
};

const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW() AS current_time');
    console.log(`[PostgreSQL] Connected successfully at ${res.rows[0].current_time}`);
    return true;
  } catch (error) {
    console.warn(`[PostgreSQL Warning] Connection failed: ${error.message}`);
    return false;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection
};
