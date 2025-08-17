# Tidewave

Tidewave speeds up development with an AI assistant that understands your web
application, how it runs, and what it delivers. Our current release connects
your editor's assistant to your web framework runtime via
[MCP](https://modelcontextprotocol.io/).

[See our website](https://tidewave.ai) for more information.

## Installation

### CLI Usage

Tidewave provides a CLI tool for extracting documentation and source information
from TypeScript/JavaScript projects. Use it directly via npx/bunx:

```bash
# Extract documentation for a symbol
npx tidewave docs <module-path>

# Get source file path for a module
npx tidewave source <module>

# Start MCP server for integration
npx tidewave mcp [options]
```

### Documentation Extraction

Extract documentation and type information for any symbol:

```bash
# Local TypeScript/JavaScript files
npx tidewave docs ./src/utils:formatDate
npx tidewave docs ./components:Button#onClick

# Node.js dependencies
npx tidewave docs typescript:createProgram
npx tidewave docs react:Component#render

# Get source file paths
npx tidewave source ./src/utils
npx tidewave source typescript
```

### MCP Server

Start the Tidewave MCP server for editor integration:

```bash
npx tidewave mcp --port 4000
# or
bunx tidewave mcp --stdio
# or with Deno
deno run npm:tidewave mcp --port 4000
```

Available MCP options:

- `--port <number>` - HTTP server port (default: 4000)
- `--stdio` - Use STDIO transport instead of HTTP
- `--allow-remote-access` - Allow connections from non-localhost addresses
- `--allowed-origins <origins>` - Comma-separated list of allowed origins for
  CORS

The MCP endpoint will be available at http://localhost:4000/tidewave/mcp by
default.
[You must configure your editor and AI assistants accordingly](https://hexdocs.pm/tidewave/mcp.html).

## Integration with TypeScript Projects

Tidewave JavaScript acts as an FFI (Foreign Function Interface) for
TypeScript-based Tidewave installations, providing:

- TypeScript Compiler API access for documentation extraction
- Node.js ecosystem integration
- React/Next.js framework support
- Package resolution and source location services

When used alongside the main TypeScript Tidewave server, this tool handles
JavaScript/TypeScript-specific operations while the main server manages the MCP
protocol and editor integration.

## Troubleshooting

For HTTP MCP server, Tidewave expects to run on `localhost` by default. If you
need to access it from a different machine:

```bash
npx tidewave mcp --allow-remote-access --allowed-origins "http://company.local"
```

For STDIO transport (recommended for editor integrations):

```bash
npx tidewave mcp --stdio
```

If you want to use Docker for development, you either need to enable remote
access or automatically redirect the relevant ports, as done by
[devcontainers](https://code.visualstudio.com/docs/devcontainers/containers).
See our [containers](https://hexdocs.pm/tidewave/containers.html) guide for more
information.

## Runtime Support

Tidewave JavaScript supports multiple JavaScript runtimes:

- **Node.js** - Full support with npm/npx
- **Bun** - Native support with bunx
- **Deno** - Support via npm: protocol

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
