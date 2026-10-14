// Keyboard and mouse: held keys, presses since the last simulation step, mouse motion under
// pointer lock.

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

  /**
   * Call after each simulation step: presses are kept until a step has seen them, so a press is
   * never lost (a frame with no step) or seen twice (a frame with two).
   */
  endStep(dt: number): void {
    this.pressed.clear();
    this.idle += dt;
  }

  /** Call when a frame has used the mouse motion. */
  endFrame(): void {
    this.mouseX = 0;
    this.mouseY = 0;
    this.wheel = 0;
  }
}
