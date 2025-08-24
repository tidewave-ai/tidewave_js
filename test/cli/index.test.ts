import { describe, it, expect } from 'vitest';
import { createCli } from '../../src/cli/index';

describe('CLI Module', () => {
  describe('parseModulePath', () => {
    it('should create CLI program with both commands', () => {
      const program = createCli();
      expect(program.commands).toBeDefined();

      const extractCommand = program.commands.find(cmd => cmd.name() === 'extract');
      expect(extractCommand).toBeDefined();
      expect(extractCommand?.alias()).toBe('e');

      const resolveCommand = program.commands.find(cmd => cmd.name() === 'resolve');
      expect(resolveCommand).toBeDefined();
      expect(resolveCommand?.alias()).toBe('r');

      expect(program.name()).toBe('tidewave');
      expect(program.description()).toBe('Extract TypeScript/JavaScript documentation');
    });
  });
});
