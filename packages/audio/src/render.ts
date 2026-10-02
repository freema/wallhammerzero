// Offline rendering: a whole song as buffers, with one stem per channel, and the PCM hash
// that is its identity.
//
// A WAV file is a build output. What is checked in is the song, and the hash of its 16-bit
// PCM in the sidecar: the same song and the same synth give the same hash on every engine.

import { Fnv1a64 } from "@whz/det";
import { DEFAULT_SAMPLE_RATE, MasterBus, SongPlayer } from "./player.ts";
import type { StereoBuffer } from "./player.ts";
import type { Song } from "./song.ts";

/**
 * Which part of the stream a render is.
 *
 * - `steady`: for a song that loops, the loop as it sounds once it has come round: the second
 *   pass from the loop point to the end, with the releases and echoes of the first pass
 *   ringing over its start. Played end to start, it is seamless. This is the default, and
 *   what the sidecar's hash is taken over.
 * - `first`: the stream from a cold start to the end of the first pass, the intro included.
 *   Nothing rings over its start, and what rings at its end is cut.
 *
 * A song that does not loop (a jingle) has one render: from its start until it has rung out.
 */
export type RenderPass = "steady" | "first";

export interface RenderOptions {
  /** Samples per second (default 48000). */
  readonly sampleRate?: number | undefined;
  /** The state to render; null or nothing for every channel. */
  readonly state?: string | null | undefined;
  /** The orchestration to render; null or nothing for the instruments as written. */
  readonly orchestration?: string | null | undefined;
  /** See `RenderPass`. Ignored for a song that does not loop. */
  readonly pass?: RenderPass | undefined;
}

/** One channel of a render, before the layer gains and the master low-pass. */
export interface Stem extends StereoBuffer {
  /** The channel's name. */
  readonly name: string;
}

export interface SongRender extends StereoBuffer {
  readonly sampleRate: number;
  /** The length of the render in samples. */
  readonly frames: number;
  /** True if the render is a loop: its end runs into its start. */
  readonly loop: boolean;
  readonly pass: RenderPass;
  readonly state: string | null;
  readonly orchestration: string | null;
  /** One stem per channel, in channel order, each `frames` long. */
  readonly stems: readonly Stem[];
  /**
   * The first sample of every bar inside the render, with the bar's index in the song's
   * timeline. For pictures and for anchors.
   */
  readonly bars: readonly { readonly frame: number; readonly timelineBar: number }[];
  /** How many samples were rendered before the first sample of the render (the first pass). */
  readonly leadFrames: number;
  /** The stems from the cold start on: `leadFrames + frames` long. `mixState` needs them. */
  readonly fullStems: readonly StereoBuffer[];
}

/** A jingle is rendered until every channel has been this quiet for one block, or for MAX_TAIL_SEC. */
const SILENCE = 0.0001;
const TAIL_BLOCK = 1024;
const MAX_TAIL_SEC = 5;

function peak(stems: readonly StereoBuffer[], from: number, to: number): number {
  let max = 0;
  for (const stem of stems) {
    for (let i = from; i < to; i += 1) {
      const l = Math.abs(stem.left[i] as number);
      const r = Math.abs(stem.right[i] as number);
      if (l > max) max = l;
      if (r > max) max = r;
    }
  }
  return max;
}

/** Renders a song offline. The same song and options always give the same samples. */
export function renderSong(song: Song, options: RenderOptions = {}): SongRender {
  const state = options.state ?? null;
  const orchestration = options.orchestration ?? null;
  const player = new SongPlayer(song, { sampleRate: options.sampleRate ?? DEFAULT_SAMPLE_RATE, state, orchestration });
  const { sampleRate, endFrame, loopStartFrame } = player;
  const loops = loopStartFrame >= 0;
  const pass: RenderPass = loops ? (options.pass ?? "steady") : "first";

  const loopFrames = endFrame - loopStartFrame;
  const leadFrames = loops && pass === "steady" ? endFrame : 0;
  const maxFrames = loops ? (pass === "steady" ? endFrame + loopFrames : endFrame) : endFrame + MAX_TAIL_SEC * sampleRate;

  const left = new Float32Array(maxFrames);
  const right = new Float32Array(maxFrames);
  const full = song.channels.map(() => ({ left: new Float32Array(maxFrames), right: new Float32Array(maxFrames) }));
  let total = loops ? maxFrames : endFrame;
  player.process(left, right, total, 0, full);
  if (!loops) {
    // Ring out: block by block until every channel is quiet.
    while (total + TAIL_BLOCK <= maxFrames) {
      player.process(left, right, TAIL_BLOCK, total, full);
      total += TAIL_BLOCK;
      if (peak(full, total - TAIL_BLOCK, total) < SILENCE) break;
    }
  }

  const frames = total - leadFrames;
  const firstBar = loops && pass === "steady" ? (song.timeline.loopStartStep as number) / song.timeline.stepsPerBar : 0;
  const bars = song.timeline.bars.slice(firstBar).map((_, i) => ({
    frame: (player.barFrames[firstBar + i] as number) - (player.barFrames[firstBar] as number),
    timelineBar: firstBar + i,
  }));
  return {
    sampleRate,
    frames,
    loop: loops,
    pass,
    state,
    orchestration,
    left: left.subarray(leadFrames, total),
    right: right.subarray(leadFrames, total),
    stems: full.map((stem, c) => ({
      name: (song.channels[c] as Song["channels"][number]).name,
      left: stem.left.subarray(leadFrames, total),
      right: stem.right.subarray(leadFrames, total),
    })),
    bars,
    leadFrames,
    fullStems: full.map((stem) => ({ left: stem.left.subarray(0, total), right: stem.right.subarray(0, total) })),
  };
}

/**
 * The mix of another state, made from the stems of a render instead of running the synth
 * again. It is sample for sample what `renderSong` gives for that state.
 */
export function mixState(song: Song, render: SongRender, state: string | null): StereoBuffer {
  const total = render.leadFrames + render.frames;
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  new MasterBus(song, render.sampleRate, state).mix(render.fullStems, 0, left, right, 0, total);
  return { left: left.subarray(render.leadFrames), right: right.subarray(render.leadFrames) };
}

// ---------------------------------------------------------------------------------------
// PCM

/**
 * 16-bit PCM, the channels interleaved: `round(sample * 32767)`, limited to -32768..32767,
 * halves rounded up. This is what a WAV file holds and what the hash is taken over.
 */
export function toPcm16(channels: readonly Float32Array[]): Int16Array {
  const count = channels.length;
  const frames = count === 0 ? 0 : (channels[0] as Float32Array).length;
  const pcm = new Int16Array(frames * count);
  for (let c = 0; c < count; c += 1) {
    const channel = channels[c] as Float32Array;
    if (channel.length !== frames) throw new RangeError("toPcm16: the channels must have the same length");
    for (let i = 0; i < frames; i += 1) {
      const value = Math.floor((channel[i] as number) * 32767 + 0.5);
      pcm[i * count + c] = value > 32767 ? 32767 : value < -32768 ? -32768 : value;
    }
  }
  return pcm;
}

/** How many samples of a signal lie outside -1..1 and are clipped by `toPcm16`. */
export function clippedSamples(channels: readonly Float32Array[]): number {
  let count = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const value = channel[i] as number;
      if (value > 1 || value < -1) count += 1;
    }
  }
  return count;
}

/** The tag at the start of the hashed bytes. A change of the layout changes the tag. */
export const PCM_HASH_TAG = "wz.pcm16/1";

/**
 * The hash of 16-bit PCM: FNV-1a 64 (from @whz/det) over the tag, the sample rate (u32), the
 * channel count (u16), the number of samples per channel (u32) and then every sample as two
 * bytes, low byte first. 16 hexadecimal digits.
 */
export function pcmHash(pcm: Int16Array, channels: number, sampleRate: number): string {
  if (!Number.isInteger(channels) || channels < 1 || pcm.length % channels !== 0) throw new RangeError("pcmHash: the sample count does not fit the channel count");
  const hasher = new Fnv1a64().ascii(PCM_HASH_TAG).u32(sampleRate).u16(channels).u32(pcm.length / channels);
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = pcm[i] as number;
    hasher.byte(sample).byte(sample >> 8);
  }
  return hasher.hex();
}

/** The PCM hash of a stereo signal. */
export function stereoHash(buffer: StereoBuffer, sampleRate: number): string {
  return pcmHash(toPcm16([buffer.left, buffer.right]), 2, sampleRate);
}

/** The PCM hash of a one-channel signal. */
export function monoHash(samples: Float32Array, sampleRate: number): string {
  return pcmHash(toPcm16([samples]), 1, sampleRate);
}
