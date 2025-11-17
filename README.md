# Tidewave

Tidewave is the coding agent for full-stack web app development. Integrate
Claude Code, OpenAI Codex, and other agents with your web app and web framework
at every layer, from UI to database. [See our website](https://tidewave.ai) for
more information.

This project supports:

- Next.js 15/16

- React + Vite frontends, with either a backend as a service (such as Supabase)
  or a third-party framework

If you are using React with Django, FastAPI, Flask, Phoenix, or Rails,
[follow the steps here instead](http://hexdocs.pm/tidewave/react.html).

This project can also be used through the CLI or as a standalone Model Context
Protocol (MCP) server for your editors.

## Installation

### Next.js

If you are using Next.js, install Tidewave with:

```sh
$ npx tidewave install
# or
$ yarn dlx tidewave install
# or
$ pnpm dlx tidewave install
# or
$ bunx tidewave install
```

And you are almost there! Now make sure
[Tidewave is installed](https://hexdocs.pm/tidewave/installation.html) and you
are ready to connect Tidewave to your app.

In case the command abovees do not work, you can toggle the manual installation
instructions below

<details>
<summary>Show manual installation steps</summary><br />

**1. Add Tidewave as a dependency**

```sh
$ npm install -D tidewave
# or
$ yarn add -D tidewave
# or
$ pnpm add --save-dev tidewave
# or
$ bun add --dev tidewave
```

**2. Create `pages/api/tidewave.ts`**

Then create `pages/api/tidewave.ts` with:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

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
```

**3. Create the proxy.ts or middleware.ts**

If you are using Next.js 16+, then create (or modify) `proxy.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL('/api/tidewave', req.url));
  }

  // Here you could add your own logic or different middlewares.
  return NextResponse.next();
}
```

For Next.js 15+ and earlier, create (or modify) `middleware.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';

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
```

**4. Create instrumentation.ts**

Finally, we expose your application's spans, events, and logs to Tidewave MCP.
First install the NodeSDK:

```sh
npm install @opentelemetry/sdk-node
npm install -D @opentelemetry/sdk-trace-base @opentelemetry/sdk-logs
```

And then create (or modify) a custom `instrumentation.ts` file in the root
directory of the project (or inside `src` folder if using one):

```typescript
// instrumentation.ts
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');

    // Add your app own processes here existing configuration
    const sdkConfig: {
      spanProcessors: SpanProcessor[];
      logRecordProcessors: LogRecordProcessor[];
    } = {
      spanProcessors: [],
      logRecordProcessors: [],
    };

    // Conditionally add Tidewave processors in development
    if (process.env.NODE_ENV === 'development') {
      const { TidewaveSpanProcessor, TidewaveLogRecordProcessor } =
        await import('tidewave/next-js/instrumentation');

      sdkConfig.spanProcessors.push(new TidewaveSpanProcessor());
      sdkConfig.logRecordProcessors.push(new TidewaveLogRecordProcessor());
    }

    const sdk = new NodeSDK(sdkConfig);
    sdk.start();
  }
}
```

</details>

### React + Vite

If you are building a front-end application, using a backend as a service, such
as Supabase, or a non-officially supported web framework, we recommend using our
React + Vite integration.

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

Now make sure
[Tidewave is installed](https://hexdocs.pm/tidewave/installation.html) and you
are ready to connect Tidewave to your app.

If you are using Supabase or similar, you can prompt Tidewave to use the
`supabase` CLI so it has complete access to your database. For non-officially
supported web frameworks, our React + Vite integration allows Tidewave Web to
perform changes on the front-end, and the agent will be able to modify your
backend code as usual, but some functionality (such as accessing logs, doing
database calls, etc) won't be available.

### Configuration

Next.js' `tidewaveHandler` and Vite's `tidewave` accept the configuration
options below:

- `allow_remote_access:` allow remote connections when true (default false).
  Enable this only if you trust your network and you want Tidewave MCP to be
  accessed from another trusted machine
- `team`: enable Tidewave Web for teams

## CLI

Tidewave.js also comes with a CLI for developers who want to use it as a
standalone MCP or query its functionality directly. Note this functionality is
separate from Tidewave Web.

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

## Acknowledgements

A thank you to [Zoey](https://github.com/zoedsoupe/) for implementing both Next.js and
Vite integrations as well as the CLI interface.

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
