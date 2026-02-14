// Run database setup via Supabase REST API
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yhfelrmpwkzvnruubklx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZmVscm1wd2t6dm5ydXVia2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTA2OTAsImV4cCI6MjA4NTI2NjY5MH0.41ZrbPM_kuEr5ojy4FCgACmL6NqIfIgsyD-qNb-sYfs';

async function runSQL() {
  const sqlFile = path.join(__dirname, 'setup-db.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  // Split into individual statements
  const statements = sql.split(';').filter(s => s.trim().length > 0);

  console.log(`Found ${statements.length} SQL statements to execute`);
  console.log('Note: This requires service_role key to create tables.');
  console.log('Using anon key - will only work if tables already exist.\n');

  // Try to check if tables exist first
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/auctions?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (response.ok) {
      console.log('Tables appear to exist! Checking for data...');
      const data = await response.json();
      console.log('Auctions found:', data.length);

      // Check lots
      const lotsRes = await fetch(`${SUPABASE_URL}/rest/v1/lots?select=id,title&limit=10`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      const lots = await lotsRes.json();
      console.log('Lots found:', lots.length);
      if (lots.length > 0) {
        console.log('Sample lots:', lots.map(l => l.title));
      }
    } else {
      console.log('Tables do not exist or access denied:', response.status);
      console.log('You need to run the SQL manually in the Supabase dashboard.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

runSQL();
