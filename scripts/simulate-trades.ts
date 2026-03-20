import 'dotenv/config';

/**
 * Simulates trade data being inserted for competition participants.
 * In production, the indexer polls the Adrena API. This script
 * directly inserts test trades into the database for testing.
 *
 * Usage: npx tsx scripts/simulate-trades.ts <competition_id> <wallet1> <wallet2>
 */

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://arena:arena_dev@localhost:5432/adrenax_arena';

async function main() {
  const [competitionId, wallet1, wallet2] = process.argv.slice(2);

  if (!competitionId || !wallet1) {
    console.log('Usage: npx tsx scripts/simulate-trades.ts <competition_id> <wallet1> [wallet2]');
    process.exit(1);
  }

  // Dynamic import to avoid bundling pg at script level
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: DATABASE_URL });

  try {
    // Get competition window
    const compResult = await pool.query(
      'SELECT start_time, end_time FROM arena_competitions WHERE id = $1',
      [competitionId]
    );

    if (compResult.rows.length === 0) {
      console.error('Competition not found:', competitionId);
      process.exit(1);
    }

    const { start_time, end_time } = compResult.rows[0];
    console.log(`Competition window: ${start_time} to ${end_time}\n`);

    const wallets = [wallet1, wallet2].filter(Boolean) as string[];

    for (const wallet of wallets) {
      console.log(`Simulating trades for ${wallet}...`);

      // Generate 3-5 random trades
      const tradeCount = 3 + Math.floor(Math.random() * 3);

      for (let i = 0; i < tradeCount; i++) {
        const isWin = Math.random() > 0.4; // 60% win rate
        const collateral = 50 + Math.random() * 450; // $50-$500
        const roi = isWin
          ? Math.random() * 50 // 0-50% gain
          : -(Math.random() * 30); // 0-30% loss
        const pnl = collateral * (roi / 100);
        const fees = collateral * 0.001; // 0.1% fee

        const entryOffset = Math.random() * 0.5; // 0-50% into competition
        const holdHours = 0.1 + Math.random() * 4; // 6 min to 4 hours
        const competitionDuration = new Date(end_time).getTime() - new Date(start_time).getTime();
        const entryTime = new Date(new Date(start_time).getTime() + competitionDuration * entryOffset);
        const exitTime = new Date(entryTime.getTime() + holdHours * 3600000);

        const side = Math.random() > 0.5 ? 'long' : 'short';
        const symbols = ['SOL', 'BTC', 'ETH'];
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const positionId = 100000 + Math.floor(Math.random() * 900000);

        await pool.query(
          `INSERT INTO arena_trades (
            competition_id, user_pubkey, position_id, symbol, side,
            entry_price, exit_price, entry_size, collateral_usd,
            pnl_usd, fees_usd, entry_date, exit_date, is_liquidated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (competition_id, position_id) DO NOTHING`,
          [
            competitionId, wallet, positionId, symbol, side,
            100 + Math.random() * 50000, // entry price
            100 + Math.random() * 50000, // exit price
            collateral * (1 + Math.random() * 5), // leveraged size
            collateral,
            pnl, fees, entryTime, exitTime, false,
          ]
        );

        const roiStr = roi >= 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`;
        console.log(`  Trade ${i + 1}: ${side} ${symbol} | $${collateral.toFixed(0)} | ${roiStr} | ${isWin ? 'WIN' : 'LOSS'}`);
      }

      // Update participant scores
      const scoreResult = await pool.query(
        `SELECT
          COALESCE(SUM(pnl_usd), 0) as total_pnl,
          COALESCE(SUM(collateral_usd), 0) as total_collateral,
          COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE pnl_usd > 0) as wins
        FROM arena_trades
        WHERE competition_id = $1 AND user_pubkey = $2 AND exit_date IS NOT NULL`,
        [competitionId, wallet]
      );

      const scores = scoreResult.rows[0];
      const totalPnl = Number(scores.total_pnl);
      const totalCollateral = Number(scores.total_collateral);
      const roiPct = totalCollateral > 0 ? (totalPnl / totalCollateral) * 100 : 0;
      const winRate = Number(scores.total_trades) > 0 ? Number(scores.wins) / Number(scores.total_trades) : 0;

      await pool.query(
        `UPDATE arena_participants SET
          pnl_usd = $1, roi_percent = $2, total_volume_usd = $3,
          positions_closed = $4, win_rate = $5, updated_at = NOW()
        WHERE competition_id = $6 AND user_pubkey = $7`,
        [totalPnl, roiPct, totalCollateral, Number(scores.total_trades), winRate, competitionId, wallet]
      );

      console.log(`  Summary: PnL=$${totalPnl.toFixed(2)} | ROI=${roiPct.toFixed(2)}% | WinRate=${(winRate * 100).toFixed(0)}%\n`);
    }

    console.log('Trade simulation complete!');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
