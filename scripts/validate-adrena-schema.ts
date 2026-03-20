try { require('dotenv/config'); } catch {}
import { z } from 'zod';

const ADRENA_API = process.env.ADRENA_API_BASE || 'https://datapi.adrena.trade';

// Import schemas inline to avoid module resolution issues
const AdrenaPositionSchema = z.object({
  position_id: z.number(),
  user_id: z.number().optional(),
  symbol: z.string(),
  token_account_mint: z.string().optional(),
  side: z.enum(['long', 'short']),
  status: z.enum(['open', 'close', 'liquidated', 'closing', 'opening']).default('open'),
  pubkey: z.string().optional(),
  entry_price: z.number().nullable().optional(),
  exit_price: z.number().nullable().optional(),
  entry_size: z.number().nullable().optional(),
  increase_size: z.number().nullable().optional(),
  exit_size: z.number().nullable().optional(),
  pnl: z.number().nullable().optional(),
  entry_leverage: z.number().nullable().optional(),
  lowest_leverage: z.number().nullable().optional(),
  entry_date: z.string().nullable().optional(),
  exit_date: z.string().nullable().optional(),
  fees: z.number().nullable().optional(),
  borrow_fees: z.number().nullable().optional(),
  exit_fees: z.number().nullable().optional(),
  last_ix: z.string().nullable().optional(),
  entry_collateral_amount: z.number().nullable().optional(),
  collateral_amount: z.number().nullable().optional(),
  closed_by_sl_tp: z.boolean().optional(),
  volume: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  pnl_volume_ratio: z.number().nullable().optional(),
  points_pnl_volume_ratio: z.number().nullable().optional(),
  points_duration: z.number().nullable().optional(),
  close_size_multiplier: z.number().nullable().optional(),
  points_mutations: z.number().nullable().optional(),
  total_points: z.number().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
}).passthrough();

const PositionListSchema = z.object({
  success: z.boolean(),
  data: z.array(AdrenaPositionSchema),
});

const PoolStatsSchema = z.object({
  success: z.boolean(),
  data: z.object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    daily_volume_usd: z.number().optional(),
    total_volume_usd: z.number().optional(),
    daily_fee_usd: z.number().optional(),
    total_fee_usd: z.number().optional(),
    pool_name: z.string().optional(),
  }).passthrough(),
});

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  [${PASS}] ${label}`); passed++; }
  else { console.log(`  [${FAIL}] ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  // Known wallet from Adrena Postman docs
  const wallet = process.argv[2] || 'GZXqnVpZuyKWdUH34mgijxJVM1LEngoGWoJzEXtXGhBb';

  console.log('=== Adrena API Schema Validation ===');
  console.log(`API: ${ADRENA_API}`);
  console.log(`Wallet: ${wallet}\n`);

  // ── 1. Position Endpoint ──
  console.log('1. Position Endpoint');
  const posUrl = `${ADRENA_API}/position?user_wallet=${wallet}&limit=3`;
  console.log(`   GET ${posUrl}`);

  const posRes = await fetch(posUrl);
  const posJson = await posRes.json();
  console.log(`   Status: ${posRes.status}`);
  console.log(`   Raw (first 300 chars): ${JSON.stringify(posJson).slice(0, 300)}`);

  check('Response is 200', posRes.status === 200);
  check('Has success field', 'success' in posJson);
  check('success is true', posJson.success === true);
  check('Has data array', Array.isArray(posJson.data));

  if (Array.isArray(posJson.data) && posJson.data.length > 0) {
    const firstPos = posJson.data[0];
    console.log(`\n   First position fields: ${Object.keys(firstPos).join(', ')}`);

    // Validate against schema
    const parseResult = PositionListSchema.safeParse(posJson);
    check('PositionListSchema parses OK', parseResult.success, parseResult.success ? undefined : parseResult.error.message.slice(0, 300));

    // Check critical fields exist
    check('Has position_id (number)', typeof firstPos.position_id === 'number');
    check('Has symbol (string)', typeof firstPos.symbol === 'string');
    check('Has side (long|short)', ['long', 'short'].includes(firstPos.side));
    check('Has status', typeof firstPos.status === 'string');
    check('Has entry_price', 'entry_price' in firstPos);
    check('Has exit_price', 'exit_price' in firstPos);
    check('Has pnl', 'pnl' in firstPos);
    check('Has fees', 'fees' in firstPos);
    check('Has entry_date', 'entry_date' in firstPos);
    check('Has exit_date', 'exit_date' in firstPos);
    check('Has collateral_amount', 'collateral_amount' in firstPos);
    check('Has entry_size', 'entry_size' in firstPos);
    check('Has pubkey (wallet)', 'pubkey' in firstPos);

    // Check with passthrough for extra fields
    const passthroughParse = AdrenaPositionSchema.safeParse(firstPos);
    check('Single position parses OK', passthroughParse.success, passthroughParse.success ? undefined : passthroughParse.error.message.slice(0, 300));

    // Detect extra fields not in schema
    const schemaKeys = new Set(Object.keys(AdrenaPositionSchema.shape));
    const extraFields = Object.keys(firstPos).filter(k => !schemaKeys.has(k));
    if (extraFields.length > 0) {
      console.log(`\n   Extra fields (passthrough): ${extraFields.join(', ')}`);
    }
  } else {
    console.log('   No positions found for this wallet');
  }

  // ── 2. "Not Found" Wallet ──
  console.log('\n2. Empty Wallet Response');
  const emptyRes = await fetch(`${ADRENA_API}/position?user_wallet=11111111111111111111111111111111`);
  const emptyJson = await emptyRes.json();
  console.log(`   Response: ${JSON.stringify(emptyJson)}`);
  check('Returns error for empty wallet', 'error' in emptyJson);
  check('Error is "Not found"', emptyJson.error === 'Not found');

  // ── 3. Pool Stats ──
  console.log('\n3. Pool Stats Endpoint');
  const poolRes = await fetch(`${ADRENA_API}/pool-high-level-stats`);
  const poolJson = await poolRes.json();
  console.log(`   Fields: ${Object.keys(poolJson.data || {}).join(', ')}`);

  const poolParse = PoolStatsSchema.safeParse(poolJson);
  check('PoolStatsSchema parses OK', poolParse.success, poolParse.success ? undefined : poolParse.error.message.slice(0, 300));
  check('Has daily_volume_usd', poolJson.data?.daily_volume_usd !== undefined);
  check('Has total_volume_usd', poolJson.data?.total_volume_usd !== undefined);
  check('Has pool_name', poolJson.data?.pool_name !== undefined);
  check('Has start_date', poolJson.data?.start_date !== undefined);
  check('Has end_date', poolJson.data?.end_date !== undefined);
  check('Has daily_fee_usd', poolJson.data?.daily_fee_usd !== undefined);
  check('Has total_fee_usd', poolJson.data?.total_fee_usd !== undefined);

  // ── Summary ──
  console.log('\n' + '='.repeat(50));
  console.log(`  ${PASS} ${passed} passed`);
  if (failed > 0) console.log(`  ${FAIL} ${failed} failed`);
  console.log(`  Total: ${passed + failed} checks`);
  console.log('='.repeat(50));

  if (failed > 0) process.exit(1);
  console.log('\nSchema validation successful!');
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
