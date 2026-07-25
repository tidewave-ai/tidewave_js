import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleInstall } from '../src/cli/install';

let projectDir: string;

function write(relativePath: string, content: string): void {
  const filePath = path.join(projectDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(projectDir, relativePath), 'utf8');
}

describe('install command', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidewave-install-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('configures a Vite project', async () => {
    write('package.json', JSON.stringify({ devDependencies: { vite: '^7.0.0' } }));
    write(
      'vite.config.ts',
      `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    );

    await handleInstall({ prefix: projectDir, skipDeps: true });

    expect(read('vite.config.ts')).toBe(`import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tidewave from 'tidewave/vite-plugin';

export default defineConfig({
  plugins: [tidewave(), react()],
});
`);
  });

  test('configures Vite and the server entry point in a TanStack Start project', async () => {
    write(
      'package.json',
      JSON.stringify({
        dependencies: { '@tanstack/react-start': '^1.0.0' },
        devDependencies: { vite: '^7.0.0' },
      }),
    );
    write(
      'vite.config.js',
      `import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
});
`,
    );
    write(
      'src/start.ts',
      `import { createStart } from '@tanstack/react-start';

export const startInstance = createStart(() => {
  return {};
});
`,
    );

    await handleInstall({ prefix: projectDir, skipDeps: true });

    expect(read('vite.config.js')).toContain("import tidewave from 'tidewave/vite-plugin';");
    expect(read('vite.config.js')).toContain('plugins: [tidewave()]');
    expect(read('src/start.ts')).toBe(`import { createStart } from '@tanstack/react-start';

// Import Tidewave only in development.
if (process.env.NODE_ENV === 'development' && typeof window === 'undefined') {
  import('tidewave/tanstack');
}

export const startInstance = createStart(() => {
  return {};
});
`);
  });

  test('does not duplicate an existing installation', async () => {
    write('package.json', JSON.stringify({ devDependencies: { vite: '^7.0.0' } }));
    const config = `import { defineConfig } from 'vite';
import tidewavePlugin from 'tidewave/vite-plugin';

export default defineConfig({ plugins: [tidewavePlugin()] });
`;
    write('vite.config.mts', config);

    await handleInstall({ prefix: projectDir, skipDeps: true });

    expect(read('vite.config.mts')).toBe(config);
  });

  test('does not modify files during a dry run', async () => {
    write('package.json', JSON.stringify({ devDependencies: { vite: '^7.0.0' } }));
    const config = `import { defineConfig } from 'vite';

export default defineConfig({ plugins: [] });
`;
    write('vite.config.ts', config);

    await handleInstall({ prefix: projectDir, dryRun: true, skipDeps: true });

    expect(read('vite.config.ts')).toBe(config);
  });

  test('rejects projects that are not Vite or TanStack Start projects', async () => {
    write('package.json', JSON.stringify({ dependencies: { react: '^19.0.0' } }));

    await expect(handleInstall({ prefix: projectDir, skipDeps: true })).rejects.toThrow(
      'Could not detect Vite or TanStack Start',
    );
  });
});
