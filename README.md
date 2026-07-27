# Tidewave

Tidewave JS is an MCP server that provides runtime-level tools for developing JS
apps using coding agents. This project supports:

- TanStack Start with React
- Vite with React/Vue (which includes Astro, VitePress, etc)

Your agent will be able to use this MCP server to talk to your running app in
development to:

- execute code in the context of the running app (like an terminal session for
  agents)
- read the app's live logs
- get source locations of modules and functions
- read documentation pinned to the exact package versions your project depends
  on

This MCP server is an open-source component of [Tidewave](https://tidewave.ai).

You can use this project as a standalone MCP server or integrated with the
[Tidewave product](https://tidewave.ai) by following the installation
instructions below.

This project can also be used through the CLI or as
[a standalone Model Context Protocol server](https://tidewave.hexdocs.pm/mcp.html).

## Installation

If you are using Vite (with React/Vue) or TanStack Start with React, install
Tidewave with:

```sh
$ npx tidewave install
# or
$ yarn dlx tidewave install
# or
$ pnpm dlx tidewave install
# or
$ bunx tidewave install
```

And you are almost there! Now make sure to add the Tidewave MCP server to your
editor or MCP client configuration as the type "http" (streamable), pointing to
the `/tidewave/mcp` path and port your web application is running at.

We also have specific instructions for:

- [Claude Code](https://tidewave.hexdocs.pm/mcp_claude_code.html)
- [Codex](https://tidewave.hexdocs.pm/mcp_codex.html)
- [Cursor](https://tidewave.hexdocs.pm/mcp_cursor.html)
- [Neovim](https://tidewave.hexdocs.pm/mcp_neovim.html)
- [OpenCode](https://tidewave.hexdocs.pm/mcp_opencode.html)
- [VS Code](https://tidewave.hexdocs.pm/mcp_vscode.html)
- [Others](https://tidewave.hexdocs.pm/mcp.html)

In case the command above does not work, you can toggle the manual installation
instructions below.

### Manual installation

<details>
<summary>Show manual installation steps for TanStack Start</summary><br />

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

**2. Configure Vite**

Configure your `vite.config.js` (also works for `.ts` and `.mjs`):

```javascript
import { defineConfig } from 'vite';
import tidewave from 'tidewave/vite-plugin';

export default defineConfig({
  plugins: [tidewave()],
});
```

**3. Configure TanStack Start**

Finally, create or modify `src/start.ts` to import Tidewave in development:

```ts
import { createStart } from '@tanstack/react-start';

// Import Tidewave only in development.
if (process.env.NODE_ENV === 'development' && typeof window === 'undefined') {
  import('tidewave/tanstack');
}

export const startInstance = createStart(() => {
  return {};
});
```

</details>

<details>
<summary>Show manual installation steps for Vite</summary><br />

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

**2. Configure Vite**

Configure your `vite.config.js` (also works for `.ts` and `.mjs`):

```javascript
import { defineConfig } from 'vite';
import tidewave from 'tidewave/vite-plugin';

export default defineConfig({
  plugins: [tidewave()],
});
```

</details>

## Configuration

Vite's `tidewave` plugin accepts the configuration options below:

- `allowRemoteAccess`: Tidewave only allows requests from localhost by default,
  even if your server listens on other interfaces, for security purposes. Read
  [our security guidelines for more information and when to allow remote access](https://tidewave.hexdocs.pm/security.html)
  (if you know what you are doing)
- `allowedOrigins`: a list of values matched against the `Origin` header to
  prevent cross origin and DNS rebinding attacks. Each value must be a string of
  shape `[scheme:]//host[:port]`, where both scheme and port are optional. The
  host may also start with `*`. Example: `["//localhost:8000", "//*.test"]`. By
  default, Tidewave allows Vite's configured server host and port, using
  `localhost` when Vite uses its implicit host
- `tmpDir`: temporary directory Tidewave uses for screenshots and recordings.
  Defaults to `tmp`, storing files under `tmp/tidewave/screenshots` and
  `tmp/tidewave/recordings`
- `team`: enable Tidewave Web for teams
- `toolbar`: controls whether the Tidewave toolbar is injected into your HTML
  pages. Defaults to `true`

## Available tools

- `get_docs` - get the documentation for a given module/namespace or a
  class/interface/enum/type in that namespace. It consults the exact versions
  used by the project, ensuring you always get correct information

- `get_source_location` - get the source location for a given module/namespace
  or a class/interface/enum/type in that namespace, so an agent can directly
  read the source skipping search

- `get_logs` - reads console log written by the server

- `project_eval` - evaluates code within the runtime itself, giving the agent
  access to dependencies, server code, and all in-memory data

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
npx tidewave docs ./src/utils
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

A thank you to [Zoey](https://github.com/zoedsoupe/) for implementing the Vite
integration as well as the CLI interface.

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
