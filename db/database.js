const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.internal')
    ? false
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
});

async function query(text, params) {
  let retries = 3;
  while (retries > 0) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      console.warn(`[DB] Tentando reconectar... (${3 - retries}/3)`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'host',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS models (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#e8641a',
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS call_types (
      id SERIAL PRIMARY KEY,
      model_id INTEGER NOT NULL REFERENCES models(id),
      name TEXT NOT NULL,
      video_url TEXT,
      video_public_id TEXT,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions_calls (
      id SERIAL PRIMARY KEY,
      call_type_id INTEGER NOT NULL REFERENCES call_types(id),
      session_token TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      ended_at TIMESTAMP
    );
  `);
  console.log('PostgreSQL inicializado');
}

initDB().catch(console.error);

module.exports = { query, pool };
