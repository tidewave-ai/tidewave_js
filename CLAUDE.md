# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is the **Tidewave JavaScript CLI** - a command-line tool that acts as an
FFI (Foreign Function Interface) for TypeScript-based Tidewave installations. It
provides documentation extraction, source resolution, and MCP server
functionality for JavaScript/TypeScript projects.

### Architecture

The CLI serves as a bridge between the main TypeScript Tidewave server and
JavaScript/Node.js ecosystem:

- **Documentation Extraction**: Uses TypeScript Compiler API to extract docs and
  type information from modules
- **Source Resolution**: Resolves module paths for both local files and
  dependencies
- **MCP Server**: Provides Model Context Protocol server in both HTTP and STDIO
  transports
- **Multi-Runtime Support**: Works with Node.js (npx), Bun (bunx), and Deno

### Integration with Tidewave Ecosystem

This tool integrates with the main Tidewave TypeScript server (`../ts/`
directory) by handling JavaScript/TypeScript-specific operations while the main
server manages MCP protocol and editor integration. Reference the TypeScript
project structure in `../ts/tc/src/lib/tools/` for understanding expected tool
interfaces.

## Development Setup

### Development Environment

The project is configured for **Bun-first development** with Nix flake support:

- **Primary Runtime**: Bun (via `bunx` commands)
- **Nix Environment**: `flake.nix` provides Bun, Node.js 22, TypeScript, and npm
- **Direnv**: `.envrc` configures Bun installation and TypeScript loader

### Essential Missing Files

The project is in early setup phase and needs these core files:

```
package.json              # Project definition and scripts
tsconfig.json            # TypeScript configuration
bun.lockb                # Bun lock file
src/
  ├── cli.ts              # Main CLI entry point
  ├── commands/           # CLI subcommands (docs, source, mcp)
  └── lib/                # Core functionality libraries
```

### Expected CLI Commands

Based on README specifications:

```bash
# Documentation extraction
bunx tidewave docs <module-path>   # Extract docs for symbols (preferred)
npx tidewave docs <module-path>    # Extract docs for symbols
bunx tidewave source <module>      # Get source file paths

# MCP server
bunx tidewave mcp --port 4000      # HTTP transport
bunx tidewave mcp --stdio          # STDIO transport (recommended)
```

### Development Commands (When Implemented)

```bash
bun run build             # Compile TypeScript (preferred)
bun run dev              # Run with Bun for development
bun test                 # Run tests
bun run lint             # ESLint checking
bun run format           # Prettier formatting
bun run type-check       # TypeScript type checking
```

### CI/CD Configuration

All workflows have been updated for Node.js/TypeScript:

- **CI Pipeline**: Tests across Node.js 18, 20, 22 with npm
- **Publishing**: Publishes to npm registry (not Hex)
- **Release Please**: Configured for Node.js package releases

## Implementation Reference

The proof-of-concept implementation can be found in
`../tidewave_js_poc/src/index.ts` which demonstrates:

- TypeScript Compiler API usage for documentation extraction
- Module resolution with support for local files and dependencies
- Symbol analysis including classes, functions, and member access
- CLI interface using Commander.js

Key classes and patterns from the PoC:

- `TidewaveExtractor`: Main class for TypeScript analysis
- Module path parsing: `module:symbol[#instanceMember|.staticMember]`
- TypeScript program creation and type checking
- JavaScript file analysis for symbols without exports

## Release Configuration

- Uses release-please for automated releases (currently v0.1.0)
- Publishing configured for npm registry with public access
- Updates version in `package.json`, `flake.nix`, and README.md
- Apache 2.0 license from Dashbit

## Nix Configuration

The `flake.nix` provides:

- **Development Shell**: Bun, Node.js 22, TypeScript, npm, and inotify-tools
- **Package Build**: Uses `buildNpmPackage` with Bun for building
- **Binary Installation**: Creates executable at `$out/bin/tidewave`

Note: `npmDepsHash` in `flake.nix` needs to be updated when `package.json` is
created.

## Issue Templates

Configured for JavaScript-specific issues:

- Node.js version and runtime information
- CLI command troubleshooting
- MCP transport debugging (HTTP vs STDIO)
