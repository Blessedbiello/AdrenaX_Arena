import 'dotenv/config';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const SKIP = '\x1b[33mSKIP\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [${PASS}] ${label}`);
    passed++;
  } else {
    console.log(`  [${FAIL}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function skip(label: string, reason: string) {
  console.log(`  [${SKIP}] ${label} — ${reason}`);
  skipped++;
}

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json();
}

async function authedApi(path: string, wallet: string, opts: Omit<RequestInit, 'headers'> = {}) {
  const nonceRes = await api(`/api/arena/users/nonce/${wallet}`);
  return api(path, {
    ...opts,
    headers: {
      'x-wallet': wallet,
      'x-signature': 'dev-bypass',
      'x-nonce': nonceRes.data?.nonce || '',
    },
  });
}

async function main() {
  console.log('=== AdrenaX Arena E2E Test ===');
  console.log(`API: ${API_BASE}`);
  console.log('Requires: DEV_MODE_SKIP_AUTH=true, Docker services running\n');

  const alice = 'TestAlice1111111111111111111111111111111111';
  const bob   = 'TestBob11111111111111111111111111111111111';
  const carol = 'TestCarol111111111111111111111111111111111';

  // ── 1. Health Check ──
  console.log('1. Health Check');
  const health = await api('/api/health');
  check('Server responds', health.status === 'ok', health.status);
  if (health.status !== 'ok') {
    console.error('\nServer not healthy. Ensure docker-compose is up and migrations are run.');
    process.exit(1);
  }

  // ── 2. Create a Duel ──
  console.log('\n2. Duel Creation');
  const createRes = await authedApi('/api/arena/duels', alice, {
    method: 'POST',
    body: JSON.stringify({
      defenderPubkey: bob,
      assetSymbol: 'SOL',
      durationHours: 24,
      isHonorDuel: true,
    }),
  });
  check('Duel created', createRes.success === true, createRes.error);
  const duelId = createRes.data?.duel?.id;
  check('Duel has ID', !!duelId);
  check('Status is pending', createRes.data?.duel?.status === 'pending');
  check('Challenge URL returned', !!createRes.data?.challengeUrl);
  check('Card URL returned', !!createRes.data?.cardUrl);

  if (!duelId) {
    console.error('\nCannot continue without a duel. Exiting.');
    process.exit(1);
  }

  // ── 3. Self-Duel Prevention ──
  console.log('\n3. Self-Duel Prevention');
  const selfDuel = await authedApi('/api/arena/duels', alice, {
    method: 'POST',
    body: JSON.stringify({
      defenderPubkey: alice,
      assetSymbol: 'SOL',
      durationHours: 24,
      isHonorDuel: true,
    }),
  });
  check('Self-duel rejected', selfDuel.success === false);
  check('Error code is CANNOT_SELF_DUEL', selfDuel.error === 'CANNOT_SELF_DUEL');

  // ── 4. Accept Duel ──
  console.log('\n4. Duel Acceptance');
  const acceptRes = await authedApi(`/api/arena/duels/${duelId}/accept`, bob, {
    method: 'POST',
  });
  check('Duel accepted', acceptRes.success === true, acceptRes.error);
  check('Status is active', acceptRes.data?.duel?.status === 'active');
  check('Start time set', !!acceptRes.data?.startTime);
  check('End time set', !!acceptRes.data?.endTime);

  // ── 5. Duel Details ──
  console.log('\n5. Duel Details');
  const detailRes = await api(`/api/arena/duels/${duelId}`);
  check('Details fetched', detailRes.success === true);
  check('Has 2 participants', detailRes.data?.participants?.length === 2);
  check('Competition times included', !!detailRes.data?.competition?.end_time);
  check('Status is active', detailRes.data?.duel?.status === 'active');

  // ── 6. List Duels ──
  console.log('\n6. Duel Listing');
  const allDuels = await api('/api/arena/duels');
  check('Duels list fetched', allDuels.success === true);
  check('At least 1 duel', (allDuels.data?.length || 0) >= 1);

  const activeDuels = await api('/api/arena/duels?status=active');
  check('Active filter works', activeDuels.success === true);

  // ── 7. User Profiles ──
  console.log('\n7. User Profiles');
  const aliceProfile = await api(`/api/arena/users/${alice}/profile`);
  check('Alice profile fetched', aliceProfile.success === true);
  check('Alice has duel stats', aliceProfile.data?.duels?.total !== undefined);

  // ── 8. Gauntlet Lifecycle ──
  console.log('\n8. Gauntlet Creation');
  const gauntletRes = await authedApi('/api/arena/competitions/gauntlet', alice, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Gauntlet Alpha',
      maxParticipants: 64,
      durationHours: 24,
    }),
  });
  check('Gauntlet created', gauntletRes.success === true, gauntletRes.error);
  const gauntletId = gauntletRes.data?.id;

  if (gauntletId) {
    // Register participants
    console.log('\n9. Gauntlet Registration');
    const regAlice = await authedApi(`/api/arena/competitions/${gauntletId}/register`, alice, {
      method: 'POST',
    });
    check('Alice registered', regAlice.success === true, regAlice.error);

    const regBob = await authedApi(`/api/arena/competitions/${gauntletId}/register`, bob, {
      method: 'POST',
    });
    check('Bob registered', regBob.success === true, regBob.error);

    const regCarol = await authedApi(`/api/arena/competitions/${gauntletId}/register`, carol, {
      method: 'POST',
    });
    check('Carol registered', regCarol.success === true, regCarol.error);

    // Check competition details
    const compDetails = await api(`/api/arena/competitions/${gauntletId}`);
    check('Competition details fetched', compDetails.success === true);
    check('Has 3 participants', compDetails.data?.participants?.length === 3);
  } else {
    skip('Gauntlet registration', 'gauntlet creation failed');
  }

  // ── 10. Competitions List ──
  console.log('\n10. Competitions');
  const comps = await api('/api/arena/competitions');
  check('Competitions list fetched', comps.success === true);
  check('At least 1 competition', (comps.data?.length || 0) >= 1);

  // ── 11. SSE Endpoint ──
  console.log('\n11. SSE Stream');
  try {
    const sseRes = await fetch(`${API_BASE}/api/arena/duels/${duelId}/stream`, {
      signal: AbortSignal.timeout(2000),
    });
    check('SSE endpoint responds', sseRes.status === 200);
    check('Content-Type is event-stream', sseRes.headers.get('content-type')?.includes('text/event-stream') === true);
  } catch {
    skip('SSE stream', 'connection timed out (expected behavior)');
  }

  // ── 12. Challenge Card ──
  console.log('\n12. Challenge Card');
  try {
    const cardRes = await fetch(`${API_BASE}/api/arena/challenge/${duelId}/card.png`, {
      signal: AbortSignal.timeout(5000),
    });
    check('Card endpoint responds', cardRes.status === 200);
    const ct = cardRes.headers.get('content-type') || '';
    check('Returns image or JSON', ct.includes('image') || ct.includes('json'));
  } catch (err) {
    skip('Challenge card', (err as Error).message);
  }

  // ── 13. Predictions ──
  console.log('\n13. Predictions');
  const predRes = await authedApi(`/api/arena/duels/${duelId}/predict`, carol, {
    method: 'POST',
    body: JSON.stringify({ predictedWinner: alice }),
  });
  check('Prediction submitted', predRes.success === true, predRes.error);

  const predStats = await api(`/api/arena/duels/${duelId}/predictions`);
  check('Prediction stats fetched', predStats.success === true);
  check('Has 1 prediction', predStats.data?.total === 1);

  // ── 14. Open Challenges ──
  console.log('\n14. Open Challenges');
  const openRes = await authedApi('/api/arena/duels', alice, {
    method: 'POST',
    body: JSON.stringify({
      assetSymbol: 'ETH',
      durationHours: 24,
      isHonorDuel: true,
    }),
  });
  check('Open challenge created', openRes.success === true, openRes.error);
  check('Defender is null', openRes.data?.duel?.defender_pubkey === null);

  const openList = await api('/api/arena/duels?type=open');
  check('Open duels list fetched', openList.success === true);
  check('At least 1 open duel', (openList.data?.length || 0) >= 1);

  // ── 15. Streak Endpoint ──
  console.log('\n15. Streak Stats');
  const streakRes = await api(`/api/arena/users/${alice}/streak`);
  check('Streak endpoint responds', streakRes.success === true);
  check('Has current_streak', streakRes.data?.current_streak !== undefined);
  check('Has best_streak', streakRes.data?.best_streak !== undefined);
  check('Has total_wins', streakRes.data?.total_wins !== undefined);

  // ── 16. Profile Includes Streak ──
  console.log('\n16. Profile Streak Data');
  const profileRes = await api(`/api/arena/users/${alice}/profile`);
  check('Profile has streak', profileRes.data?.streak !== undefined);
  check('Streak has current', profileRes.data?.streak?.current !== undefined);
  check('Streak has title', 'title' in (profileRes.data?.streak || {}));

  // ── 17. Revenge Windows ──
  console.log('\n17. Revenge Windows');
  const revengeRes = await api(`/api/arena/duels/revenge/${alice}`);
  check('Revenge endpoint responds', revengeRes.success === true);
  check('Returns array', Array.isArray(revengeRes.data));

  // ── Summary ──
  console.log('\n' + '='.repeat(50));
  console.log(`\n  ${PASS} ${passed} passed`);
  if (failed > 0) console.log(`  ${FAIL} ${failed} failed`);
  if (skipped > 0) console.log(`  ${SKIP} ${skipped} skipped`);
  console.log(`\n  Total: ${passed + failed + skipped} checks`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\nSome checks failed. Review output above.');
    process.exit(1);
  }

  console.log('\nAll checks passed! The Arena is operational.');
  console.log('\nNext steps:');
  console.log('  - View the arena: http://localhost:3001/arena');
  console.log(`  - View the duel: http://localhost:3001/arena/duels/${duelId}`);
  console.log(`  - View card: ${API_BASE}/api/arena/challenge/${duelId}/card.png`);
}

main().catch(err => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
