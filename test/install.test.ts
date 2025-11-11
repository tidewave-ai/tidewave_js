import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { handleInstall } from '../src/cli/install';

const TEST_FIXTURES = path.join(__dirname, 'fixtures');
const NEXT15_FIXTURE = path.join(TEST_FIXTURES, 'next15');
const NEXT16_FIXTURE = path.join(TEST_FIXTURES, 'next16');

// Helper to clean up created files
function cleanupFiles(dir: string) {
  const filesToRemove = [
    path.join(dir, 'pages/api/tidewave.ts'),
    path.join(dir, 'middleware.ts'),
    path.join(dir, 'proxy.ts'),
    path.join(dir, 'instrumentation.ts'),
    path.join(dir, 'src/instrumentation.ts'),
  ];

  for (const file of filesToRemove) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  // Clean up directories if empty
  const dirsToRemove = [
    path.join(dir, 'pages/api'),
    path.join(dir, 'pages'),
    path.join(dir, 'src'),
  ];

  for (const dirPath of dirsToRemove) {
    if (fs.existsSync(dirPath)) {
      try {
        fs.rmdirSync(dirPath);
      } catch {
        // Directory not empty, skip
      }
    }
  }
}

describe('install command', () => {
  describe('Next.js 15', () => {
    beforeEach(() => {
      cleanupFiles(NEXT15_FIXTURE);
    });

    afterEach(() => {
      cleanupFiles(NEXT15_FIXTURE);
    });

    test('should create middleware.ts for Next.js 15', async () => {
      await handleInstall({
        prefix: NEXT15_FIXTURE,
        skipDeps: true,
      });

      const middlewarePath = path.join(NEXT15_FIXTURE, 'middleware.ts');
      expect(fs.existsSync(middlewarePath)).toBe(true);

      const content = fs.readFileSync(middlewarePath, 'utf-8');
      expect(content).toContain('export function middleware');
      expect(content).toContain('/tidewave');
      expect(content).toContain('/api/tidewave');
      expect(content).toContain("matcher: ['/tidewave/:path*']");
    });

    test('should create pages/api/tidewave.ts', async () => {
      await handleInstall({
        prefix: NEXT15_FIXTURE,
        skipDeps: true,
      });

      const handlerPath = path.join(NEXT15_FIXTURE, 'pages/api/tidewave.ts');
      expect(fs.existsSync(handlerPath)).toBe(true);

      const content = fs.readFileSync(handlerPath, 'utf-8');
      expect(content).toContain('tidewaveHandler');
      expect(content).toContain('NextApiRequest');
      expect(content).toContain('NextApiResponse');
      expect(content).toContain('bodyParser: false');
    });

    test('should create instrumentation.ts', async () => {
      await handleInstall({
        prefix: NEXT15_FIXTURE,
        skipDeps: true,
      });

      const instrumentationPath = path.join(NEXT15_FIXTURE, 'instrumentation.ts');
      expect(fs.existsSync(instrumentationPath)).toBe(true);

      const content = fs.readFileSync(instrumentationPath, 'utf-8');
      expect(content).toContain('export async function register');
      expect(content).toContain('TidewaveSpanProcessor');
      expect(content).toContain('TidewaveLogRecordProcessor');
      expect(content).toContain('NodeSDK');
    });
  });

  describe('Next.js 16', () => {
    beforeEach(() => {
      cleanupFiles(NEXT16_FIXTURE);
    });

    afterEach(() => {
      cleanupFiles(NEXT16_FIXTURE);
    });

    test('should create proxy.ts for Next.js 16', async () => {
      await handleInstall({
        prefix: NEXT16_FIXTURE,
        skipDeps: true,
      });

      const proxyPath = path.join(NEXT16_FIXTURE, 'proxy.ts');
      expect(fs.existsSync(proxyPath)).toBe(true);

      const content = fs.readFileSync(proxyPath, 'utf-8');
      expect(content).toContain('export function proxy');
      expect(content).toContain('/tidewave');
      expect(content).toContain('/api/tidewave');
      // Next.js 16 proxy should NOT have matcher config
      expect(content).not.toContain('matcher');
    });

    test('should create pages/api/tidewave.ts', async () => {
      await handleInstall({
        prefix: NEXT16_FIXTURE,
        skipDeps: true,
      });

      const handlerPath = path.join(NEXT16_FIXTURE, 'pages/api/tidewave.ts');
      expect(fs.existsSync(handlerPath)).toBe(true);

      const content = fs.readFileSync(handlerPath, 'utf-8');
      expect(content).toContain('tidewaveHandler');
    });

    test('should create instrumentation.ts', async () => {
      await handleInstall({
        prefix: NEXT16_FIXTURE,
        skipDeps: true,
      });

      const instrumentationPath = path.join(NEXT16_FIXTURE, 'instrumentation.ts');
      expect(fs.existsSync(instrumentationPath)).toBe(true);

      const content = fs.readFileSync(instrumentationPath, 'utf-8');
      expect(content).toContain('export async function register');
      expect(content).toContain('TidewaveSpanProcessor');
      expect(content).toContain('TidewaveLogRecordProcessor');
    });
  });

  describe('Existing files', () => {
    beforeEach(() => {
      cleanupFiles(NEXT16_FIXTURE);
    });

    afterEach(() => {
      cleanupFiles(NEXT16_FIXTURE);
    });

    test('should skip existing middleware files if already configured', async () => {
      // Create a proxy.ts that's already configured
      const proxyPath = path.join(NEXT16_FIXTURE, 'proxy.ts');
      fs.writeFileSync(
        proxyPath,
        `import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL('/api/tidewave', req.url));
  }
  return NextResponse.next();
}
`,
        'utf-8',
      );

      await handleInstall({
        prefix: NEXT16_FIXTURE,
        skipDeps: true,
      });

      // File should still exist and be unchanged
      const content = fs.readFileSync(proxyPath, 'utf-8');
      expect(content).toContain('export function proxy');
      expect(content).toContain('/tidewave');
    });

    test('should skip existing instrumentation files if already configured', async () => {
      // Create an instrumentation.ts that's already configured
      const instrumentationPath = path.join(NEXT16_FIXTURE, 'instrumentation.ts');
      fs.writeFileSync(
        instrumentationPath,
        `import { NodeSDK } from '@opentelemetry/sdk-node';
import { TidewaveSpanProcessor, TidewaveLogRecordProcessor } from 'tidewave/next-js/instrumentation';

export async function register() {
  const sdk = new NodeSDK({
    spanProcessors: [new TidewaveSpanProcessor()],
    logRecordProcessors: [new TidewaveLogRecordProcessor()],
  });
  sdk.start();
}
`,
        'utf-8',
      );

      await handleInstall({
        prefix: NEXT16_FIXTURE,
        skipDeps: true,
      });

      // File should still exist and be unchanged
      const content = fs.readFileSync(instrumentationPath, 'utf-8');
      expect(content).toContain('TidewaveSpanProcessor');
      expect(content).toContain('TidewaveLogRecordProcessor');
    });
  });
});
