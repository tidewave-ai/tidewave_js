# Tidewave

Tidewave is the coding agent for full-stack web app development.
[See our website](https://tidewave.ai) for more information.

This package is recommended for JavaScript-powered backends as well as
JavaScript libraries/applications without a backend. If you are using React with
Phoenix, Rails, Django, or another server-side framework,
[follow the steps here instead](http://hexdocs.pm/tidewave/react.html).

Our current release connects your editor's assistant to JavaScript runtime via
[MCP](https://modelcontextprotocol.io/). Tidewave's MCP server gives your editor
and coding agents access to the documentation, type annotations, and source file
locations of the packages being currently used by your project, without relying
on external systems.

Support for Tidewave Web will come in future releases.

## Usage

### Standalone MCP

Configure your editor to run `tidewave` in the same directory as your
`package.json` as a STDIO MCP Server:

```bash
npx tidewave mcp
# or with Bun
bunx tidewave mcp
# or with Deno
deno run npm:tidewave mcp
```

Available MCP options:

- `--prefix path` - Specify the directory to find the `package.json` file

### HTTP MCP via Vite Plugin

Tidewave also provides HTTP-based MCP access through a Vite plugin for
development environments. Add the plugin to your `vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import tidewave from 'tidewave/vite-plugin';

export default defineConfig({
  plugins: [tidewave()],
});
```

This exposes the MCP endpoint at `/tidewave/mcp`.

Configuration options:

```javascript
tidewave({
  allowRemoteAccess: false, // Allow access from remote IPs
  allowedOrigins: ['localhost'], // Allowed origins: defaults to the Vite's host+port
});
```

### HTTP MCP for Next.js

Tidewave provides seamless integration with Next.js, you only need to expose its
routes and then plug its middleware accordingly.

**Important:** Tidewave is a development-only tool and should not run in
production. See the [Production Builds](#production-builds-with-nextjs) section
below for details.

**Pages Router** - Create `pages/api/tidewave/[...all].ts`:

```typescript
import { tidewaveHandler } from 'tidewave/next-js';

export default await tidewaveHandler();

// Next.js specific config
export const config = {
  runtime: 'nodejs',
  api: {
    bodyParser: false, // Tidewave already parses the body internally
  },
};
```

**Middleware** - Then create (or modify) `middleware.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/tidewave')) {
    return NextResponse.rewrite(new URL(`/api${pathname}`, req.url));
  }

  // here you could add your own logic or different middlewares
  // while changing the config.matcher to a string[]
  return NextResponse.next();
}

export const config = {
  matcher: '/tidewave/(.*)',
};
```

This exposes the MCP endpoint at `/tidewave/mcp`.

#### Production Builds with Next.js

Tidewave automatically prevents itself from running in production environments
through multiple safeguards:

**1. Conditional Exports (Webpack)**

When using Next.js's default bundler (webpack), the package uses conditional
exports to automatically substitute a production stub that returns 404

With webpack, this means **zero development code is included in your production
bundle**.

**2. Import-Time Check (Safety Net)**

For bundlers that don't support conditional exports (like Turbopack), Tidewave
includes an import-time check that throws an error when `NODE_ENV=production`:

This fails fast when your production server starts, preventing accidental dev
tool exposure.

If you're using Turbopack, we recommend the following approach on pages router:

```typescript
// pages/api/tidewave/[...all].ts
import { tidewaveHandler } from 'tidewave/next-js';

const handler =
  process.env.NODE_ENV === 'development'
    ? await tidewaveHandler()
    : () => {
        /* noop */
      };

export default handler;

export const config = {
  runtime: 'nodejs',
  api: {
    bodyParser: false, // Tidewave already parses the body internally
  },
};
```

### CLI Usage

Tidewave also provides the MCP features over a CLI tool. Use it directly via
npx/bunx/deno:

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
