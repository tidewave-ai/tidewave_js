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

Then, configure it:

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

Then, configure it:

Create `pages/api/tidewave.ts` with:

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

This exposes the MCP endpoint at `/tidewave/mcp`.

### Logging Integration

Tidewave can capture application logs using OpenTelemetry, making them available
via the `get_logs` MCP tool for debugging. This feature is **development-only**
and uses an in-memory circular buffer.

#### Next.js Logging

To enable logging in Next.js, create an `instrumentation.ts` file in your
project root (or `src/` directory):

```typescript
// instrumentation.ts
export { tidewaveLogger as register } from 'tidewave/next-js';
```

This will:

- Automatically patch `console.log`, `console.info`, `console.warn`,
  `console.error`, and `console.debug`
- Capture all console output in a circular buffer (default: 1024 entries)
- Make logs available via the `get_logs` MCP tool
- Only run in development mode (`NODE_ENV=development`)
- Skip initialization in Edge runtime

**Configuration:**

Set the buffer size via environment variable:

```bash
TIDEWAVE_LOG_BUFFER_SIZE=2048 npm run dev
```

**Requirements:**

- Next.js 13+ with `instrumentation.ts` support
- Enable in `next.config.js`:
  ```javascript
  module.exports = {
    experimental: {
      instrumentationHook: true,
    },
  };
  ```

#### Vite Logging

Logging is automatically enabled when you use the Vite plugin. No additional
configuration needed!

```javascript
import { defineConfig } from 'vite';
import tidewave from 'tidewave/vite-plugin';

export default defineConfig({
  plugins: [tidewave()],
});
```

The plugin will automatically:

- Capture all console output during development
- Store logs in a circular buffer (default: 1024 entries)
- Make logs available via the `get_logs` MCP tool

#### Using the `get_logs` Tool

Once logging is enabled, use the `get_logs` MCP tool to retrieve logs:

**Parameters:**

- `tail` (number, default: 100): Number of log entries to return from the end
- `level` (string, optional): Filter by severity level (`DEBUG`, `INFO`, `WARN`,
  `ERROR`)
- `grep` (string, optional): Filter logs with regex pattern (case insensitive)
- `since` (string, optional): ISO 8601 timestamp - return logs after this time

**Examples:**

```javascript
// Get last 50 logs
get_logs({ tail: 50 });

// Get only errors
get_logs({ level: 'ERROR' });

// Search for specific text
get_logs({ grep: 'api/users' });

// Get logs since a specific time
get_logs({ since: '2025-01-15T10:30:00Z' });

// Combine filters
get_logs({ tail: 100, level: 'ERROR', grep: 'database' });
```

**Response Format:**

```json
{
  "logs": [
    {
      "timestamp": "2025-01-15T10:30:45.123Z",
      "level": "INFO",
      "message": "Server started on port 3000",
      "attributes": {
        "log.origin": "console",
        "log.method": "log"
      }
    }
  ],
  "metadata": {
    "returned": 50,
    "totalLogs": 1024,
    "bufferSize": 1024,
    "bufferUsage": "100.0%",
    "filters": {
      "tail": 50
    }
  }
}
```

**Note:** Tidewave's internal logs (prefixed with `[Tidewave]`) are
automatically filtered out.

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
