const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yhfelrmpwkzvnruubklx.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZmVscm1wd2t6dm5ydXVia2x4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5MDY5MCwiZXhwIjoyMDg1MjY2NjkwfQ.Cw6_tJ3tjXkRGXI8BU5wwKng2HRbEXG06PLj7FcYcHc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function testPlaceBid() {
  // First get a lot ID and user ID
  const { data: lots } = await supabase.from('lots').select('id, starting_bid, increment').limit(1);
  const { data: users } = await supabase.from('users').select('id').eq('role', 'bidder').limit(1);

  if (!lots || !lots[0]) {
    console.log('No lots found');
    return;
  }
  if (!users || !users[0]) {
    console.log('No users found');
    return;
  }

  console.log('Testing with lot:', lots[0].id);
  console.log('Starting bid:', lots[0].starting_bid);
  console.log('Increment:', lots[0].increment);
  console.log('User:', users[0].id);

  // Try to place a bid
  const bidAmount = lots[0].starting_bid + lots[0].increment;
  console.log('Bid amount:', bidAmount);

  const { data, error } = await supabase.rpc('place_bid', {
    p_lot_id: lots[0].id,
    p_user_id: users[0].id,
    p_amount: bidAmount
  });

  if (error) {
    console.log('Error:', error.message);
    console.log('Code:', error.code);
    console.log('Details:', error.details);
    console.log('Hint:', error.hint);
  } else {
    console.log('Result:', JSON.stringify(data, null, 2));
  }
}

testPlaceBid().catch(console.error);
