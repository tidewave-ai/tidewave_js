# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-08-29

### Added

#### Core Features
- **MCP Server Support**: STDIO-based Model Context Protocol server for integration with AI coding assistants
- **Documentation Extraction**: Extract TypeScript/JavaScript documentation and type information for symbols, classes, functions, and methods
- **Source Location Resolution**: Get source file paths for modules, symbols, and members
- **Multi-format Support**: Support for local files, npm dependencies, and Node.js builtin modules

#### Module Reference Formats
- `module:symbol` - Extract documentation for top-level symbols
- `module:Class#method` - Extract documentation for instance methods
- `module:Class.method` - Extract documentation for static methods
- `node:Class#method` - Extract documentation for Node.js builtin instance methods
- `node:Class.method` - Extract documentation for Node.js builtin static methods

#### CLI Commands
- `tidewave mcp` - Start the MCP server via STDIO
- `tidewave docs <module-path>` - Extract documentation for a symbol
- `tidewave source <module>` - Get the source file path for a module

#### Runtime Support
- Full support for Node.js with npm/npx
- Native support for Bun with bunx
- Support for Deno via npm: protocol

### Fixed
- Handle source location of symbols and members correctly (#7)
- Handle prefix option only on CLI layer, not in core extraction (#6)
- Correctly extract JavaScript/TypeScript symbols, instances, and methods
- Show interface types correctly
- Handle falsy values and improve error handling (#1)

### Changed
- Refactored codebase into modular structure for better maintainability
- Simplified module resolution and extraction logic
- Improved TypeScript and Node.js module resolution
- Changed config flag for project path handling (#3)

### Technical Details
- Built with TypeScript for type safety
- Uses TypeScript Compiler API for accurate code analysis
- Supports ESM modules
- Includes comprehensive error handling and user-friendly error messages
- Optimized for use with AI coding assistants through MCP protocol

[0.1.0]: https://github.com/dashbit/tidewave_javascript/releases/tag/v0.1.0