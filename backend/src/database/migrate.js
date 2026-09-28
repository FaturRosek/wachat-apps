require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const ensureDatabaseExists = async () => {
  if (process.env.DATABASE_URL) {
    return;
  }
  const dbName = process.env.DB_NAME || 'wachat_ai';
  const { Client } = require('pg');
  const adminClient = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres'
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      console.log(`[Database] Database "${dbName}" not found. Creating database...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[Database] Database "${dbName}" created successfully.`);
    }
  } catch (err) {
    console.warn(`[Database Warning] Auto-create check: ${err.message}`);
  } finally {
    await adminClient.end();
  }
};

const runMigrations = async () => {
  await ensureDatabaseExists();

  const client = await pool.connect();
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (file.endsWith('.sql')) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`Running migration: ${file}`);
        await client.query(sql);
      }
    }
    console.log('All migrations executed successfully');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations();
