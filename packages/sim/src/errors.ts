/**
 * The error of the sim: a broken declaration, bad game data, a bad snapshot or replay, or a
 * system that put something into the state that is not allowed there. A command from outside
 * never throws; `submit` returns why it was refused.
 */
export class SimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimError";
  }
}
