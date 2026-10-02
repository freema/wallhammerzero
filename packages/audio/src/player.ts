// The sequencer and the mixer: a song played as a stream of samples.
//
// `SongPlayer.process` fills a block of any size. The sequencer counts samples: a step starts
// at floor(step * sampleRate * 60 / (tempo * stepsPerBeat)), an integer, so the output does
// not depend on the block size, on a clock or on the host. The same class runs in the CLI
// (offline, one big block), in the studio (a worker) and in the game (an AudioWorklet).
//
// Signal path, per channel: up to 3 voices -> echo -> gain and pan -> a stereo stem (32-bit
// floats). Master: the stems times their layer gain, summed in channel order -> the state's
// low-pass. There is no limiter: the CLI measures the peak and the loudness instead, and the
// sidecar's `trimDb` is the correction (docs/audio.md).
//
// A looping song jumps from its end to its loop point without stopping anything: releases
// and echoes ring across the seam.

import { hash32, mulDiv } from "@whz/det";
import { EchoLine, Lowpass } from "./filters.ts";
import { DEFAULT_VELOCITY } from "./grid.ts";
import type { Instrument } from "./instrument.ts";
import { channelsOfState, instrumentsOf } from "./song.ts";
import type { Song, TimelineNote } from "./song.ts";
import { A4_MIDI, dbToGain, panGains, tanRatio } from "./tables.ts";
import { secondsToFrames, Voice } from "./voice.ts";

export const DEFAULT_SAMPLE_RATE = 48000;
/** The sample rates the synth accepts. */
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 96000;
/** Voices per channel: the note that sounds, and the release tails of the two before it. */
export const VOICES_PER_CHANNEL = 3;
/** The beats a change of state takes to fade, unless `setState` is told otherwise. */
export const DEFAULT_FADE_BEATS = 1;

/** The most samples rendered in one go inside `process`; blocks are cut into such chunks. */
const CHUNK = 1024;

/** A stereo signal as two arrays of 32-bit floats. */
export interface StereoBuffer {
  readonly left: Float32Array;
  readonly right: Float32Array;
}

export interface PlayerOptions {
  /** Samples per second, 8000 to 96000 (default 48000). */
  readonly sampleRate?: number | undefined;
  /** The state to start in; null or nothing for every channel. */
  readonly state?: string | null | undefined;
  /** The orchestration to start with; null or nothing for the instruments as written. */
  readonly orchestration?: string | null | undefined;
}

/** The first sample of a step of the song. */
export function stepFrame(song: Song, step: number, sampleRate: number): number {
  return mulDiv(step, sampleRate * 60, song.tempo * song.stepsPerBeat);
}

function checkSampleRate(sampleRate: number): number {
  if (!Number.isInteger(sampleRate) || sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) {
    throw new RangeError(`the sample rate must be an integer from ${MIN_SAMPLE_RATE} to ${MAX_SAMPLE_RATE}, got ${String(sampleRate)}`);
  }
  return sampleRate;
}

/** One channel: its voices, its echo and its place in the stereo image. */
class Strip {
  readonly left = new Float32Array(CHUNK);
  readonly right = new Float32Array(CHUNK);
  private readonly mono = new Float64Array(CHUNK);
  private readonly voices: Voice[];
  private readonly echo: EchoLine | null;
  private readonly gainLeft: number;
  private readonly gainRight: number;
  private readonly sampleRate: number;
  private next = 0;
  private held: Voice | null = null;
  private lastCents: number | null = null;

  constructor(song: Song, channelIndex: number, sampleRate: number) {
    const channel = song.channels[channelIndex] as Song["channels"][number];
    this.sampleRate = sampleRate;
    this.voices = Array.from({ length: VOICES_PER_CHANNEL }, (_, voice) => new Voice(sampleRate, hash32(channelIndex, voice, song.seed)));
    const gain = dbToGain(channel.gainDb);
    const pan = panGains(channel.pan);
    this.gainLeft = gain * pan.left;
    this.gainRight = gain * pan.right;
    this.echo =
      channel.echo === null
        ? null
        : new EchoLine(Math.floor((channel.echo.beats * 60 * sampleRate) / song.tempo), channel.echo.feedback, channel.echo.mix, sampleRate);
  }

  noteOn(note: TimelineNote, instrument: Instrument): void {
    const gain = note.velocity / DEFAULT_VELOCITY;
    if (instrument.kind === "kit") {
      const drum = note.drum === null ? undefined : instrument.drums[note.drum];
      if (drum === undefined) return;
      // A drum sounds for its attack and decay, then releases: it needs no note-off.
      const gateFrames = secondsToFrames(drum.env.a + drum.env.d, this.sampleRate);
      this.take().noteOn({ tone: drum, cents: (drum.pitch - A4_MIDI) * 100, arp: null, gain, glideFromCents: null, gateFrames });
      return;
    }
    if (note.drum !== null) return;
    // A melodic channel plays one note at a time: the one before it starts its release.
    this.noteOff();
    const cents = (note.midi - A4_MIDI) * 100;
    const { tone } = instrument;
    const voice = this.take();
    voice.noteOn({ tone, cents, arp: note.arp, gain, glideFromCents: tone.glide > 0 ? this.lastCents : null, gateFrames: -1 });
    this.held = voice;
    this.lastCents = cents;
  }

  noteOff(): void {
    if (this.held !== null) this.held.noteOff();
    this.held = null;
  }

  /** The next voice in turn. The one it replaces is the oldest, three notes back. */
  private take(): Voice {
    const voice = this.voices[this.next] as Voice;
    this.next = (this.next + 1) % this.voices.length;
    return voice;
  }

  /** Renders the next `frames` samples of the channel into `left` and `right`. */
  render(frames: number): void {
    const { mono, left, right, echo, gainLeft, gainRight } = this;
    for (let i = 0; i < frames; i += 1) mono[i] = 0;
    for (const voice of this.voices) voice.render(mono, 0, frames);
    for (let i = 0; i < frames; i += 1) {
      const sample = echo === null ? (mono[i] as number) : echo.process(mono[i] as number);
      left[i] = sample * gainLeft;
      right[i] = sample * gainRight;
    }
  }
}

/**
 * The master: layer gains per channel and the state's low-pass, with their fades. The player
 * uses it on the stems it has just rendered; `mixState` (render.ts) uses it on stored stems,
 * which is why it is a class of its own.
 */
export class MasterBus {
  private readonly song: Song;
  private readonly sampleRate: number;
  private readonly gains: Float64Array;
  private readonly targets: Float64Array;
  private readonly steps: Float64Array;
  private readonly filterLeft: Lowpass | null;
  private readonly filterRight: Lowpass | null;
  private wet = 0;
  private wetTarget = 0;
  private wetStep = 0;
  private gTarget = 0;
  private gStep = 0;
  private fadeLeft = 0;

  constructor(song: Song, sampleRate: number, state: string | null) {
    this.song = song;
    this.sampleRate = sampleRate;
    const count = song.channels.length;
    this.gains = new Float64Array(count);
    this.targets = new Float64Array(count);
    this.steps = new Float64Array(count);
    const filtered = Object.values(song.states).some((candidate) => candidate.lowpassHz !== null);
    this.filterLeft = filtered ? new Lowpass(20000, sampleRate) : null;
    this.filterRight = filtered ? new Lowpass(20000, sampleRate) : null;
    this.setState(state, 0);
  }

  /** Moves to a state over `fadeFrames` samples (0: at once). */
  setState(state: string | null, fadeFrames: number): void {
    const playing = channelsOfState(this.song, state);
    const lowpassHz = state === null ? null : ((this.song.states[state] as Song["states"][string]).lowpassHz ?? null);
    const frames = Math.max(0, Math.floor(fadeFrames));
    for (let c = 0; c < this.gains.length; c += 1) {
      this.targets[c] = (playing[c] as boolean) ? 1 : 0;
      this.steps[c] = frames > 0 ? ((this.targets[c] as number) - (this.gains[c] as number)) / frames : 0;
    }
    this.wetTarget = lowpassHz === null ? 0 : 1;
    if (this.filterLeft !== null && this.filterRight !== null) {
      const current = this.filterLeft.coefficient;
      // With no low-pass to move to, the cutoff stays where it is while the filter fades out.
      this.gTarget = lowpassHz === null ? current : tanRatio(lowpassHz / this.sampleRate);
      if (this.wet === 0 || frames === 0) {
        // Nothing of the filter is heard yet: it can start at its new cutoff.
        this.filterLeft.setG(this.gTarget);
        this.filterRight.setG(this.gTarget);
        this.gStep = 0;
      } else this.gStep = (this.gTarget - current) / frames;
    }
    this.wetStep = frames > 0 ? (this.wetTarget - this.wet) / frames : 0;
    this.fadeLeft = frames;
    if (frames === 0) this.finishFade();
  }

  private finishFade(): void {
    this.gains.set(this.targets);
    this.wet = this.wetTarget;
    if (this.filterLeft !== null && this.filterRight !== null && this.filterLeft.coefficient !== this.gTarget) {
      this.filterLeft.setG(this.gTarget);
      this.filterRight.setG(this.gTarget);
    }
  }

  /**
   * Mixes `frames` samples of the stems (from `stemOffset`) into `left` and `right` (from
   * `outOffset`).
   */
  mix(stems: readonly StereoBuffer[], stemOffset: number, left: Float32Array, right: Float32Array, outOffset: number, frames: number): void {
    const { gains, steps, filterLeft, filterRight } = this;
    const count = gains.length;
    for (let i = 0; i < frames; i += 1) {
      if (this.fadeLeft > 0) {
        this.fadeLeft -= 1;
        if (this.fadeLeft === 0) this.finishFade();
        else {
          for (let c = 0; c < count; c += 1) gains[c] = (gains[c] as number) + (steps[c] as number);
          this.wet += this.wetStep;
          if (this.gStep !== 0 && filterLeft !== null && filterRight !== null) {
            const g = filterLeft.coefficient + this.gStep;
            filterLeft.setG(g);
            filterRight.setG(g);
          }
        }
      }
      let l = 0;
      let r = 0;
      for (let c = 0; c < count; c += 1) {
        const gain = gains[c] as number;
        if (gain === 0) continue;
        const stem = stems[c] as StereoBuffer;
        l += gain * (stem.left[stemOffset + i] as number);
        r += gain * (stem.right[stemOffset + i] as number);
      }
      if (filterLeft !== null && filterRight !== null) {
        // The filter always runs, so it is warm when a state fades it in.
        const fl = filterLeft.process(l);
        const fr = filterRight.process(r);
        l += this.wet * (fl - l);
        r += this.wet * (fr - r);
      }
      left[outOffset + i] = l;
      right[outOffset + i] = r;
    }
  }
}

interface PlayerEvent {
  readonly frame: number;
  readonly channel: number;
  /** The note that starts; null for the end of the channel's note. */
  readonly note: TimelineNote | null;
}

/** Where a player is in its song. */
export interface PlayerPosition {
  /** Samples from the start of the song (it jumps back when the song loops). */
  readonly frame: number;
  /** The bar of the timeline, counted from 0. */
  readonly timelineBar: number;
  readonly orderIndex: number;
  readonly section: string;
  /** The bar inside the section, counted from 0. */
  readonly bar: number;
  /** How many times the song has jumped back to its loop point. */
  readonly loops: number;
  /** True once a song that does not loop has played its last bar (its tails may still ring). */
  readonly ended: boolean;
}

export class SongPlayer {
  readonly song: Song;
  readonly sampleRate: number;
  /** The length of the song in samples: where it ends, or jumps back. */
  readonly endFrame: number;
  /** The sample the song jumps back to; -1 if it does not loop. */
  readonly loopStartFrame: number;
  /** The first sample of every bar of the timeline, and `endFrame` after the last. */
  readonly barFrames: readonly number[];

  private readonly strips: Strip[];
  private readonly master: MasterBus;
  private readonly events: PlayerEvent[];
  private readonly loopCursor: number;
  private instruments: Readonly<Record<string, Instrument>>;
  private cursor = 0;
  private frame = 0;
  private loops = 0;
  private finished = false;
  private currentState: string | null;
  private currentOrchestration: string | null;
  private pendingState: { readonly state: string | null; readonly fadeBeats: number } | null = null;
  private pendingOrchestration: { readonly orchestration: string | null } | null = null;

  constructor(song: Song, options: PlayerOptions = {}) {
    this.song = song;
    this.sampleRate = checkSampleRate(options.sampleRate ?? DEFAULT_SAMPLE_RATE);
    this.currentState = options.state ?? null;
    this.currentOrchestration = options.orchestration ?? null;
    this.instruments = instrumentsOf(song, this.currentOrchestration);
    this.master = new MasterBus(song, this.sampleRate, this.currentState);
    this.strips = song.channels.map((_, index) => new Strip(song, index, this.sampleRate));

    const { timeline } = song;
    const frameOf = (step: number): number => stepFrame(song, step, this.sampleRate);
    this.endFrame = frameOf(timeline.totalSteps);
    this.loopStartFrame = timeline.loopStartStep === null ? -1 : frameOf(timeline.loopStartStep);
    this.barFrames = Array.from({ length: timeline.bars.length + 1 }, (_, bar) => frameOf(bar * timeline.stepsPerBar));

    const events: PlayerEvent[] = [];
    for (const note of timeline.notes) {
      events.push({ frame: frameOf(note.step), channel: note.channel, note });
      if (note.drum === null) events.push({ frame: frameOf(note.step + note.steps), channel: note.channel, note: null });
    }
    // At one sample: ends before starts, so a note-off never stops the note that follows it.
    events.sort((a, b) => a.frame - b.frame || (a.note === null ? 0 : 1) - (b.note === null ? 0 : 1) || a.channel - b.channel);
    this.events = events;
    let loopCursor = 0;
    while (loopCursor < events.length && (events[loopCursor] as PlayerEvent).frame < this.loopStartFrame) loopCursor += 1;
    this.loopCursor = loopCursor;
  }

  /** The state that is playing (a change asked for with `setState` shows here once it starts). */
  get state(): string | null {
    return this.currentState;
  }

  get orchestration(): string | null {
    return this.currentOrchestration;
  }

  /**
   * Asks for another state. It starts at the next bar line (at once, if the player is on
   * one), and the layers fade over `fadeBeats` beats.
   */
  setState(state: string | null, fadeBeats: number = DEFAULT_FADE_BEATS): void {
    channelsOfState(this.song, state);
    if (!(fadeBeats >= 0 && fadeBeats <= 64)) throw new RangeError(`fadeBeats must be between 0 and 64, got ${String(fadeBeats)}`);
    this.pendingState = { state, fadeBeats };
  }

  /** Asks for another orchestration. Notes that start from the next bar line on use it. */
  setOrchestration(orchestration: string | null): void {
    instrumentsOf(this.song, orchestration);
    this.pendingOrchestration = { orchestration };
  }

  position(): PlayerPosition {
    const { bars } = this.song.timeline;
    let index = 0;
    while (index + 1 < bars.length && (this.barFrames[index + 1] as number) <= this.frame) index += 1;
    const bar = bars[index] as Song["timeline"]["bars"][number];
    return { frame: this.frame, timelineBar: index, orderIndex: bar.orderIndex, section: bar.section, bar: bar.bar, loops: this.loops, ended: this.finished };
  }

  /** The first bar line after the current sample (the end of the song is one). */
  private nextBarFrame(): number {
    for (const frame of this.barFrames) if (frame > this.frame) return frame;
    return this.endFrame;
  }

  private applyPending(): void {
    if (this.pendingOrchestration !== null) {
      this.currentOrchestration = this.pendingOrchestration.orchestration;
      this.instruments = instrumentsOf(this.song, this.currentOrchestration);
      this.pendingOrchestration = null;
    }
    if (this.pendingState !== null) {
      this.currentState = this.pendingState.state;
      this.master.setState(this.currentState, Math.floor((this.pendingState.fadeBeats * 60 * this.sampleRate) / this.song.tempo));
      this.pendingState = null;
    }
  }

  /** Starts and ends every note whose sample has come. */
  private fire(): void {
    const { events } = this;
    while (this.cursor < events.length && (events[this.cursor] as PlayerEvent).frame <= this.frame) {
      const event = events[this.cursor] as PlayerEvent;
      const strip = this.strips[event.channel] as Strip;
      if (event.note === null) strip.noteOff();
      else {
        const channel = this.song.channels[event.channel] as Song["channels"][number];
        strip.noteOn(event.note, this.instruments[channel.instrument] as Instrument);
      }
      this.cursor += 1;
    }
  }

  /**
   * Renders the next `frames` samples into `left` and `right`, starting at `offset`.
   * @param stems if given, one buffer per channel: each channel's own signal (before the
   *              layer gains and the master low-pass) is written there too, at `offset`
   */
  process(left: Float32Array, right: Float32Array, frames: number = left.length, offset = 0, stems?: readonly StereoBuffer[]): void {
    let done = 0;
    while (done < frames) {
      // A change that was asked for starts on a bar line, before the notes of that bar.
      const pending = this.pendingState !== null || this.pendingOrchestration !== null;
      if (pending && (this.finished || this.barFrames.includes(this.frame))) this.applyPending();
      if (!this.finished) {
        this.fire();
        if (this.frame === this.endFrame) {
          if (this.loopStartFrame >= 0) {
            this.frame = this.loopStartFrame;
            this.cursor = this.loopCursor;
            this.loops += 1;
            continue;
          }
          this.finished = true;
        }
      }

      let count = Math.min(frames - done, CHUNK);
      if (!this.finished) {
        const nextEvent = this.cursor < this.events.length ? (this.events[this.cursor] as PlayerEvent).frame : this.endFrame;
        count = Math.min(count, nextEvent - this.frame, this.endFrame - this.frame);
        if (this.pendingState !== null || this.pendingOrchestration !== null) count = Math.min(count, this.nextBarFrame() - this.frame);
      }
      for (const strip of this.strips) strip.render(count);
      this.master.mix(this.strips, 0, left, right, offset + done, count);
      if (stems !== undefined) {
        this.strips.forEach((strip, c) => {
          const stem = stems[c] as StereoBuffer;
          stem.left.set(strip.left.subarray(0, count), offset + done);
          stem.right.set(strip.right.subarray(0, count), offset + done);
        });
      }
      if (!this.finished) this.frame += count;
      done += count;
    }
  }
}
