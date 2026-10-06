// The player's model, without React, the DOM or a clock of its own: which clip and facing is
// selected, where the time is, how fast it runs, and how the picture is shown (zoom, background,
// grid, onion skin). The frame loop passes the real time that went by (`advance`); buttons,
// keys and the scrubber call the rest. React reads `state()` (app/preview/player.tsx), and so
// does a script (`window.__studio.player`).
//
// Time is in milliseconds from the start of the selected clip. Which frame that is, is asked
// of the runtime's clip player (`sampleClip`), the same function a game uses.

import { clipDuration, frameStart, sampleClip } from "@whz/runtime";
import type { ClipTiming } from "@whz/runtime";

/** The speeds of the player, slowest first. Keys 1 to 5 pick them. */
export const SPEEDS: readonly number[] = [0.1, 0.25, 0.5, 1, 2];
export const DEFAULT_SPEED = 1;

/** The player's integer zooms (D22: integer zoom only). */
export const PLAYER_ZOOM_MIN = 1;
export const PLAYER_ZOOM_MAX = 16;
export const DEFAULT_PLAYER_ZOOM = 8;

/** What is behind the picture. `floor` is a plain tile pattern, the size of a 16 px game tile. */
export const BACKGROUNDS = ["checker", "dark", "light", "floor"] as const;
export type Background = (typeof BACKGROUNDS)[number];

/** A clip as the player needs it: an index record's clip is one. */
export interface PlayerClip extends ClipTiming {
  readonly name: string;
}

/** Everything the UI shows. The same object until something in it changes. */
export interface PlayerState {
  /** The selected clip and facing; "" before an asset was set. */
  readonly clip: string;
  readonly facing: string;
  /** The frame of the clip shown now, the number of frames, and each frame's duration in ms. */
  readonly frame: number;
  readonly frames: number;
  readonly durations: readonly number[];
  /** The length of the clip in ms. */
  readonly total: number;
  readonly playing: boolean;
  /** True when a clip that does not loop has played to its end. */
  readonly finished: boolean;
  readonly speed: number;
  /** True: the time wraps at the end of the clip. A new clip starts with its own `loop`. */
  readonly loop: boolean;
  readonly zoom: number;
  readonly background: Background;
  /** The pixel grid over the picture. */
  readonly grid: boolean;
  /** The frames before and after the current one, tinted, under it. */
  readonly onion: boolean;
}

/** What the player starts with. Everything is optional. */
export interface PlayerOptions {
  readonly clip?: string | undefined;
  readonly facing?: string | undefined;
  readonly zoom?: number | undefined;
  readonly playing?: boolean | undefined;
}

export interface Player {
  state(): PlayerState;
  /** Called after every change of `state()`. Not called for time that passes inside a frame. */
  subscribe(listener: () => void): () => void;
  /** The time inside the clip, in ms. It changes on every `advance` while playing. */
  time(): number;
  /**
   * The clips and facings of the asset shown. Call it again when the asset changes (live
   * reload): the selected clip and facing stay if they still exist, and so do the time (if it
   * still fits the clip), the zoom and the rest.
   */
  setAsset(clips: readonly PlayerClip[], facings: readonly string[]): void;
  /** `realMs` of real time went by. */
  advance(realMs: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(speed: number): void;
  /** Jumps to a time in the clip. Does not change play or pause. */
  seek(timeMs: number): void;
  /** Pauses on the start of a frame of the clip. */
  seekFrame(frame: number): void;
  /** Pauses and goes one frame on (`1`) or back (`-1`). A looping clip wraps around. */
  step(by: 1 | -1): void;
  setClip(name: string): void;
  setFacing(name: string): void;
  setLoop(loop: boolean): void;
  setZoom(zoom: number): void;
  setBackground(background: Background): void;
  setGrid(on: boolean): void;
  setOnion(on: boolean): void;
  /** Handles a key of the page (`KeyboardEvent.key`). True if the key did something. */
  key(key: string): boolean;
}

const clampInt = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(value)));

/** The zoom the player takes for a wish: a whole number from 1 to 16. */
export function pickPlayerZoom(value: number | string | null | undefined): number {
  const zoom = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(zoom) ? DEFAULT_PLAYER_ZOOM : clampInt(zoom, PLAYER_ZOOM_MIN, PLAYER_ZOOM_MAX);
}

/**
 * The frames an onion skin shows under frame `frame`: the one before and the one after. A
 * looping clip wraps around; a clip of one frame has neither, and a clip of two frames only
 * the one before (the two would be the same frame).
 */
export function onionFrames(clip: Pick<ClipTiming, "frames" | "loop">, frame: number): { prev: number | null; next: number | null } {
  const { frames } = clip;
  if (frames < 2) return { prev: null, next: null };
  const prev = frame > 0 ? frame - 1 : clip.loop ? frames - 1 : null;
  const next = frame < frames - 1 ? frame + 1 : clip.loop ? 0 : null;
  return { prev, next: next === prev ? null : next };
}

/** What a key of the player does, or null. Letters are not used: the verdict keys take them later. */
export type PlayerKey =
  | { readonly type: "toggle" }
  | { readonly type: "step"; readonly by: 1 | -1 }
  | { readonly type: "zoom"; readonly by: 1 | -1 }
  | { readonly type: "speed"; readonly speed: number };

export function playerKey(key: string): PlayerKey | null {
  if (key === " " || key === "Spacebar") return { type: "toggle" };
  if (key === "ArrowRight") return { type: "step", by: 1 };
  if (key === "ArrowLeft") return { type: "step", by: -1 };
  if (key === "+" || key === "=") return { type: "zoom", by: 1 };
  if (key === "-" || key === "_") return { type: "zoom", by: -1 };
  if (/^[1-9]$/.test(key)) {
    const speed = SPEEDS[Number(key) - 1];
    return speed === undefined ? null : { type: "speed", speed };
  }
  return null;
}

const NO_CLIP: PlayerClip = { name: "", frames: 1, durations: [1], loop: true };

export function createPlayer(options: PlayerOptions = {}): Player {
  let clips: readonly PlayerClip[] = [];
  let facings: readonly string[] = [];
  let clip: PlayerClip = NO_CLIP;
  /** The names asked for before an asset was set. */
  let wantedClip = options.clip ?? "";
  let facing = options.facing ?? "";
  let timeMs = 0;
  let playing = options.playing ?? true;
  let speed = DEFAULT_SPEED;
  let loop = true;
  let zoom = pickPlayerZoom(options.zoom);
  let background: Background = "checker";
  let grid = false;
  let onion = false;
  const listeners = new Set<() => void>();

  const timing = (): ClipTiming => ({ frames: clip.frames, durations: clip.durations, loop });
  const total = (): number => clipDuration(clip);

  let state: PlayerState | null = null;
  const build = (): PlayerState => {
    const sample = sampleClip(timing(), timeMs);
    return { clip: clip.name, facing, frame: sample.frame, frames: clip.frames, durations: clip.durations, total: total(), playing, finished: sample.finished, speed, loop, zoom, background, grid, onion };
  };
  const same = (a: PlayerState, b: PlayerState): boolean =>
    a.clip === b.clip && a.facing === b.facing && a.frame === b.frame && a.frames === b.frames && a.total === b.total && a.playing === b.playing && a.finished === b.finished &&
    a.speed === b.speed && a.loop === b.loop && a.zoom === b.zoom && a.background === b.background && a.grid === b.grid && a.onion === b.onion &&
    a.durations.length === b.durations.length && a.durations.every((ms, i) => ms === b.durations[i]);
  /** Rebuilds the state and tells the listeners if it differs. */
  const changed = (): void => {
    const next = build();
    if (state !== null && same(state, next)) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };

  /** Keeps the time inside the clip: wrapped when it loops, clamped to its ends when not. */
  const fit = (time: number): number => {
    const length = total();
    if (!Number.isFinite(time)) return 0;
    if (loop) {
      const wrapped = time % length;
      return wrapped < 0 ? wrapped + length : wrapped;
    }
    return Math.min(length, Math.max(0, time));
  };

  const select = (next: PlayerClip): void => {
    clip = next;
    wantedClip = next.name;
    loop = next.loop;
    timeMs = 0;
  };

  const player: Player = {
    state: () => (state ??= build()),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    time: () => timeMs,
    setAsset(nextClips, nextFacings) {
      clips = nextClips;
      facings = nextFacings;
      const kept = clip === NO_CLIP ? undefined : clips.find((candidate) => candidate.name === wantedClip);
      if (kept === undefined) {
        // The first asset, or the clip is gone: the clip asked for if there is one, else the first.
        const wanted = wantedClip;
        select(clips.find((candidate) => candidate.name === wanted) ?? clips[0] ?? NO_CLIP);
        // Before the first asset the wish stays, so a clip named in the URL is picked once it exists.
        if (clips.length === 0) wantedClip = wanted;
      } else {
        // The same clip, maybe with other frames or durations: keep the loop choice, and the
        // time when the clip is still that long.
        clip = kept;
        if (timeMs >= total()) timeMs = 0;
      }
      if (!facings.includes(facing)) facing = facings[0] ?? "";
      changed();
    },
    advance(realMs) {
      if (!playing || !(realMs > 0)) return;
      const next = timeMs + realMs * speed;
      if (!loop && next >= total()) {
        // A clip that does not loop holds its last frame and stops the clock.
        timeMs = total();
        playing = false;
      } else {
        timeMs = fit(next);
      }
      changed();
    },
    play() {
      if (!loop && timeMs >= total()) timeMs = 0; // from the end, play starts over
      playing = true;
      changed();
    },
    pause() {
      playing = false;
      changed();
    },
    toggle() {
      if (playing) player.pause();
      else player.play();
    },
    setSpeed(next) {
      if (!SPEEDS.includes(next)) return;
      speed = next;
      changed();
    },
    seek(time) {
      timeMs = fit(time);
      changed();
    },
    seekFrame(frame) {
      playing = false;
      timeMs = frameStart(clip, clampInt(frame, 0, clip.frames - 1));
      changed();
    },
    step(by) {
      playing = false;
      const now = sampleClip(timing(), timeMs).frame;
      let next = now + by;
      if (loop) next = (next + clip.frames) % clip.frames;
      else next = clampInt(next, 0, clip.frames - 1);
      timeMs = frameStart(clip, next);
      changed();
    },
    setClip(name) {
      const next = clips.find((candidate) => candidate.name === name);
      if (next === undefined || next === clip) return;
      select(next);
      changed();
    },
    setFacing(name) {
      if (!facings.includes(name)) return;
      facing = name;
      changed();
    },
    setLoop(next) {
      loop = next;
      timeMs = fit(timeMs);
      changed();
    },
    setZoom(next) {
      zoom = clampInt(next, PLAYER_ZOOM_MIN, PLAYER_ZOOM_MAX);
      changed();
    },
    setBackground(next) {
      if (!BACKGROUNDS.includes(next)) return;
      background = next;
      changed();
    },
    setGrid(on) {
      grid = on;
      changed();
    },
    setOnion(on) {
      onion = on;
      changed();
    },
    key(key) {
      const action = playerKey(key);
      if (action === null) return false;
      if (action.type === "toggle") player.toggle();
      else if (action.type === "step") player.step(action.by);
      else if (action.type === "zoom") player.setZoom(zoom + action.by);
      else player.setSpeed(action.speed);
      return true;
    },
  };
  return player;
}
