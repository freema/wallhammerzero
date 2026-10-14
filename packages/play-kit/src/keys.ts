// The keyboard as the simulation sees it: held keys, and presses kept until a step has seen
// them. `set` is what the hook's `key()` calls, so scripts and real keys take one path.

export class Keys {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  /** Listen to the window's keyboard. */
  listen(): this {
    addEventListener("keydown", (e) => {
      this.set(e.code, true);
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.set(e.code, false));
    addEventListener("blur", () => this.held.clear());
    return this;
  }

  set(code: string, down: boolean): void {
    if (down && !this.held.has(code)) this.pressed.add(code);
    if (down) this.held.add(code);
    else this.held.delete(code);
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  /** Pressed since the last step. */
  hit(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** -1, 0 or 1 from two sets of keys. */
  axis(neg: string[], pos: string[]): number {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
  }

  /** Call after each simulation step, so a press is never lost or seen twice. */
  endStep(): void {
    this.pressed.clear();
  }
}
