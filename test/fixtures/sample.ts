/**
 * A sample TypeScript interface
 */
export interface User {
  id: number;
  name: string;
  email?: string;
}

/**
 * A sample TypeScript class
 */
export class UserManager {
  private users: User[] = [];

  /**
   * Add a user
   * @param user - The user to add
   */
  addUser(user: User): void {
    this.users.push(user);
  }

  /**
   * Get user by ID
   * @param id - The user ID
   * @returns The user or undefined
   */
  getUserById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  /**
   * Static factory method
   * @returns A new UserManager instance
   */
  static create(): UserManager {
    return new UserManager();
  }
}

/**
 * Sample utility function
 * @param items - Array to process
 * @returns Processed array
 */
export function processItems<T>(items: T[]): T[] {
  return items.filter(Boolean);
}
