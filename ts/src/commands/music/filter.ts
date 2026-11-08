/**
 * `/music filter` — apply or clear audio filters on the active player.
 *
 * Uses lavalink-client's built-in `player.filterManager`.
 * Presets:
 *   - Bass Boost (custom low-end EQ boost)
 *   - Nightcore (speed + pitch up via timescale)
 *   - Vaporwave (slow + pitch down via timescale)
 *   - Karaoke (center vocal cut)
 *   - 8D Audio (stereo rotation)
 *   - Soft (low pass filter)
 *   - Clear (reset all filters and EQ)
 */
import { Declare, Options, SubCommand, createStringOption, type CommandContext } from 'seyfert';
import { lavalink } from '../../music/manager';
import { errorCard, successCard } from '../../cards/common';
import { E } from '../../components/emoji';
import { requireSameVoice } from '../../music/guards';
import type { Player } from 'lavalink-client';

interface FilterPreset {
  label: string;
  emoji: string;
  apply: (player: Player) => Promise<void>;
}

const PRESETS: Record<string, FilterPreset> = {
  bassboost: {
    label: 'Bass Boost',
    emoji: E.VOLUME_UP,
    apply: async (player) => {
      await player.filterManager.resetFilters();
      await player.filterManager.setEQ([
        { band: 0, gain: 0.3 },
        { band: 1, gain: 0.25 },
        { band: 2, gain: 0.2 },
        { band: 3, gain: 0.1 },
        { band: 4, gain: 0.05 },
        { band: 5, gain: 0.0 },
      ]);
    },
  },
  nightcore: {
    label: 'Nightcore',
    emoji: E.STAR,
    apply: async (player) => {
      await player.filterManager.resetFilters();
      await player.filterManager.clearEQ();
      await player.filterManager.toggleNightcore();
    },
  },
  vaporwave: {
    label: 'Vaporwave',
    emoji: E.SPARK,
    apply: async (player) => {
      await player.filterManager.resetFilters();
      await player.filterManager.clearEQ();
      await player.filterManager.toggleVaporwave();
    },
  },
  karaoke: {
    label: 'Karaoke',
    emoji: E.MIC,
    apply: async (player) => {
      await player.filterManager.resetFilters();
      await player.filterManager.clearEQ();
      await player.filterManager.toggleKaraoke();
    },
  },
  '8d': {
    label: '8D Audio',
    emoji: E.HEADPHONES,
    apply: async (player) => {
      await player.filterManager.resetFilters();
      await player.filterManager.clearEQ();
      await player.filterManager.toggleRotation();
    },
  },
  soft: {
    label: 'Soft',
    emoji: E.NOTE,
    apply: async (player) => {
      await player.filterManager.resetFilters();
      await player.filterManager.clearEQ();
      await player.filterManager.toggleLowPass();
    },
  },
  clear: {
    label: 'Clear (no filter)',
    emoji: E.OK,
    apply: async (player) => {
      await player.filterManager.resetFilters();
      await player.filterManager.clearEQ();
    },
  },
};

const options = {
  preset: createStringOption({
    description: 'Audio filter to apply',
    required: true,
    choices: [
      { name: '🔊 Bass Boost',   value: 'bassboost' },
      { name: '⭐ Nightcore',     value: 'nightcore' },
      { name: '✨ Vaporwave',     value: 'vaporwave' },
      { name: '🎤 Karaoke',       value: 'karaoke'   },
      { name: '🎧 8D Audio',      value: '8d'        },
      { name: '♪  Soft',         value: 'soft'      },
      { name: '✔  Clear (reset)', value: 'clear'     },
    ],
  }),
};

@Declare({
  name: 'filter',
  description: 'Apply an audio filter preset to the current track.',
})
@Options(options)
export default class FilterCommand extends SubCommand {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) return;

    if (!(await requireSameVoice(ctx, ctx.guildId, 'change filters'))) return;

    const player = lavalink().getPlayer(ctx.guildId)!;

    const presetKey = ctx.options.preset;
    const preset = PRESETS[presetKey];
    if (!preset) {
      await ctx.editOrReply(errorCard('Unknown filter preset.').toMessage());
      return;
    }

    try {
      await preset.apply(player);
    } catch (err: any) {
      await ctx.editOrReply(
        errorCard(`Failed to apply filter: ${err?.message ?? 'Unknown error'}`).toMessage(),
      );
      return;
    }

    const isClear = presetKey === 'clear';
    const msg = isClear
      ? `${preset.emoji} Filters cleared — audio is back to default.`
      : `${preset.emoji} **${preset.label}** filter applied.`;

    await ctx.editOrReply(successCard(msg).toMessage());
  }
}
