const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Using Supabase Pooler (Session mode - port 5432)
  const client = new Client({
    host: 'aws-0-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.yhfelrmpwkzvnruubklx',
    password: '99eOASy%hlBWDXII',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase via pooler...');
    await client.connect();
    console.log('Connected!');

    const sqlFile = path.join(__dirname, 'supabase/migrations/0001_full_schema.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('Running migration...');
    await client.query(sql);
    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    await client.end();
  }
}

runMigration();
