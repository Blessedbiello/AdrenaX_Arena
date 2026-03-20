import { Client, GatewayIntentBits, EmbedBuilder, type TextChannel } from 'discord.js';
import { env } from '../config.js';

let client: Client | null = null;
let channel: TextChannel | null = null;

/**
 * Initialize the Discord bot. Fails silently if no token is configured.
 */
export async function initDiscordBot(): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
    console.log('[Discord] No bot token or channel configured, skipping');
    return;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once('ready', () => {
    console.log(`[Discord] Bot logged in as ${client!.user?.tag}`);
    const ch = client!.channels.cache.get(env.DISCORD_CHANNEL_ID!);
    if (ch?.isTextBased()) {
      channel = ch as TextChannel;
    }
  });

  client.on('error', (err) => {
    console.error('[Discord] Bot error:', err.message);
  });

  try {
    await client.login(env.DISCORD_BOT_TOKEN);
  } catch (err) {
    console.error('[Discord] Failed to login:', (err as Error).message);
    client = null;
  }
}

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function getBaseUrl(): string {
  return env.CHALLENGE_CARD_BASE_URL || 'http://localhost:3001';
}

/**
 * Post a new duel challenge notification.
 */
export async function postDuelChallenge(duel: {
  id: string;
  challenger_pubkey: string;
  defender_pubkey: string | null;
  asset_symbol: string;
  stake_amount: number | string;
  stake_token: string;
  is_honor_duel: boolean;
  duration_hours: number;
}): Promise<void> {
  if (!channel) return;

  const stakeDisplay = duel.is_honor_duel
    ? 'Honor Duel (Mutagen only)'
    : `${duel.stake_amount} ${duel.stake_token}`;

  const embed = new EmbedBuilder()
    .setColor(0x00d4aa)
    .setTitle('New Duel Challenge!')
    .setDescription(
      `**${shortenPubkey(duel.challenger_pubkey)}** has challenged ` +
      `**${duel.defender_pubkey ? shortenPubkey(duel.defender_pubkey) : 'an opponent'}** ` +
      `to a ${duel.asset_symbol} trading duel!`
    )
    .addFields(
      { name: 'Asset', value: duel.asset_symbol, inline: true },
      { name: 'Duration', value: `${duel.duration_hours}h`, inline: true },
      { name: 'Stake', value: stakeDisplay, inline: true },
    )
    .setImage(`${getBaseUrl()}/api/arena/challenge/${duel.id}/card.png`)
    .setTimestamp()
    .setFooter({ text: 'AdrenaX Arena' });

  try {
    await channel.send({
      embeds: [embed],
      components: [{
        type: 1, // ActionRow
        components: [{
          type: 2, // Button
          style: 5, // Link
          label: 'View Challenge',
          url: `${getBaseUrl()}/arena/challenge/${duel.id}`,
        }, {
          type: 2,
          style: 5,
          label: 'Spectate',
          url: `${getBaseUrl()}/arena/duels/${duel.id}`,
        }],
      }],
    });
  } catch (err) {
    console.error('[Discord] Failed to post challenge:', (err as Error).message);
  }
}

/**
 * Post a duel accepted notification.
 */
export async function postDuelAccepted(duel: {
  id: string;
  challenger_pubkey: string;
  defender_pubkey: string;
  asset_symbol: string;
  duration_hours: number;
}): Promise<void> {
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle('Duel Accepted!')
    .setDescription(
      `**${shortenPubkey(duel.defender_pubkey)}** accepted the ${duel.asset_symbol} duel ` +
      `against **${shortenPubkey(duel.challenger_pubkey)}**! The battle is ON!`
    )
    .addFields(
      { name: 'Duration', value: `${duel.duration_hours}h`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'AdrenaX Arena' });

  try {
    await channel.send({
      embeds: [embed],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 5,
          label: 'Watch Live',
          url: `${getBaseUrl()}/arena/duels/${duel.id}`,
        }],
      }],
    });
  } catch (err) {
    console.error('[Discord] Failed to post accepted:', (err as Error).message);
  }
}

/**
 * Post a duel result notification.
 */
export async function postDuelResult(duel: {
  id: string;
  challenger_pubkey: string;
  defender_pubkey: string | null;
  asset_symbol: string;
  winner_pubkey: string | null;
  challenger_roi: number | string | null;
  defender_roi: number | string | null;
  is_honor_duel: boolean;
  stake_amount: number | string;
  stake_token: string;
}): Promise<void> {
  if (!channel) return;

  const challengerROI = Number(duel.challenger_roi) || 0;
  const defenderROI = Number(duel.defender_roi) || 0;

  let resultText: string;
  if (!duel.winner_pubkey) {
    resultText = 'Both fighters forfeited — no trades were made!';
  } else {
    const winnerShort = shortenPubkey(duel.winner_pubkey);
    const loser = duel.winner_pubkey === duel.challenger_pubkey
      ? duel.defender_pubkey
      : duel.challenger_pubkey;
    const loserShort = loser ? shortenPubkey(loser) : 'opponent';
    resultText = `**${winnerShort}** defeated **${loserShort}** in the ${duel.asset_symbol} duel!`;
  }

  const embed = new EmbedBuilder()
    .setColor(duel.winner_pubkey ? 0xffd700 : 0x71717a)
    .setTitle('Duel Result')
    .setDescription(resultText)
    .addFields(
      { name: 'Challenger ROI', value: `${challengerROI >= 0 ? '+' : ''}${challengerROI.toFixed(2)}%`, inline: true },
      { name: 'Defender ROI', value: `${defenderROI >= 0 ? '+' : ''}${defenderROI.toFixed(2)}%`, inline: true },
    )
    .setImage(`${getBaseUrl()}/api/arena/challenge/${duel.id}/card.png`)
    .setTimestamp()
    .setFooter({ text: 'AdrenaX Arena' });

  if (!duel.is_honor_duel && duel.winner_pubkey && Number(duel.stake_amount) > 0) {
    const totalStake = Number(duel.stake_amount) * 2;
    const prize = totalStake * 0.98;
    embed.addFields({
      name: 'Prize',
      value: `${prize.toFixed(2)} ${duel.stake_token} (2% protocol fee)`,
      inline: false,
    });
  }

  try {
    await channel.send({
      embeds: [embed],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 5,
          label: 'View Details',
          url: `${getBaseUrl()}/arena/duels/${duel.id}`,
        }],
      }],
    });
  } catch (err) {
    console.error('[Discord] Failed to post result:', (err as Error).message);
  }
}

/**
 * Post a gauntlet registration open notification.
 */
export async function postGauntletOpen(competition: {
  id: string;
  config: Record<string, unknown>;
  start_time: string | Date;
}): Promise<void> {
  if (!channel) return;

  const config = competition.config as any;

  const embed = new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle('The Gauntlet is Open!')
    .setDescription(
      `**${config?.name || 'The Gauntlet'}** registration is now open! ` +
      `Top ${config?.maxParticipants || 16} traders battle it out for ${config?.durationHours || 24}h.`
    )
    .addFields(
      { name: 'Max Participants', value: String(config?.maxParticipants || 16), inline: true },
      { name: 'Duration', value: `${config?.durationHours || 24}h`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'AdrenaX Arena' });

  try {
    await channel.send({
      embeds: [embed],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 5,
          label: 'Register Now',
          url: `${getBaseUrl()}/arena/gauntlet/${competition.id}`,
        }],
      }],
    });
  } catch (err) {
    console.error('[Discord] Failed to post gauntlet open:', (err as Error).message);
  }
}

/**
 * Post gauntlet results.
 */
export async function postGauntletResults(
  competitionId: string,
  name: string,
  rankings: Array<{ rank: number; pubkey: string; roi: number; trades: number }>
): Promise<void> {
  if (!channel) return;

  const medals = ['', '🥇', '🥈', '🥉'];
  const top3 = rankings.slice(0, 3)
    .map(r => `${medals[r.rank] || `#${r.rank}`} **${shortenPubkey(r.pubkey)}** — ${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(2)}% ROI (${r.trades} trades)`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`${name} — Results`)
    .setDescription(`The Gauntlet is over! Here are the top performers:\n\n${top3}`)
    .addFields(
      { name: 'Total Participants', value: String(rankings.length), inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'AdrenaX Arena' });

  try {
    await channel.send({
      embeds: [embed],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 5,
          label: 'Full Leaderboard',
          url: `${getBaseUrl()}/arena/gauntlet/${competitionId}`,
        }],
      }],
    });
  } catch (err) {
    console.error('[Discord] Failed to post gauntlet results:', (err as Error).message);
  }
}

/**
 * Gracefully destroy the Discord client.
 */
export async function destroyDiscordBot(): Promise<void> {
  if (client) {
    client.destroy();
    client = null;
    channel = null;
  }
}
