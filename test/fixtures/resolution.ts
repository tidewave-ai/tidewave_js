/**
 * Test fixtures for resolution tests.
 * This file contains classes, interfaces, and enums used for testing the symbol extraction.
 */

/**
 * Example class with static and instance members for testing
 */
export class TestClass {
  /**
   * Static property
   */
  static readonly VERSION = '1.0.0';

  /**
   * Static method
   */
  static create(name: string): TestClass {
    return new TestClass(name);
  }

  /**
   * Instance property
   */
  name: string;

  /**
   * Constructor
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Instance method
   */
  greet(): string {
    return `Hello, ${this.name}!`;
  }

  /**
   * Instance method with parameters
   */
  setName(newName: string): void {
    this.name = newName;
  }
}

/**
 * Example interface for testing
 */
export interface TestInterface {
  id: number;
  name: string;
  getData(): string;
}

/**
 * Example enum for testing
 */
export enum TestEnum {
  First = 1,
  Second = 2,
  Third = 3,
}
