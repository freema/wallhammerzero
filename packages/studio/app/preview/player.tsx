// The player of the asset page: one big preview with its controls, the timeline, the pixel
// inspector, and every variant seed and preset next to each other on the same clock.
//
// The model is app/lib/player.ts. This file connects it to the frame loop of the preview host
// (time), to React (the controls) and to the keyboard. The pictures are drawn by the host:
// each preview asks the model which frame is on, every frame, without a React render.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Sheet } from "@whz/runtime";
import { fileUrl, formatMs } from "../lib/assets.ts";
import { BACKGROUNDS, createPlayer, onionFrames, PLAYER_ZOOM_MAX, PLAYER_ZOOM_MIN, SPEEDS } from "../lib/player.ts";
import type { Background, Player, PlayerState } from "../lib/player.ts";
import { cssPixel, inspectPixel, validChoice } from "../lib/scene.ts";
import type { FrameChoice, PixelInfo } from "../lib/scene.ts";
import { previewVariants } from "../lib/variants.ts";
import type { PreviewVariant } from "../lib/variants.ts";
import { PixelImage } from "../components.tsx";
import type { AssetRecord } from "../../server/services/index.ts";
import { studioApi } from "./api.ts";
import { previewHost } from "./host.ts";
import { PreviewBox, SourcePreview, useLoadedSheet, usePixelRatio } from "./preview.tsx";

/** The zoom of the previews in the variants grid. */
const GRID_ZOOM = 4;
/** The pixel grid is drawn from this zoom up: below it the lines would hide the picture. */
const GRID_FROM_ZOOM = 4;

const BACKGROUND_LABEL: Readonly<Record<Background, string>> = { checker: "checker", dark: "dark", light: "light", floor: "floor tiles" };

/** The frame the player shows now, read from the model (not from React state). */
function choiceOf(player: Player, onion: boolean): FrameChoice | null {
  const state = player.state();
  if (state.clip === "") return null;
  const skin = onion && state.onion ? onionFrames(state, state.frame) : { prev: null, next: null };
  return { clip: state.clip, facing: state.facing, frame: state.frame, ...skin };
}

/** True if a key press belongs to a form control and not to the player. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

/**
 * The player of one asset page. It lives as long as the page: a re-baked asset (live reload)
 * gets the same player, so the clip, the time, the zoom and the rest stay.
 */
function usePlayer(asset: AssetRecord, initial: { zoom: number; clip: string; facing: string }): Player {
  const [player] = useState(() => {
    const made = createPlayer({ zoom: initial.zoom, clip: initial.clip, facing: initial.facing });
    made.setAsset(asset.clips, asset.facings);
    return made;
  });
  // The effect runs when a re-bake changed the clips or the facings: on their content, not on
  // the identity of the record (every live event makes a new one).
  const shape = JSON.stringify([asset.clips, asset.facings]);
  useEffect(() => {
    const [clips, facings] = JSON.parse(shape) as [AssetRecord["clips"], AssetRecord["facings"]];
    player.setAsset(clips, facings);
  }, [player, shape]);

  useEffect(() => previewHost().onFrame((realMs) => player.advance(realMs)), [player]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      // Space on a focused button presses that button, as everywhere.
      if (event.key === " " && event.target instanceof HTMLButtonElement) return;
      if (player.key(event.key)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  useEffect(() => {
    const api = studioApi();
    api.player = player;
    return () => {
      if (api.player === player) api.player = null;
    };
  }, [player]);
  return player;
}

/** The timeline: one segment per frame, as wide as the frame is long, and the playhead. */
function Timeline({ player, state }: { player: Player; state: PlayerState }) {
  const track = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  // The playhead and the time readout move every frame: straight to the DOM, not through React.
  useEffect(() => {
    const show = (): void => {
      const { total } = player.state();
      const time = player.time();
      if (head.current !== null) head.current.style.left = `${Math.min(100, (time / total) * 100)}%`;
      if (clock.current !== null) clock.current.textContent = `${Math.floor(time)} ms`;
    };
    show();
    return previewHost().onFrame(show);
  }, [player]);

  const seekTo = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = track.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0) return;
    const part = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    // The very end of a looping clip is its start again: stay just inside.
    player.seek(Math.min(part * state.total, state.total - 0.001));
  };

  return (
    <div className="timeline-wrap">
      <div
        className="timeline"
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Time in the clip"
        aria-valuemin={0}
        aria-valuemax={state.frames - 1}
        aria-valuenow={state.frame}
        aria-valuetext={`frame ${state.frame} of ${state.frames}`}
        data-frame={state.frame}
        data-frames={state.frames}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          player.pause();
          seekTo(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) seekTo(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        {state.durations.map((ms, frame) => (
          <div key={frame} className="tick" data-frame={frame} data-current={frame === state.frame} style={{ flexGrow: ms }} title={`frame ${frame}: ${ms} ms`}>
            <b>{frame}</b>
            <span>{ms} ms</span>
          </div>
        ))}
        <div className="playhead" ref={head} />
      </div>
      <p className="sub timeline-read" data-readout="time">
        frame <strong data-readout="frame">{state.frame}</strong> of {state.frames} ({state.durations[state.frame]} ms) · <span ref={clock}>0 ms</span> of {formatMs(state.total)}
        {state.finished ? " · ended" : ""}
      </p>
    </div>
  );
}

function Controls({ player, state, asset }: { player: Player; state: PlayerState; asset: AssetRecord }) {
  return (
    <div className="player-controls">
      <div className="control-row">
        <button type="button" data-action="step-back" onClick={() => player.step(-1)} title="One frame back (←)">
          ◀ frame
        </button>
        <button type="button" className="primary" data-action="toggle" aria-pressed={state.playing} onClick={() => player.toggle()} title="Play or pause (space)">
          {state.playing ? "Pause" : "Play"}
        </button>
        <button type="button" data-action="step" onClick={() => player.step(1)} title="One frame on (→)">
          frame ▶
        </button>
        <span className="zoom" role="group" aria-label="Speed">
          {SPEEDS.map((speed, i) => (
            <button key={speed} type="button" data-speed={speed} aria-pressed={speed === state.speed} onClick={() => player.setSpeed(speed)} title={`Speed ${speed}× (key ${i + 1})`}>
              {speed}×
            </button>
          ))}
        </span>
        <label className="check">
          <input type="checkbox" name="loop" checked={state.loop} onChange={(event) => player.setLoop(event.currentTarget.checked)} /> loop
        </label>
      </div>
      <div className="control-row">
        <label>
          Clip{" "}
          <select name="clip" value={state.clip} onChange={(event) => player.setClip(event.currentTarget.value)}>
            {asset.clips.map((clip) => (
              <option key={clip.name}>{clip.name}</option>
            ))}
          </select>
        </label>
        {asset.facings.length < 2 ? null : (
          <label>
            Facing{" "}
            <select name="facing" value={state.facing} onChange={(event) => player.setFacing(event.currentTarget.value)}>
              {asset.facings.map((facing) => (
                <option key={facing}>{facing}</option>
              ))}
            </select>
          </label>
        )}
        <span className="stepper" role="group" aria-label="Zoom">
          <button type="button" data-action="zoom-out" disabled={state.zoom <= PLAYER_ZOOM_MIN} onClick={() => player.setZoom(state.zoom - 1)} title="Zoom out (−)">
            −
          </button>
          <output data-readout="zoom">{state.zoom}×</output>
          <button type="button" data-action="zoom-in" disabled={state.zoom >= PLAYER_ZOOM_MAX} onClick={() => player.setZoom(state.zoom + 1)} title="Zoom in (+)">
            +
          </button>
        </span>
        <label className="check" title={`A line around every pixel, from ${GRID_FROM_ZOOM}× up`}>
          <input type="checkbox" name="grid" checked={state.grid} onChange={(event) => player.setGrid(event.currentTarget.checked)} /> pixel grid
        </label>
        <label className="check" title="The frame before (red) and the frame after (blue), under the current one">
          <input type="checkbox" name="onion" checked={state.onion} onChange={(event) => player.setOnion(event.currentTarget.checked)} /> onion skin
        </label>
        <label>
          Background{" "}
          <select name="background" value={state.background} onChange={(event) => player.setBackground(event.currentTarget.value as Background)}>
            {BACKGROUNDS.map((background) => (
              <option key={background} value={background}>
                {BACKGROUND_LABEL[background]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function Inspector({ info, names }: { info: PixelInfo | null; names: boolean }) {
  return (
    <p className="inspector" data-readout="pixel" aria-live="off">
      {info === null ? (
        <span className="sub">Point at a pixel: its position, palette slot and colour.</span>
      ) : (
        <>
          <span className="swatch" style={info.color === null ? undefined : { background: info.color }} data-empty={info.color === null} />
          x <b>{info.x}</b>, y <b>{info.y}</b> · slot <b>{info.slot}</b>
          {info.name === null ? (names ? "" : " (names unknown: the palette file changed since the bake)") : <> <code>{info.name}</code></>}
          {info.color === null || info.rgb === null ? " · transparent" : <> · <code>{info.color}</code> · rgb({info.rgb.join(", ")})</>}
        </>
      )}
    </p>
  );
}

export interface PlayerProps {
  readonly asset: AssetRecord;
  /** What the URL asked for: `?zoom=`, `?clip=`, `?facing=`. */
  readonly zoom: number;
  readonly clip: string;
  readonly facing: string;
}

/** The player section of the asset page. Renders nothing for an asset without output. */
export function PlayerSection({ asset, zoom, clip, facing }: PlayerProps) {
  const player = usePlayer(asset, { zoom, clip, facing });
  const state = useSyncExternalStore(player.subscribe, player.state, player.state);
  const variants = useMemo(() => previewVariants(asset), [asset]);
  const [picked, setPicked] = useState<string | null>(null);
  const main: PreviewVariant | undefined = variants.find((variant) => variant.id === picked) ?? variants[0];
  const loaded = useLoadedSheet(main?.source ?? null);
  const ratio = usePixelRatio();

  const mainChoice = useCallback(() => choiceOf(player, true), [player]);
  const plainChoice = useCallback(() => choiceOf(player, false), [player]);

  // The pixel under the pointer, in native pixels. The inspector reads the sheet, so it tells
  // the slot of the current frame also while an onion skin is drawn under it.
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const onMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = box.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const unit = cssPixel(state.zoom, ratio);
    const x = Math.floor((event.clientX - rect.left) / unit);
    const y = Math.floor((event.clientY - rect.top) / unit);
    setPoint((before) => (before !== null && before.x === x && before.y === y ? before : { x, y }));
  };
  const sheet: Sheet | null = loaded?.sheet ?? null;
  const shown = sheet === null || state.clip === "" ? null : validChoice(sheet, { clip: state.clip, facing: state.facing, frame: state.frame });
  const info = sheet === null || shown === null || point === null ? null : inspectPixel(sheet, shown, point.x, point.y, asset.palette?.names ?? null);

  if (asset.size === null || main === undefined) return null;
  const [w, h] = asset.size;
  const firstFrame = (variant: PreviewVariant): string | null => asset.variants.find((candidate) => `seed-${candidate.seed}` === variant.id)?.firstFrame ?? null;
  const still = (variant: PreviewVariant, at: number) => {
    const file = firstFrame(variant);
    return file === null ? null : <PixelImage src={fileUrl(file, `${variant.outputHash}.${asset.palette?.hash ?? ""}`)} w={w} h={h} zoom={at} alt={`${asset.id}, ${variant.label}, first frame`} />;
  };

  return (
    <section className="player" data-player data-clip={state.clip} data-facing={state.facing} data-frame={state.frame} data-playing={state.playing} data-speed={state.speed} data-zoom={state.zoom}>
      <h2>Player</h2>
      <Controls player={player} state={state} asset={asset} />
      <Timeline player={player} state={state} />

      <div className={`stage bg-${state.background}`} data-background={state.background}>
        <div className="stage-inner" onPointerMove={onMove} onPointerLeave={() => setPoint(null)}>
          <PreviewBox loaded={loaded} width={w} height={h} zoom={state.zoom} choice={mainChoice} id="main" elementRef={box}>
            {still(main, state.zoom)}
            {state.grid && state.zoom >= GRID_FROM_ZOOM ? <div className="pixel-grid" data-grid /> : null}
          </PreviewBox>
        </div>
      </div>
      <p className="sub">
        Showing <strong data-readout="variant">{main.label}</strong> · output hash <code>{main.outputHash}</code> ·{" "}
        <a href={fileUrl(main.file, `${main.outputHash}.${asset.palette?.hash ?? ""}`)}>sheet PNG</a>
        {state.grid && state.zoom < GRID_FROM_ZOOM ? ` · the pixel grid shows from ${GRID_FROM_ZOOM}× up` : ""}
      </p>
      <Inspector info={info} names={asset.palette?.names !== null} />

      <h3>Variants</h3>
      <p className="sub">
        Every variant seed{asset.presets.length === 0 ? "" : " and every preset (drawn with the first seed)"}, on the same clock. Click one to put it in the player.
      </p>
      {asset.presetError === null ? null : <pre className="error-text">The presets could not be rendered: {asset.presetError}</pre>}
      {asset.presets.length > 0 && asset.presetVariants.length === 0 && asset.presetError === null ? (
        <p className="note">The presets of this asset have no preview yet. They are rendered when the studio bakes the asset: press Bake all on the dashboard.</p>
      ) : null}
      <ul className="variant-grid">
        {variants.map((variant) => (
          <li key={variant.id} data-variant={variant.id} data-kind={variant.kind} data-picked={variant.id === main.id}>
            <button type="button" className="variant-pick" aria-pressed={variant.id === main.id} onClick={() => setPicked(variant.id)}>
              <span className="thumb checker">
                <SourcePreview source={variant.source} width={w} height={h} zoom={GRID_ZOOM} choice={plainChoice} id={variant.id}>
                  {still(variant, GRID_ZOOM)}
                </SourcePreview>
              </span>
              <span className="variant-label">{variant.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3>1× in context</h3>
      <p className="sub">The same variants at the size of the game, one screen pixel per pixel, on floor tiles.</p>
      <ul className="context-row bg-floor" data-context>
        {variants.map((variant) => (
          <li key={variant.id} title={variant.label}>
            <SourcePreview source={variant.source} width={w} height={h} zoom={1} choice={plainChoice} id={`1x-${variant.id}`}>
              {still(variant, 1)}
            </SourcePreview>
          </li>
        ))}
      </ul>
      <p className="sub keys">
        Keys: <kbd>space</kbd> play or pause · <kbd>←</kbd> <kbd>→</kbd> one frame · <kbd>+</kbd> <kbd>−</kbd> zoom · <kbd>1</kbd> to <kbd>{SPEEDS.length}</kbd> speed ({SPEEDS.map((speed) => `${speed}×`).join(", ")})
      </p>
    </section>
  );
}
