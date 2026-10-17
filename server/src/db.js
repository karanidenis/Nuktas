const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

/**
 * Run a parameterised query. Returns the full pg Result.
 * @param {string} text
 * @param {any[]} [params]
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    const ms = Date.now() - start;
    if (ms > 200) console.warn(`Slow query (${ms}ms):`, text.slice(0, 80));
  }
  return result;
}

/**
 * Acquire a client for transactions.
 */
function getClient() {
  return pool.connect();
}

module.exports = { query, getClient };
