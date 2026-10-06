// The player's model (app/lib/player.ts): time, frames, speeds, stepping, the keys, and what
// survives a re-bake. No DOM, no clock: the test passes the time.

import { describe, expect, it } from "vitest";
import { createPlayer, DEFAULT_PLAYER_ZOOM, onionFrames, pickPlayerZoom, playerKey, SPEEDS } from "../app/lib/player.ts";
import type { PlayerClip } from "../app/lib/player.ts";

const CLIPS: PlayerClip[] = [
  { name: "idle", frames: 2, durations: [500, 500], loop: true },
  { name: "pulse", frames: 3, durations: [120, 240, 40], loop: false },
];
const FACINGS = ["sw", "ne"];

function player(options = {}) {
  const made = createPlayer(options);
  made.setAsset(CLIPS, FACINGS);
  return made;
}

describe("createPlayer", () => {
  it("starts on the first clip and facing, playing at 1x, and runs on the time it is given", () => {
    const p = player();
    expect(p.state()).toMatchObject({ clip: "idle", facing: "sw", frame: 0, frames: 2, durations: [500, 500], total: 1000, playing: true, speed: 1, loop: true, zoom: DEFAULT_PLAYER_ZOOM, background: "checker", grid: false, onion: false });
    p.advance(499);
    expect(p.state().frame).toBe(0);
    p.advance(1);
    expect(p.state().frame).toBe(1);
    expect(p.time()).toBe(500);
    // A looping clip wraps.
    p.advance(600);
    expect(p.time()).toBe(100);
    expect(p.state().frame).toBe(0);
  });

  it("takes the clip, facing and zoom it is asked for when they exist, else the defaults", () => {
    expect(player({ clip: "pulse", facing: "ne", zoom: 3 }).state()).toMatchObject({ clip: "pulse", facing: "ne", zoom: 3, loop: false, total: 400 });
    expect(player({ clip: "nope", facing: "up", zoom: 99 }).state()).toMatchObject({ clip: "idle", facing: "sw", zoom: 16 });
    expect(pickPlayerZoom("8")).toBe(8);
    expect(pickPlayerZoom("2.6")).toBe(3);
    expect(pickPlayerZoom("0")).toBe(1);
    expect(pickPlayerZoom("40")).toBe(16);
    expect(pickPlayerZoom(null)).toBe(DEFAULT_PLAYER_ZOOM);
    expect(pickPlayerZoom("big")).toBe(DEFAULT_PLAYER_ZOOM);
  });

  it("runs slower and faster: the speed scales the real time", () => {
    const p = player({ clip: "pulse" });
    p.setLoop(true);
    p.setSpeed(0.25);
    p.advance(400); // 100 ms of clip time
    expect(p.time()).toBe(100);
    expect(p.state().frame).toBe(0);
    p.advance(80); // 120 ms: frame 1 starts
    expect(p.state().frame).toBe(1);
    p.setSpeed(2);
    p.advance(120); // +240 ms = 360: frame 2
    expect(p.state().frame).toBe(2);
    expect(SPEEDS).toContain(0.25);
  });

  it("a clip that does not loop stops on its last frame, and play from the end starts over", () => {
    const p = player({ clip: "pulse" });
    p.advance(10_000);
    expect(p.state()).toMatchObject({ frame: 2, playing: false, finished: true });
    expect(p.time()).toBe(400);
    p.play();
    expect(p.state()).toMatchObject({ frame: 0, playing: true, finished: false });
    expect(p.time()).toBe(0);
    // With loop on it keeps going instead.
    p.setLoop(true);
    p.advance(450);
    expect(p.state()).toMatchObject({ frame: 0, playing: true, finished: false });
    expect(p.time()).toBe(50);
  });

  it("seeks and steps: a step pauses on the start of a frame and wraps for a looping clip", () => {
    const p = player();
    p.seek(700);
    expect(p.state()).toMatchObject({ frame: 1, playing: true });
    p.step(1);
    expect(p.state()).toMatchObject({ frame: 0, playing: false });
    expect(p.time()).toBe(0);
    p.step(-1);
    expect(p.state().frame).toBe(1);
    expect(p.time()).toBe(500);
    p.seekFrame(0);
    expect(p.time()).toBe(0);
    p.seekFrame(7); // clamped
    expect(p.state().frame).toBe(1);
    // A clip that does not loop stops at its ends.
    p.setClip("pulse");
    p.seekFrame(2);
    p.step(1);
    expect(p.state().frame).toBe(2);
    p.seekFrame(0);
    p.step(-1);
    expect(p.state().frame).toBe(0);
    // Advancing while paused does nothing.
    p.advance(1000);
    expect(p.time()).toBe(0);
  });

  it("a new clip starts at its beginning with its own loop; toggle, zoom, background and the rest are plain", () => {
    const p = player();
    p.advance(700);
    p.setClip("pulse");
    expect(p.state()).toMatchObject({ clip: "pulse", frame: 0, loop: false, playing: true });
    expect(p.time()).toBe(0);
    p.setClip("nope");
    expect(p.state().clip).toBe("pulse");
    p.setFacing("ne");
    p.setFacing("up");
    expect(p.state().facing).toBe("ne");
    p.toggle();
    expect(p.state().playing).toBe(false);
    p.toggle();
    expect(p.state().playing).toBe(true);
    p.setZoom(0);
    expect(p.state().zoom).toBe(1);
    p.setZoom(20);
    expect(p.state().zoom).toBe(16);
    p.setZoom(5.4);
    expect(p.state().zoom).toBe(5);
    p.setBackground("floor");
    p.setGrid(true);
    p.setOnion(true);
    expect(p.state()).toMatchObject({ background: "floor", grid: true, onion: true });
    p.setSpeed(7); // not a speed of the player
    expect(p.state().speed).toBe(1);
  });

  it("the state object is the same until something in it changes, and listeners hear every change", () => {
    const p = player();
    let heard = 0;
    const stop = p.subscribe(() => (heard += 1));
    const before = p.state();
    p.advance(100); // time moved, the frame did not
    expect(p.state()).toBe(before);
    expect(heard).toBe(0);
    p.advance(400); // frame 1
    expect(p.state()).not.toBe(before);
    expect(heard).toBe(1);
    p.setZoom(p.state().zoom); // no change
    expect(heard).toBe(1);
    p.setZoom(2);
    expect(heard).toBe(2);
    stop();
    p.setZoom(3);
    expect(heard).toBe(2);
  });

  it("keeps the clip, facing, time, zoom and speed over a re-bake that still has them, and falls back when it does not", () => {
    const p = player({ clip: "pulse", facing: "ne", zoom: 6 });
    p.setSpeed(0.5);
    p.advance(300); // 150 ms in
    const before = p.state();
    p.setAsset(
      CLIPS.map((clip) => ({ ...clip })),
      [...FACINGS],
    );
    expect(p.state()).toBe(before); // nothing changed
    expect(p.time()).toBe(150);
    // The clip got shorter than the time: the time goes to the start.
    p.setAsset([{ name: "pulse", frames: 1, durations: [100], loop: false }], FACINGS);
    expect(p.state()).toMatchObject({ clip: "pulse", facing: "ne", frames: 1, total: 100, zoom: 6, speed: 0.5 });
    expect(p.time()).toBe(0);
    // The clip is gone: the first one, and the first facing when that is gone too.
    p.setAsset([{ name: "walk", frames: 4, durations: [100, 100, 100, 100], loop: true }], ["down"]);
    expect(p.state()).toMatchObject({ clip: "walk", facing: "down", frame: 0, zoom: 6 });
    // No clips at all: the player is empty (a stand-in clip of one frame, so nothing divides by zero).
    p.setAsset([], []);
    expect(p.state()).toMatchObject({ clip: "", facing: "", frame: 0, frames: 1 });
    p.advance(100);
    expect(p.time()).toBe(0);
  });

  it("maps the keys: space toggles, arrows step, + and - zoom, 1 to 5 pick the speeds", () => {
    expect(playerKey(" ")).toEqual({ type: "toggle" });
    expect(playerKey("ArrowRight")).toEqual({ type: "step", by: 1 });
    expect(playerKey("ArrowLeft")).toEqual({ type: "step", by: -1 });
    expect(playerKey("+")).toEqual({ type: "zoom", by: 1 });
    expect(playerKey("=")).toEqual({ type: "zoom", by: 1 });
    expect(playerKey("-")).toEqual({ type: "zoom", by: -1 });
    expect(SPEEDS.map((_, i) => playerKey(String(i + 1)))).toEqual(SPEEDS.map((speed) => ({ type: "speed", speed })));
    expect(playerKey("6")).toBeNull();
    expect(playerKey("a")).toBeNull();
    expect(playerKey("Enter")).toBeNull();

    const p = player();
    expect(p.key(" ")).toBe(true);
    expect(p.state().playing).toBe(false);
    expect(p.key("ArrowRight")).toBe(true);
    expect(p.state().frame).toBe(1);
    expect(p.key("+")).toBe(true);
    expect(p.state().zoom).toBe(DEFAULT_PLAYER_ZOOM + 1);
    expect(p.key("2")).toBe(true);
    expect(p.state().speed).toBe(0.25);
    expect(p.key("x")).toBe(false);
  });
});

describe("onionFrames", () => {
  it("is the frame before and after, wrapping only for a looping clip, and nothing for one frame", () => {
    expect(onionFrames({ frames: 4, loop: true }, 0)).toEqual({ prev: 3, next: 1 });
    expect(onionFrames({ frames: 4, loop: true }, 3)).toEqual({ prev: 2, next: 0 });
    expect(onionFrames({ frames: 4, loop: false }, 0)).toEqual({ prev: null, next: 1 });
    expect(onionFrames({ frames: 4, loop: false }, 3)).toEqual({ prev: 2, next: null });
    expect(onionFrames({ frames: 2, loop: true }, 0)).toEqual({ prev: 1, next: null });
    expect(onionFrames({ frames: 1, loop: true }, 0)).toEqual({ prev: null, next: null });
  });
});
