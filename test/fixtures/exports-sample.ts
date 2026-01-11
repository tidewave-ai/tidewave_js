// Constants
export const CONSTANT_STRING = 'value';
export const CONSTANT_NUMBER = 42;

// Variables
export let mutableVariable = 'mutable';

// Functions
export function namedFunction(): void {}
export async function asyncFunction(): Promise<void> {}
export function genericFunction<T>(arg: T): T {
  return arg;
}

// Arrow function as const
export const arrowFunction = (): void => {};

// Classes
export class SimpleClass {}
export abstract class AbstractClass {
  abstract method(): void;
}

// Interfaces
export interface SimpleInterface {
  prop: string;
}

// Type aliases
export type SimpleType = string;
export type UnionType = string | number;
export type GenericType<T> = { value: T };

// Enums
export enum SimpleEnum {
  A,
  B,
  C,
}
export const enum ConstEnum {
  X,
  Y,
  Z,
}

// Namespace
export namespace MyNamespace {
  export const inner = 'namespaced';
}
