import type { Metadata } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const cardUrl = `${API_BASE}/api/arena/challenge/${params.id}/card.png`;
  const pageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/arena/challenge/${params.id}`;

  return {
    title: 'AdrenaX Arena - Trading Duel Challenge',
    description: 'You have been challenged to a head-to-head trading duel on Adrena!',
    openGraph: {
      title: 'AdrenaX Arena - Trading Duel Challenge',
      description: 'You have been challenged to a head-to-head trading duel on Adrena!',
      images: [{ url: cardUrl, width: 1200, height: 630 }],
      url: pageUrl,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'AdrenaX Arena - Trading Duel Challenge',
      description: 'You have been challenged to a head-to-head trading duel on Adrena!',
      images: [cardUrl],
    },
  };
}

export default async function ChallengeLandingPage({ params }: { params: { id: string } }) {
  let duel: any = null;
  try {
    const res = await fetch(`${API_BASE}/api/arena/duels/${params.id}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.success) duel = json.data?.duel;
  } catch {}

  function shortenPubkey(key: string): string {
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  if (!duel) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Challenge Not Found</h1>
          <p className="text-arena-muted">This duel may have expired or been cancelled.</p>
        </div>
      </div>
    );
  }

  const stakeDisplay = duel.is_honor_duel ? 'Honor Duel' : `${duel.stake_amount} ${duel.stake_token}`;

  return (
    <div className="min-h-screen bg-arena-bg flex items-center justify-center px-4">
      <div className="max-w-xl w-full">
        {/* Card image */}
        <div className="rounded-2xl overflow-hidden mb-6 border border-arena-border">
          <img
            src={`${API_BASE}/api/arena/challenge/${params.id}/card.png`}
            alt="Challenge Card"
            className="w-full"
          />
        </div>

        {/* Challenge details */}
        <div className="bg-arena-card border border-arena-border rounded-2xl p-6 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black mb-1">Trading Duel Challenge</h1>
            <p className="text-arena-muted">on AdrenaX Arena</p>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center mb-6">
            <div>
              <div className="text-xs text-arena-muted mb-1">Asset</div>
              <div className="font-bold">{duel.asset_symbol}</div>
            </div>
            <div>
              <div className="text-xs text-arena-muted mb-1">Duration</div>
              <div className="font-bold">{duel.duration_hours}h</div>
            </div>
            <div>
              <div className="text-xs text-arena-muted mb-1">Stake</div>
              <div className={`font-bold ${duel.is_honor_duel ? 'text-arena-accent' : 'text-arena-gold'}`}>
                {stakeDisplay}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-xs text-arena-muted">Challenger</div>
              <div className="font-mono font-bold">{shortenPubkey(duel.challenger_pubkey)}</div>
            </div>
            <div className="text-arena-gold font-black text-2xl">VS</div>
            <div className="text-center">
              <div className="text-xs text-arena-muted">Defender</div>
              <div className="font-mono font-bold">
                {duel.defender_pubkey ? shortenPubkey(duel.defender_pubkey) : 'YOU?'}
              </div>
            </div>
          </div>

          {duel.status === 'pending' && (
            <a
              href={`/arena/duels/${duel.id}`}
              className="block w-full bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold py-4 rounded-xl text-center text-lg transition-colors"
            >
              Accept Challenge
            </a>
          )}

          {duel.status === 'active' && (
            <a
              href={`/arena/duels/${duel.id}`}
              className="block w-full bg-arena-card border border-arena-accent text-arena-accent font-bold py-4 rounded-xl text-center text-lg transition-colors hover:bg-arena-accent/10"
            >
              Spectate Live
            </a>
          )}

          {duel.status === 'completed' && (
            <div className="text-center">
              <div className="text-arena-gold font-bold text-lg mb-2">
                Winner: {duel.winner_pubkey ? shortenPubkey(duel.winner_pubkey) : 'Draw'}
              </div>
              <a
                href={`/arena/duels/${duel.id}`}
                className="text-arena-accent hover:underline"
              >
                View Results
              </a>
            </div>
          )}
        </div>

        {/* Branding */}
        <div className="text-center text-arena-muted text-sm">
          <span className="text-arena-accent font-bold">AdrenaX</span> Arena — Peer-to-peer trading duels on Solana
        </div>
      </div>
    </div>
  );
}
