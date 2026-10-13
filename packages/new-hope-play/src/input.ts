// Keyboard and mouse: held keys, presses since the last frame, mouse motion under pointer lock.

export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  wheel = 0;
  /** Seconds since the mouse last moved the camera. */
  idle = 99;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    addEventListener("keydown", (e) => {
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.held.delete(e.code));
    addEventListener("blur", () => this.held.clear());
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
      this.idle = 0;
    });
    addEventListener("wheel", (e) => {
      this.wheel += Math.sign(e.deltaY);
    });
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  hit(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  axis(neg: string[], pos: string[]): number {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
  }

  /** Call at the end of a frame. */
  endFrame(dt: number): void {
    this.pressed.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.wheel = 0;
    this.idle += dt;
  }
}
