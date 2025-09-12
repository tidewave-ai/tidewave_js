# Tidewave

Tidewave is the coding agent for full-stack web app development.
[See our website](https://tidewave.ai) for more information.

Our current release connects your editor's assistant to your web framework
runtime via [MCP](https://modelcontextprotocol.io/). Support for Tidewave Web
will come in future releases.

## Usage

### Standalone MCP

Tidewave's MCP server gives your editor and coding agents access to the
documentation, type annotations, and source file locations of the packages being
currently used by your project, without relying on external systems.

Simply configure your editor to run `tidewave` in the same directory as your
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

This exposes MCP endpoints at `/tidewave/mcp` and `/tidewave/shell` during
development.

Configuration options:

```javascript
tidewave({
  allowRemoteAccess: false, // Allow access from remote IPs
  allowedOrigins: ['*'], // Allowed CORS origins
});
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

### Runtime Support

Tidewave JavaScript supports multiple JavaScript runtimes:

- **Node.js** - Full support with npm/npx
- **Bun** - Native support with bunx
- **Deno** - Support via npm: protocol

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
