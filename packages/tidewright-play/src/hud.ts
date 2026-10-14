// The HUD: the load and the clock (top left), speed and wind (top right), the trim gauge
// (bottom centre: where the sheet is, and the band where the sail draws), a compass with the
// wind and the course to the harbour (bottom right), and messages. Text is written only when
// it changes.

import type { Boat } from "./boat.ts";
import { KNOT } from "./boat.ts";
import type { JobState } from "./jobs.ts";
import type { WindNow } from "./wind.ts";

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

class Text {
  private last = "";
  private readonly node: HTMLElement;
  constructor(id: string) {
    this.node = el(id);
  }
  set(html: string): void {
    if (html === this.last) return;
    this.last = html;
    this.node.innerHTML = html;
  }
}

const mmss = (s: number): string => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export class Hud {
  private readonly job = new Text("job");
  private readonly speed = new Text("speed");
  private readonly trimLabel = new Text("trim-label");
  private readonly msg = el("msg");
  private readonly sheetMark = el("sheet-mark");
  private readonly band = el("trim-band");
  private readonly compass = el("compass") as HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private msgUntil = 0;

  constructor() {
    this.ctx = this.compass.getContext("2d") as CanvasRenderingContext2D;
  }

  say(text: string, seconds: number, now: number): void {
    this.msg.innerHTML = text;
    this.msg.style.opacity = "1";
    this.msgUntil = now + seconds;
  }

  draw(now: number, boat: Boat, wind: WindNow, job: JobState, target: { x: number; y: number }, storm: number): void {
    if (now > this.msgUntil) this.msg.style.opacity = "0";
    const dist = Math.hypot(target.x - boat.x, target.y - boat.z);
    const late = job.timeLeft < 0;
    // Where the harbour is from the bow: positive is to port (left), as the compass draws it.
    let rel = Math.atan2(target.x - boat.x, target.y - boat.z) - boat.heading;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const deg = Math.round(Math.abs(rel) * 57.3 / 5) * 5;
    const bearing = deg < 8 ? "dead ahead" : deg > 172 ? "astern" : `${deg}° to ${rel > 0 ? "port ◀" : "starboard ▶"}`;
    const condition = job.condition < 1 ? ` · cargo <b class="${job.condition <= 0.5 ? "bad" : "warn"}">${Math.round(job.condition * 100)} %</b>` : "";
    this.job.set(
      `<div class="cargo">${job.cargo} &rarr; <b>${job.to}</b></div>` +
        `<div><span class="course">${dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist / 10) * 10} m`}, ${bearing}</span></div>` +
        `<div>${late ? `<b class="bad">storm — half pay</b>` : `storm in <b class="${job.timeLeft < job.deadline * 0.25 ? "warn" : ""}">${mmss(job.timeLeft)}</b>`}${condition}</div>` +
        `<div class="small">${job.credits} crowns · ${job.delivered} delivered${job.lost ? ` · ${job.lost} lost` : ""}</div>`,
    );
    this.speed.set(
      `<div class="big">${boat.knots.toFixed(1)}<small> kn</small></div>` +
        `<div>wind ${Math.round(wind.speed * KNOT)} kn${storm > 0.3 ? " · <b class=\"warn\">rising</b>" : ""}</div>` +
        `<div class="small">heel ${Math.round(Math.abs(boat.heel) * 57.3)}°${boat.aground ? ' · <b class="bad">aground</b>' : ""}</div>`,
    );

    // The trim gauge: 0 (sheeted hard in) .. 1.45 rad (eased right out). The band is where
    // the angle of attack is between 7° and 29° for the wind on this course.
    const off = Math.abs(boat.awa);
    const max = 1.45;
    // Running, the band sits at the end of the gauge: eased right out.
    const lo = Math.min(0.9, Math.max(0, off - 0.5) / max);
    const hi = Math.max(lo + 0.1, Math.max(0, off - 0.07) / max);
    this.band.style.left = `${Math.min(1, lo) * 100}%`;
    this.band.style.width = `${Math.max(0, Math.min(1, hi) - Math.min(1, lo)) * 100}%`;
    this.sheetMark.style.left = `${(boat.sheet / max) * 100}%`;
    const words = { luffing: ["luffing — sheet in (W)", "warn"], good: ["drawing", "good"], over: ["over-sheeted — ease (S)", "warn"], stalled: ["stalled — ease out (S)", "bad"] } as const;
    const running = off > 1.95 && boat.trim === "good";
    const [word, cls] = off < 0.6 ? ["head to wind — bear away (A/D)", "bad"] : running ? ["running before the wind", "good"] : words[boat.trim];
    this.trimLabel.set(`<b class="${cls}">${word}</b>`);

    this.drawCompass(boat, wind, target);
  }

  private drawCompass(boat: Boat, wind: WindNow, target: { x: number; y: number }): void {
    const c = this.ctx;
    // The canvas is drawn at twice its CSS size, for sharp lines.
    const size = this.compass.width / 2;
    const r = size / 2 - 6;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, size, size);
    c.save();
    c.translate(size / 2, size / 2);
    c.fillStyle = "rgba(8, 20, 30, 0.55)";
    c.strokeStyle = "rgba(230, 240, 245, 0.5)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Boat-up: a world angle a (0 = +z) is drawn at a - heading, measured toward port (left).
    const at = (a: number): [number, number] => {
      const rel = a - boat.heading;
      return [-Math.sin(rel), -Math.cos(rel)];
    };
    // North tick (north is -z).
    const [nx, ny] = at(Math.PI);
    c.fillStyle = "#e8eef2";
    c.font = "600 11px ui-monospace, Menlo, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("N", nx * (r - 10), ny * (r - 10));
    // The course to the harbour.
    const [tx, ty] = at(Math.atan2(target.x - boat.x, target.y - boat.z));
    c.strokeStyle = "#ffc65a";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(tx * 14, ty * 14);
    c.lineTo(tx * (r - 4), ty * (r - 4));
    c.stroke();
    c.fillStyle = "#ffc65a";
    c.beginPath();
    c.arc(tx * (r - 4), ty * (r - 4), 4, 0, Math.PI * 2);
    c.fill();
    // The wind: an arrow from the rim, blowing in.
    const [wx, wy] = at(wind.to + Math.PI);
    c.strokeStyle = "#7fd8ff";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(wx * r, wy * r);
    c.lineTo(wx * 18, wy * 18);
    c.stroke();
    c.beginPath();
    c.moveTo(wx * 18, wy * 18);
    c.lineTo(wx * 28 - wy * 6, wy * 28 + wx * 6);
    c.lineTo(wx * 28 + wy * 6, wy * 28 - wx * 6);
    c.closePath();
    c.fillStyle = "#7fd8ff";
    c.fill();
    // The boat.
    c.fillStyle = "#f4f1e8";
    c.beginPath();
    c.moveTo(0, -11);
    c.quadraticCurveTo(6, 0, 4, 9);
    c.lineTo(-4, 9);
    c.quadraticCurveTo(-6, 0, 0, -11);
    c.fill();
    c.restore();
  }
}
