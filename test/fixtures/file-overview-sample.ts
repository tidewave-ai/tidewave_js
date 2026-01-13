/**
 * @fileoverview
 * Sample module demonstrating file-level documentation.
 * This module contains utility functions for common operations.
 * @author Test Author
 * @version 1.0.0
 */

/**
 * Greets a person with a personalized message
 * @param name The person's name
 * @returns A greeting message
 */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

/**
 * Adds two numbers together
 */
export function add(a: number, b: number): number {
  return a + b;
}

// Export without documentation
export const VERSION = '1.0.0';

/**
 * Configuration interface for the service
 */
export interface Config {
  timeout: number;
  retries: number;
}

/**
 * User type alias
 */
export type User = {
  id: number;
  name: string;
};

/**
 * Status enumeration
 */
export enum Status {
  Active,
  Inactive,
  Pending,
}

/**
 * A simple class for demonstration
 */
export class Calculator {
  /**
   * Multiplies two numbers
   */
  multiply(a: number, b: number): number {
    return a * b;
  }
}
