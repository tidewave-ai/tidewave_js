# Tidewave

> Tidewave Web for Next.js is currently in alpha testing!

Tidewave is the coding agent for full-stack web app development.
[See our website](https://tidewave.ai) for more information.

This package is recommended for JavaScript-powered backends as well as
JavaScript libraries/applications using a backend as a service (such as
Supabase). If you are using React with Phoenix, Rails, Django, or another
server-side framework, [follow the steps here instead](http://hexdocs.pm/tidewave/react.html).

This project can also be used as a standalone Model Context Protocol (MCP)
server for your editors.

## Installation

### Next.js

Install it with:

```sh
$ npm install -D tidewave
# or
$ yarn add -D tidewave
# or
$ pnpm add --save-dev tidewave
# or
$ bun add --dev tidewave
```

Then create `pages/api/tidewave.ts` with:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (process.env.NODE_ENV === 'development') {
    const { tidewaveHandler } = await import('tidewave/next-js');
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
```

_Note: this uses the **Pages Router**, however it works regardless of the router
type you use in your application._

Then create (or modify) `middleware.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL(`/api/tidewave`, req.url));
  }

  // Here you could add your own logic or different middlewares.
  return NextResponse.next();
}

export const config = {
  matcher: ['/tidewave/:path*'],
};
```

Finally, we recommend creating the `instrumentation.ts` file below,
to expose your application's spans, events, and logs to Tidewave/MCP:

```typescript
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';

export async function register() {
  const runtime = process.env.NEXT_RUNTIME;
  const env = process.env.NODE_ENV;

  // Add your app own processes here existing configuration
  const sdkConfig = {
    spanProcessors: [],
    logRecordProcessors: [],
  };

  // Conditionally add Tidewave processors in development
  if (runtime === 'nodejs' && env === 'development') {
    const { TidewaveSpanProcessor, TidewaveLogRecordProcessor } = await import(
      'tidewave/next-js/instrumentation'
    );

    sdkConfig.spanProcessors.push(new TidewaveSpanProcessor());
    sdkConfig.logRecordProcessors.push(new TidewaveLogRecordProcessor());
  }

  const sdk = new NodeSDK(sdkConfig);
  sdk.start();
}
```

### React + Vite

Install it with:

```sh
$ npm install -D tidewave
# or
$ yarn add -D tidewave
# or
$ pnpm add --save-dev tidewave
# or
$ bun add --dev tidewave
```

Then configure your `vite.config.js` (also works for `.ts` and `.mjs`):

```javascript
import { defineConfig } from 'vite';
import tidewave from 'tidewave/vite-plugin';

export default defineConfig({
  plugins: [tidewave()],
});
```

### Configuration

Next.js' `tidewaveHandler` and Vite's `tidewave` accept the configuration options below:

- `allow_remote_access:` allow remote connections when true (default false)
- `allowed_origins:` defaults to the current host/port
- `team`: enable Tidewave Web for teams

## CLI

Tidewave.js also comes with a CLI for developers who want to use it
as a standalone MCP or query its functionality directly. Note this
functionality is separate from Tidewave Web.

### STDIO MCP

Configure your editor to run `tidewave` in the same directory as your
`package.json` as a STDIO MCP Server:

```bash
npx tidewave mcp
# or with Bun
bunx tidewave mcp
# or with Deno
deno run npm:tidewave mcp
```

Available options:

- `--prefix path` - Specify the directory to find the `package.json` file

### Get docs / get source

Fetch docs or retrieve the source location for classes, types, methods, etc:

```bash
# Extract documentation for a symbol
npx tidewave docs <module-path>

# Get source file location for a module
npx tidewave source <module-path>
```

Here are some examples:

```bash
# Local TypeScript/JavaScript files
npx tidewave docs ./src/utils:formatDate
npx tidewave docs ./components:Button#onClick

# Node.js dependencies
npx tidewave docs typescript:createProgram
npx tidewave docs react:Component#render

# Get source file locations
npx tidewave source ./src/utils:formatDate
npx tidewave source typescript:createProgram
```

## Contributing

```bash
bun install              # Install dependencies
bun run build            # Compile TypeScript
bun run dev              # Run CLI with Bun
bun test                 # Run tests with Vitest
bun run lint             # ESLint checking
bun run lint:fix         # ESLint with auto-fix
bun run format           # Prettier formatting
bun run format:check     # Check Prettier formatting
bun run clean            # Clean dist directory
```

## License

Copyright (c) 2025 Dashbit

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at
[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
