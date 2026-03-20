import 'dotenv/config';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json();
}

async function main() {
  console.log('Seeding test duel...');
  console.log(`API: ${API_BASE}`);
  console.log('Note: Requires DEV_MODE_SKIP_AUTH=true on the server\n');

  // Test wallets
  const challenger = 'AdrN1challenger111111111111111111111111111';
  const defender = 'AdrN1defender1111111111111111111111111111';

  // Step 1: Get nonce for challenger
  console.log('1. Getting nonce for challenger...');
  const nonceRes = await api(`/api/arena/users/nonce/${challenger}`);
  if (!nonceRes.success) {
    console.error('   Failed to get nonce:', nonceRes.error);
    process.exit(1);
  }
  const nonce = nonceRes.data.nonce;
  console.log(`   Nonce: ${nonce.slice(0, 16)}...`);

  // Step 2: Create an honor duel (using dev-mode auth bypass)
  console.log('2. Creating honor duel...');
  const duelRes = await api('/api/arena/duels', {
    method: 'POST',
    headers: {
      'x-wallet': challenger,
      'x-signature': 'dev-bypass',
      'x-nonce': nonce,
    },
    body: JSON.stringify({
      defenderPubkey: defender,
      assetSymbol: 'SOL',
      durationHours: 24,
      isHonorDuel: true,
    }),
  });

  if (!duelRes.success) {
    console.error('   Failed to create duel:', duelRes.error, duelRes.message);
    console.log('\n   Make sure the server has DEV_MODE_SKIP_AUTH=true set.');
    process.exit(1);
  }

  const duel = duelRes.data;
  console.log(`   Duel created: ${duel.duel.id}`);
  console.log(`   Status: ${duel.duel.status}`);
  console.log(`   Challenge URL: ${duel.challengeUrl}`);
  console.log(`   Card URL: ${duel.cardUrl}`);

  // Step 3: Accept the duel as defender
  console.log('\n3. Accepting duel as defender...');
  const defNonceRes = await api(`/api/arena/users/nonce/${defender}`);
  const acceptRes = await api(`/api/arena/duels/${duel.duel.id}/accept`, {
    method: 'POST',
    headers: {
      'x-wallet': defender,
      'x-signature': 'dev-bypass',
      'x-nonce': defNonceRes.data.nonce,
    },
  });

  if (!acceptRes.success) {
    console.error('   Failed to accept duel:', acceptRes.error);
  } else {
    console.log(`   Duel accepted! Status: ${acceptRes.data.duel.status}`);
    console.log(`   Start: ${acceptRes.data.startTime}`);
    console.log(`   End: ${acceptRes.data.endTime}`);
  }

  // Step 4: List duels
  console.log('\n4. Listing duels...');
  const listRes = await api('/api/arena/duels');
  console.log(`   Found ${listRes.data?.length || 0} duels`);

  // Step 5: Get duel details
  console.log('\n5. Fetching duel details...');
  const detailRes = await api(`/api/arena/duels/${duel.duel.id}`);
  console.log(`   Status: ${detailRes.data?.duel?.status}`);
  console.log(`   Participants: ${detailRes.data?.participants?.length}`);
  if (detailRes.data?.competition) {
    console.log(`   Competition end: ${detailRes.data.competition.end_time}`);
  }

  console.log('\nSeed complete!');
  console.log(`  Duel ID: ${duel.duel.id}`);
  console.log(`  View at: http://localhost:3001/arena/duels/${duel.duel.id}`);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
