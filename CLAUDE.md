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
  type information from modules, JavaScript files, and Node.js builtin modules
- **Source Resolution**: Resolves module paths for local files, dependencies,
  and builtin modules
- **Multi-Format Support**: Works with TypeScript (.ts), JavaScript (.js),
  declaration files (.d.ts), and Node.js builtin modules
- **Multi-Runtime Support**: Works with Node.js (npx), Bun (bunx), and Deno

### Integration with Tidewave Ecosystem

This tool integrates with the main Tidewave TypeScript server (`../ts/`
directory) by handling JavaScript/TypeScript-specific operations while the main
server manages MCP protocol and editor integration. Reference the TypeScript
project structure in `../ts/tc/src/lib/tools/` for understanding expected tool
interfaces.

## Current Project Structure

The project has been fully implemented with the following structure:

```
├── package.json              # ✅ Complete with all dependencies
├── tsconfig.json            # ✅ Modern TypeScript config (bundler mode)
├── eslint.config.js         # ✅ Functional programming oriented ESLint
├── vitest.config.js         # ✅ Test configuration
├── bun.lock                # ✅ Bun lockfile
├── src/
│   ├── index.ts            # ✅ Main library exports
│   ├── cli/
│   │   └── index.ts        # ✅ CLI implementation with Commander.js
│   ├── core/
│   │   ├── types.ts        # ✅ TypeScript type definitions
│   │   ├── analyzer.ts     # Analyzer functionality
│   │   └── extractor.ts    # Core extraction logic
│   ├── extraction/
│   │   └── typescript.ts   # ✅ TypeScript Compiler API integration
│   ├── interfaces/
│   │   └── cli/           # CLI interface definitions
│   └── resolution/
│       ├── base.ts        # Base resolution logic
│       └── node.ts        # Node.js module resolution
└── test/                   # ✅ Complete test suite with Vitest
```

## Development Setup

### Development Environment

The project is configured for **Bun-first development** with Nix flake support:

- **Primary Runtime**: Bun (via `bunx` commands)
- **Nix Environment**: `flake.nix` provides Bun, Node.js 22, TypeScript, and npm
- **TypeScript**: Modern bundler-mode configuration with strict settings
- **Testing**: Vitest with both Node.js and Bun runtime support

### Current CLI Commands

The CLI is fully implemented with these working commands:

```bash
# Documentation extraction
bunx tidewave docs <module-path>       # Extract symbol documentation
npx tidewave docs <module-path>        # Extract symbol documentation (Node)

# Source file resolution
bunx tidewave source <module>          # Get source file path for a module
npx tidewave source <module>           # Get source file path for a module (Node)

# Options for docs command:
--config <path>    # Path to tsconfig.json
--json            # Output as JSON

# Module path formats for docs command:
module:symbol                          # Extract a top-level symbol
module:Class#method                    # Extract an instance method
module:Class.method                    # Extract a static method

# Examples:
bunx tidewave docs src/types.ts:SymbolInfo
bunx tidewave docs typescript:createProgram
bunx tidewave docs commander:Command#parse
bunx tidewave docs Math:max                  # Node.js builtin
bunx tidewave source typescript
bunx tidewave source ./src/core/types
```

### Development Commands

```bash
bun run build             # Compile TypeScript
bun run dev              # Run CLI with Bun
bun run start            # Run compiled CLI with Node.js
bun test                 # Run tests with Vitest
bun run test:watch       # Run tests in watch mode
bun run test:bun         # Run tests with Bun runtime
bun run lint             # ESLint checking
bun run lint:fix         # ESLint with auto-fix
bun run format           # Prettier formatting
bun run format:check     # Check Prettier formatting
bun run type-check       # TypeScript type checking
bun run clean            # Clean dist directory
```

### CI/CD Configuration

All workflows have been updated for Node.js/TypeScript:

- **CI Pipeline**: Tests across Node.js 18, 20, 22 with npm
- **Publishing**: Publishes to npm registry (not Hex)
- **Release Please**: Configured for Node.js package releases

## Implementation Status

The CLI has been fully implemented based on the proof-of-concept in
`../tidewave_js_poc/src/index.ts` with these features:

### ✅ Completed Features

- **TypeScript Compiler API**: Full integration for documentation extraction
- **Module Resolution**: Support for local files, dependencies, and builtin
  modules
- **Symbol Analysis**: Classes, functions, interfaces, enums, and member access
- **Multi-Format Support**: TypeScript (.ts), JavaScript (.js), and declaration
  files (.d.ts)
- **CLI Interface**: Commander.js with comprehensive help text and examples
- **Error Handling**: Proper error messages and graceful failure handling
- **Testing**: Comprehensive test suite with 51 passing tests

### Key Implementation Patterns

- **Functional Architecture**: Uses functional `TidewaveExtractor` object
  instead of classes
- **Module Path Parsing**: `module:symbol[#instanceMember|.staticMember]` format
- **Dedicated Programs**: Creates dedicated TypeScript programs for optimal type
  checking
- **JavaScript Support**: Handles plain JS files with JSDoc extraction
- **Builtin Module Support**: Works with Node.js builtin modules like Math, fs,
  etc.

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
