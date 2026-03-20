import 'dotenv/config';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function main() {
  console.log('Seeding test duel...\n');

  // Test wallets (these are just example pubkeys for testing)
  const challenger = 'AdrN1challenger111111111111111111111111111';
  const defender = 'AdrN1defender1111111111111111111111111111';

  // Step 1: Get nonce for challenger
  console.log('1. Getting nonce for challenger...');
  const nonceRes = await fetch(`${API_BASE}/api/arena/users/nonce/${challenger}`);
  const nonceData = await nonceRes.json();
  console.log(`   Nonce: ${nonceData.data?.nonce?.slice(0, 16)}...`);

  // Step 2: Create an honor duel (no auth needed for seed script — bypass in dev)
  console.log('2. Creating honor duel...');
  const duelRes = await fetch(`${API_BASE}/api/arena/duels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet': challenger,
      'x-signature': 'dev-bypass',
      'x-nonce': nonceData.data?.nonce || 'dev',
    },
    body: JSON.stringify({
      defenderPubkey: defender,
      assetSymbol: 'SOL',
      durationHours: 24,
      isHonorDuel: true,
    }),
  });

  const duelData = await duelRes.json();

  if (!duelData.success) {
    console.error('   Failed to create duel:', duelData.error, duelData.message);
    console.log('\n   Note: In production, auth is required. For testing,');
    console.log('   ensure the server is running and wallet auth is properly configured.');
    process.exit(1);
  }

  const duel = duelData.data;
  console.log(`   Duel created: ${duel.duel.id}`);
  console.log(`   Challenge URL: ${duel.challengeUrl}`);
  console.log(`   Card URL: ${duel.cardUrl}`);

  // Step 3: List duels
  console.log('\n3. Listing active duels...');
  const listRes = await fetch(`${API_BASE}/api/arena/duels`);
  const listData = await listRes.json();
  console.log(`   Found ${listData.data?.length || 0} duels`);

  // Step 4: Get duel details
  console.log(`\n4. Fetching duel details...`);
  const detailRes = await fetch(`${API_BASE}/api/arena/duels/${duel.duel.id}`);
  const detailData = await detailRes.json();
  console.log(`   Status: ${detailData.data?.duel?.status}`);
  console.log(`   Challenger: ${detailData.data?.duel?.challenger_pubkey}`);
  console.log(`   Defender: ${detailData.data?.duel?.defender_pubkey}`);

  console.log('\nSeed complete! Duel ID:', duel.duel.id);
  console.log('View at: http://localhost:3001/arena/duels/' + duel.duel.id);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
