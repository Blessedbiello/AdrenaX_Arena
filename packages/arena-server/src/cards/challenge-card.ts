import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Card dimensions optimized for Twitter/Discord embeds
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/**
 * Shorten a Solana pubkey for display: "AbCd...xYzW"
 */
function shortenPubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

/**
 * Generate a challenge card PNG buffer for a duel.
 */
export async function generateChallengeCard(duel: {
  id: string;
  challenger_pubkey: string;
  defender_pubkey: string | null;
  asset_symbol: string;
  stake_amount: number | string;
  stake_token: string;
  is_honor_duel: boolean;
  duration_hours: number;
  status: string;
  winner_pubkey?: string | null;
  challenger_roi?: number | string | null;
  defender_roi?: number | string | null;
}): Promise<Buffer> {
  const isCompleted = duel.status === 'completed';
  const stakeDisplay = duel.is_honor_duel
    ? 'HONOR DUEL'
    : `${duel.stake_amount} ${duel.stake_token}`;

  // Build the card using satori's React-like JSX syntax (plain objects)
  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)',
        padding: '48px',
        fontFamily: 'sans-serif',
        color: '#e4e4e7',
      },
      children: [
        // Header
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '28px',
                    fontWeight: 'bold',
                    color: '#00d4aa',
                    letterSpacing: '2px',
                  },
                  children: 'ADRENAX ARENA',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    color: '#71717a',
                    background: 'rgba(255,255,255,0.1)',
                    padding: '8px 20px',
                    borderRadius: '20px',
                  },
                  children: isCompleted ? 'RESULT' : 'CHALLENGE',
                },
              },
            ],
          },
        },

        // Versus section
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: '1',
              gap: '40px',
            },
            children: [
              // Challenger
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: '1',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '120px',
                          height: '120px',
                          borderRadius: '60px',
                          background: 'linear-gradient(135deg, #00d4aa, #0088ff)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '48px',
                          marginBottom: '16px',
                        },
                        children: '⚔',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '16px', color: '#71717a', marginBottom: '4px' },
                        children: 'CHALLENGER',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '24px', fontWeight: 'bold' },
                        children: shortenPubkey(duel.challenger_pubkey),
                      },
                    },
                    ...(isCompleted && duel.challenger_roi != null
                      ? [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '32px',
                                fontWeight: 'bold',
                                color: Number(duel.challenger_roi) >= 0 ? '#00d4aa' : '#ff4757',
                                marginTop: '8px',
                              },
                              children: `${Number(duel.challenger_roi) >= 0 ? '+' : ''}${Number(duel.challenger_roi).toFixed(2)}%`,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },

              // VS
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: '#ffd700',
                    textShadow: '0 0 20px rgba(255,215,0,0.5)',
                  },
                  children: 'VS',
                },
              },

              // Defender
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: '1',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '120px',
                          height: '120px',
                          borderRadius: '60px',
                          background: duel.defender_pubkey
                            ? 'linear-gradient(135deg, #ff4757, #ff6b81)'
                            : 'rgba(255,255,255,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '48px',
                          marginBottom: '16px',
                        },
                        children: duel.defender_pubkey ? '🛡' : '?',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '16px', color: '#71717a', marginBottom: '4px' },
                        children: 'DEFENDER',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '24px', fontWeight: 'bold' },
                        children: duel.defender_pubkey
                          ? shortenPubkey(duel.defender_pubkey)
                          : 'Awaiting...',
                      },
                    },
                    ...(isCompleted && duel.defender_roi != null
                      ? [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '32px',
                                fontWeight: 'bold',
                                color: Number(duel.defender_roi) >= 0 ? '#00d4aa' : '#ff4757',
                                marginTop: '8px',
                              },
                              children: `${Number(duel.defender_roi) >= 0 ? '+' : ''}${Number(duel.defender_roi).toFixed(2)}%`,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },
            ],
          },
        },

        // Footer: asset, duration, stake
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: '24px',
              marginTop: '24px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: '32px',
                    fontSize: '18px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        children: [
                          { type: 'span', props: { style: { color: '#71717a' }, children: 'Asset: ' } },
                          { type: 'span', props: { style: { fontWeight: 'bold' }, children: duel.asset_symbol } },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        children: [
                          { type: 'span', props: { style: { color: '#71717a' }, children: 'Duration: ' } },
                          { type: 'span', props: { style: { fontWeight: 'bold' }, children: `${duel.duration_hours}h` } },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        children: [
                          { type: 'span', props: { style: { color: '#71717a' }, children: 'Stake: ' } },
                          {
                            type: 'span',
                            props: {
                              style: {
                                fontWeight: 'bold',
                                color: duel.is_honor_duel ? '#00d4aa' : '#ffd700',
                              },
                              children: stakeDisplay,
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              ...(isCompleted && duel.winner_pubkey
                ? [
                    {
                      type: 'div',
                      props: {
                        style: {
                          background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
                          padding: '8px 24px',
                          borderRadius: '20px',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#0a0a1a',
                        },
                        children: `WINNER: ${shortenPubkey(duel.winner_pubkey)}`,
                      },
                    },
                  ]
                : [
                    {
                      type: 'div',
                      props: {
                        style: {
                          background: 'linear-gradient(135deg, #ff4757, #ff6b81)',
                          padding: '12px 32px',
                          borderRadius: '24px',
                          fontSize: '20px',
                          fontWeight: 'bold',
                          color: 'white',
                        },
                        children: 'DO YOU ACCEPT?',
                      },
                    },
                  ]),
            ],
          },
        },
      ],
    },
  };

  // Render with satori
  const svg = await satori(element as any, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      {
        name: 'sans-serif',
        // Use a system font or bundled font
        data: await getDefaultFont(),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'sans-serif',
        data: await getDefaultFont(),
        weight: 700,
        style: 'normal',
      },
    ],
  });

  // Convert SVG to PNG
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_WIDTH },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Get a default font for satori rendering.
 * In production, bundle Inter or another web font.
 */
async function getDefaultFont(): Promise<ArrayBuffer> {
  // Try to use a system font
  const systemFontPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
  ];

  for (const fontPath of systemFontPaths) {
    try {
      const buffer = readFileSync(fontPath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch {
      continue;
    }
  }

  // Fallback: fetch Inter from Google Fonts (cached after first use)
  const response = await fetch(
    'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjQ.ttf'
  );
  return response.arrayBuffer();
}
