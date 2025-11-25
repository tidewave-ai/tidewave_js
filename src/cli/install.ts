// src/cli/install.ts
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as readline from 'readline';
import chalk from 'chalk';

interface InstallOptions {
  prefix?: string;
  dryRun?: boolean;
  skipDeps?: boolean;
}

interface NextJsVersion {
  major: number;
  minor: number;
  raw: string;
}

export async function handleInstall(options: InstallOptions): Promise<void> {
  const targetDir = options.prefix || process.cwd();
  const dryRun = options.dryRun || false;
  const skipDeps = options.skipDeps || false;

  console.log(chalk.blue('\n🌊 Tidewave Installer\n'));
  console.log(chalk.gray(`Target directory: ${targetDir}`));

  if (dryRun) {
    console.log(chalk.yellow('\n⚠️  DRY RUN MODE - No files will be created\n'));
  }

  // Step 1: Detect Next.js version
  const nextVersion = await detectNextJsVersion(targetDir);
  if (!nextVersion) {
    console.error(chalk.red('\n❌ Could not find Next.js in node_modules.'));
    console.log(chalk.gray('\nThe installer only works for Next.js projects\n'));
    process.exit(1);
  }

  console.log(chalk.green(`✅ Detected Next.js ${nextVersion.raw} (v${nextVersion.major})`));

  // Step 2: Create files
  const steps: (() => Promise<void>)[] = [
    (): Promise<void> => createApiHandler(targetDir, dryRun),
    (): Promise<void> => createMiddleware(targetDir, nextVersion, dryRun),
    (): Promise<void> => createInstrumentation(targetDir, dryRun),
  ];

  for (const step of steps) {
    await step();
  }

  // Step 3: Install dependencies
  if (!skipDeps) {
    await installDependencies(targetDir, dryRun);
  }

  // Summary
  console.log(chalk.green('\n✅ Tidewave setup complete!\n'));
  console.log(chalk.blue('Next steps:'));
  console.log('  1. Start your Next.js dev server: npm run dev');
  console.log('  2. Install the Tidewave app: https://hexdocs.pm/tidewave/');
  console.log('  3. Connect to your app through Tidewave\n');
}

async function detectNextJsVersion(dir: string): Promise<NextJsVersion | null> {
  try {
    // Get the actual installed version from node_modules
    const nextPackageJsonPath = path.join(dir, 'node_modules', 'next', 'package.json');

    if (!fs.existsSync(nextPackageJsonPath)) {
      return null;
    }

    const nextPackageJson = JSON.parse(fs.readFileSync(nextPackageJsonPath, 'utf-8'));
    const { version } = nextPackageJson;
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);

    if (match) {
      return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        raw: version,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function detectPackageManager(dir: string): string {
  // Check for lock files to determine package manager
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
  // Default to npm if no lock file found
  return 'npm';
}

async function promptUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      // Default to yes if empty, or explicit yes/y
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

async function installDependencies(dir: string, dryRun: boolean): Promise<void> {
  console.log(chalk.yellow('📦 Installing dependencies...'));

  if (dryRun) {
    console.log(chalk.gray('[DRY RUN] Would install: tidewave, @opentelemetry/sdk-node'));
    return;
  }

  const pm = detectPackageManager(dir);
  const devDepCommands: Record<string, string[]> = {
    npm: ['install', '-D', 'tidewave', '@opentelemetry/sdk-trace-base', '@opentelemetry/sdk-logs'],
    yarn: ['add', '-D', 'tidewave', '@opentelemetry/sdk-trace-base', '@opentelemetry/sdk-logs'],
    pnpm: [
      'add',
      '--save-dev',
      'tidewave',
      '@opentelemetry/sdk-trace-base',
      '@opentelemetry/sdk-logs',
    ],
    bun: ['add', '--dev', 'tidewave', '@opentelemetry/sdk-trace-base', '@opentelemetry/sdk-logs'],
  };

  const depCommands: Record<string, string[]> = {
    npm: ['install', '@opentelemetry/sdk-node'],
    yarn: ['add', '@opentelemetry/sdk-node'],
    pnpm: ['add', '@opentelemetry/sdk-node'],
    bun: ['add', '@opentelemetry/sdk-node'],
  };

  const devCmds = devDepCommands[pm];
  const depCmds = depCommands[pm];

  if (!devCmds || !depCmds) {
    console.error(chalk.red(`\n❌ Unknown package manager: ${pm}`));
    process.exit(1);
  }

  try {
    // Install tidewave as dev dependency
    child_process.execSync(`${pm} ${devCmds.join(' ')}`, {
      cwd: dir,
      stdio: 'inherit',
    });

    // Install OpenTelemetry as regular dependency
    child_process.execSync(`${pm} ${depCmds.join(' ')}`, {
      cwd: dir,
      stdio: 'inherit',
    });

    console.log(chalk.green('✅ Dependencies installed'));
  } catch (_error) {
    console.error(chalk.red('\n❌ Failed to install dependencies'));
    console.log(
      chalk.gray(
        `\nPlease install manually:\n  ${pm} ${devCmds.join(' ')}\n  ${pm} ${depCmds.join(' ')}`,
      ),
    );
  }
}

async function createApiHandler(dir: string, dryRun: boolean): Promise<void> {
  const apiDir = path.join(dir, 'pages', 'api');
  const handlerPath = path.join(apiDir, 'tidewave.ts');

  const handlerContent = `import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (process.env.NODE_ENV === 'development') {
    const { tidewaveHandler } = await import('tidewave/next-js/handler');
    const handler = await tidewaveHandler();
    return handler(req, res);
  } else {
    res.status(404).end();
  }
}

export const config = {
  runtime: 'nodejs',
  api: {
    bodyParser: false, // Tidewave already parses the body internally
  },
};
`;

  if (fs.existsSync(handlerPath)) {
    if (dryRun) {
      console.log(
        chalk.gray(`[DRY RUN] Would ask to overwrite: ${path.relative(dir, handlerPath)}`),
      );
      return;
    }

    const shouldOverwrite = await promptUser(
      chalk.yellow(`\n⚠️ ${path.relative(dir, handlerPath)} already exists. Overwrite? (Y/n): `),
    );

    if (!shouldOverwrite) {
      console.log(chalk.gray(`⏭️ Skipping: ${path.relative(dir, handlerPath)}`));
      return;
    }
  }

  if (dryRun) {
    console.log(chalk.gray(`[DRY RUN] Would create: ${path.relative(dir, handlerPath)}`));
    return;
  }

  fs.mkdirSync(apiDir, { recursive: true });
  fs.writeFileSync(handlerPath, handlerContent, 'utf-8');
  console.log(chalk.green(`✅ Created: ${path.relative(dir, handlerPath)}`));
}

async function createMiddleware(
  dir: string,
  nextVersion: NextJsVersion,
  dryRun: boolean,
): Promise<void> {
  const isNext16Plus = nextVersion.major >= 16;
  const fileName = isNext16Plus ? 'proxy.ts' : 'middleware.ts';
  const filePath = path.join(dir, fileName);

  if (fs.existsSync(filePath)) {
    console.log(chalk.yellow(`⏭️ ${fileName} already exists`));

    // Check if Tidewave is already configured
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('/tidewave') && content.includes('/api/tidewave')) {
      console.log(chalk.green(`✅ ${fileName} already configured for Tidewave`));
      return;
    }

    console.log(chalk.gray(`\n  Please manually add the following to your ${fileName}:\n`));
    printMiddlewareInstructions(isNext16Plus);
    return;
  }

  const middlewareContent = isNext16Plus
    ? `import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL('/api/tidewave', req.url));
  }

  // Here you could add your own logic or different middlewares.
  return NextResponse.next();
}
`
    : `import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL('/api/tidewave', req.url));
  }

  // Here you could add your own logic or different middlewares.
  return NextResponse.next();
}

export const config = {
  matcher: ['/tidewave/:path*'],
};
`;

  if (dryRun) {
    console.log(chalk.gray(`[DRY RUN] Would create: ${fileName}`));
    return;
  }

  fs.writeFileSync(filePath, middlewareContent, 'utf-8');
  console.log(chalk.green(`✅ Created: ${fileName}`));
}

function printMiddlewareInstructions(isNext16Plus: boolean): void {
  if (isNext16Plus) {
    console.log(
      chalk.cyan(`  if (req.nextUrl.pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL('/api/tidewave', req.url));
  }`),
    );
  } else {
    console.log(
      chalk.cyan(`  if (req.nextUrl.pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL('/api/tidewave', req.url));
  }

  // Also add to config.matcher:
  export const config = {
    matcher: ['/tidewave/:path*'],
  };`),
    );
  }
  console.log();
}

async function createInstrumentation(dir: string, dryRun: boolean): Promise<void> {
  // Check both root and src directories
  const rootPath = path.join(dir, 'instrumentation.ts');
  const srcPath = path.join(dir, 'src', 'instrumentation.ts');
  const hasSrcDir = fs.existsSync(path.join(dir, 'src'));

  const instrumentationPath = hasSrcDir ? srcPath : rootPath;

  if (fs.existsSync(rootPath) || fs.existsSync(srcPath)) {
    const existingPath = fs.existsSync(rootPath) ? rootPath : srcPath;
    const existingFile = fs.existsSync(rootPath) ? 'instrumentation.ts' : 'src/instrumentation.ts';

    console.log(chalk.yellow(`⏭️ ${existingFile} already exists`));

    // Check if Tidewave is already configured
    const content = fs.readFileSync(existingPath, 'utf-8');
    if (
      content.includes('TidewaveSpanProcessor') &&
      content.includes('TidewaveLogRecordProcessor')
    ) {
      console.log(chalk.green(`✅ ${existingFile} already configured for Tidewave`));
      return;
    }

    console.log(chalk.gray('\n  Please manually add the following to your instrumentation.ts:\n'));
    printInstrumentationInstructions();
    return;
  }

  const instrumentationContent = `import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { LogRecordProcessor } from "@opentelemetry/sdk-logs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");

    // Add your app own processes here existing configuration
    const sdkConfig: {
      spanProcessors: SpanProcessor[];
      logRecordProcessors: LogRecordProcessor[];
    } = {
      spanProcessors: [],
      logRecordProcessors: [],
    };

    // Conditionally add Tidewave processors in development
    if (process.env.NODE_ENV === "development") {
      const { TidewaveSpanProcessor, TidewaveLogRecordProcessor } = await import(
        "tidewave/next-js/instrumentation"
      );

      sdkConfig.spanProcessors.push(new TidewaveSpanProcessor());
      sdkConfig.logRecordProcessors.push(new TidewaveLogRecordProcessor());
    }

    const sdk = new NodeSDK(sdkConfig);
    sdk.start();
  }
}
`;

  if (dryRun) {
    console.log(chalk.gray(`[DRY RUN] Would create: ${path.relative(dir, instrumentationPath)}`));
    return;
  }

  if (hasSrcDir) {
    fs.mkdirSync(path.dirname(instrumentationPath), { recursive: true });
  }

  fs.writeFileSync(instrumentationPath, instrumentationContent, 'utf-8');
  console.log(chalk.green(`✅ Created: ${path.relative(dir, instrumentationPath)}`));
}

function printInstrumentationInstructions(): void {
  console.log(
    chalk.cyan(`  // Inside your register() function:
  const runtime = process.env.NEXT_RUNTIME;
  const env = process.env.NODE_ENV;

  if (runtime === 'nodejs' && env === 'development') {
    const { TidewaveSpanProcessor, TidewaveLogRecordProcessor } = await import(
      'tidewave/next-js/instrumentation'
    );

    sdkConfig.spanProcessors.push(new TidewaveSpanProcessor());
    sdkConfig.logRecordProcessors.push(new TidewaveLogRecordProcessor());
  }`),
  );
  console.log();
}
