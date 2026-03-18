/**
 * Adds two numbers together.
 * @param a - First number
 * @param b - Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * A simple counter class for testing re-exports.
 */
export class Counter {
  private value: number;

  constructor(initial = 0) {
    this.value = initial;
  }

  /** Increment and return the new value. */
  increment(): number {
    return ++this.value;
  }

  /** Get the current value. */
  get current(): number {
    return this.value;
  }
}

/**
 * Status codes for operations.
 */
export enum Status {
  Ok = 'ok',
  Error = 'error',
  Pending = 'pending',
}

/**
 * Shape of a result object.
 */
export interface Result {
  status: Status;
  data: unknown;
}
