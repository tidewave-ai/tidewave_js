import ts from 'typescript';
import path from 'node:path';
import type {
  ExtractionRequest,
  ExtractResult,
  ExtractorOptions,
  ResolveResult,
  ExtractError,
  InternalResolveResult,
  ExportSummary,
} from '../core';
import { createExtractError, resolveError, isResolveError, isExtractError } from '../core';
import { loadTsConfig, resolveModule, resolveNodeBuiltin } from './module-resolver';
import { findSymbolInJavaScriptFile, getSymbolInfo } from './symbol-finder';
import { getSymbolKind, getFileOverview } from './utils';

// Parse module path into extraction request
function parseModulePath(modulePath: string): ExtractionRequest | ExtractError {
  // Handle empty or invalid paths
  if (!modulePath || modulePath.trim() === '') {
    return createExtractError('INVALID_REQUEST', 'Module path is required');
  }

  // Handle node: prefix specially
  let module: string;
  let symbolPath: string | undefined;

  if (modulePath.startsWith('node:')) {
    // For node:Math -> module='node:Math', symbol='Math'
    // For node:Math.min -> module='node:Math', symbol='Math.min'
    const nodeSymbol = modulePath.slice(5); // Remove 'node:' prefix
    const [baseSymbol] = nodeSymbol.split('.'); // Get 'Math' from 'Math.min'
    module = `node:${baseSymbol}`; // 'node:Math'
    symbolPath = nodeSymbol; // 'Math' or 'Math.min'
  } else {
    // Regular module[:symbol] format
    const colonIndex = modulePath.indexOf(':');

    if (colonIndex === -1) {
      // No colon found - file-level request
      module = modulePath;
      symbolPath = undefined;
    } else if (colonIndex === 0) {
      // Only colon at start
      return createExtractError('INVALID_REQUEST', 'Module path is required before ":"');
    } else {
      // Split on first colon
      module = modulePath.substring(0, colonIndex);
      symbolPath = modulePath.substring(colonIndex + 1);

      // If symbol part is empty after colon, return error
      if (!symbolPath || symbolPath.trim() === '') {
        return createExtractError('INVALID_REQUEST', 'Symbol name is required after ":"');
      }
    }
  }

  // If no symbol path, return file-level request
  if (!symbolPath) {
    return { module, symbol: undefined, member: undefined, isStatic: false };
  }

  // Check for instance member (Constructor#instanceMember)
  if (symbolPath.includes('#')) {
    const [symbol, member] = symbolPath.split('#');
    if (!symbol || !member) {
      return createExtractError(
        'INVALID_REQUEST',
        `Invalid format. Expected 'symbol#instance-member', got '${symbolPath}'`,
      );
    }
    return { module, symbol, member, isStatic: false };
  }

  // Check for static member (Constructor.staticMember)
  if (symbolPath.includes('.')) {
    const [symbol, member] = symbolPath.split('.');
    if (!symbol || !member) {
      return createExtractError(
        'INVALID_REQUEST',
        `Invalid format. Expected 'symbol.static-member', got '${symbolPath}'`,
      );
    }
    return { module, symbol, member, isStatic: true };
  }

  return { module, symbol: symbolPath, member: undefined, isStatic: false };
}

// Get all exported symbols with their summaries
function getExportSummaries(
  moduleSymbol: ts.Symbol | undefined,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): ExportSummary[] {
  if (!moduleSymbol) {
    return [];
  }

  try {
    const exports = checker.getExportsOfModule(moduleSymbol);
    const summaries: ExportSummary[] = [];

    for (const exp of exports) {
      const name = exp.getName();
      const kind = getSymbolKind(exp);

      // Get line number from declaration
      const decl = exp.valueDeclaration ?? exp.declarations?.[0];
      let line = 0;
      if (decl) {
        const pos = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
        line = pos.line + 1; // 1-indexed
      }

      // Get brief documentation (first line)
      const fullDoc = ts.displayPartsToString(exp.getDocumentationComment(checker));
      const briefDoc = fullDoc.split('\n')[0]?.trim();

      summaries.push({
        name,
        kind,
        line,
        documentation: briefDoc || undefined,
      });
    }

    // Sort by line number
    return summaries.sort((a, b) => a.line - b.line);
  } catch {
    return [];
  }
}

// Extract documentation for a module:symbol path
export async function extractDocs(modulePath: string): Promise<ExtractResult> {
  const options: ExtractorOptions = { prefix: process.cwd() };
  const parseResult = parseModulePath(modulePath);
  if ('error' in parseResult) {
    return parseResult;
  }
  const { module, symbol, member, isStatic } = parseResult;
  const config = loadTsConfig(options.prefix);

  // Try to resolve as a regular module first
  let resolvedModule: InternalResolveResult = resolveModule(module, config.options);
  let isGlobalModule = false;

  // If regular module resolution fails, try as a node builtin
  if (isResolveError(resolvedModule)) {
    const nodeBuiltinResolution = resolveNodeBuiltin(module, config.options);
    if (!isResolveError(nodeBuiltinResolution)) {
      resolvedModule = nodeBuiltinResolution;
      isGlobalModule = true;
    }
  }

  if (isResolveError(resolvedModule)) {
    return createExtractError('MODULE_NOT_FOUND', `Module '${module}' not found`);
  }

  const { sourceFile, program } = resolvedModule;
  const checker = program.getTypeChecker();

  // Handle file-level request (no symbol specified)
  if (symbol === undefined) {
    const overview = getFileOverview(sourceFile);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    const exports = getExportSummaries(moduleSymbol, sourceFile, checker);

    // Format path as relative (consistent with SymbolInfo.location)
    let relativePath = sourceFile.fileName;
    const cwd = process.cwd();
    if (relativePath.startsWith(cwd)) {
      relativePath = path.relative(cwd, relativePath);
    }

    return {
      path: relativePath,
      overview,
      exportCount: exports.length,
      exports,
    };
  }

  let targetSymbol: ts.Symbol | undefined;

  if (isGlobalModule) {
    // For node builtin modules, extract the actual symbol name
    const actualSymbolName = module.startsWith('node:') ? module.slice(5) : module;

    // For builtin modules, get the symbol from the global scope
    const globalSymbols = checker.getSymbolsInScope(sourceFile, ts.SymbolFlags.Value);
    targetSymbol = globalSymbols.find((s: ts.Symbol) => s.getName() === actualSymbolName);

    if (!targetSymbol) {
      // Try getting it from the AST node directly
      const [identifierNode] = sourceFile.statements;
      if (identifierNode && ts.isVariableStatement(identifierNode)) {
        const [declaration] = identifierNode.declarationList.declarations;
        if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
          targetSymbol = checker.getSymbolAtLocation(declaration.initializer);
        }
      }
    }
  } else {
    // Regular module handling
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      const exportSymbol = exports.find((exp: ts.Symbol) => exp.getName() === symbol);

      if (exportSymbol) {
        // Check if the export symbol has a meaningful valueDeclaration
        // OR if it's a type-only symbol like interface/type alias/enum
        if (
          exportSymbol.valueDeclaration &&
          (ts.isFunctionDeclaration(exportSymbol.valueDeclaration) ||
            ts.isClassDeclaration(exportSymbol.valueDeclaration) ||
            ts.isVariableDeclaration(exportSymbol.valueDeclaration) ||
            ts.isEnumDeclaration(exportSymbol.valueDeclaration))
        ) {
          targetSymbol = exportSymbol;
        } else if (
          exportSymbol.flags &
          (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum)
        ) {
          targetSymbol = exportSymbol;
        } else {
          targetSymbol = findSymbolInJavaScriptFile(sourceFile, checker, symbol);
        }
      } else {
        return createExtractError(
          'SYMBOL_NOT_FOUND',
          `Symbol '${symbol}' not found in module '${module}'. Available exports: ${exports
            .map((e: ts.Symbol) => e.getName())
            .join(', ')}`,
        );
      }
    } else {
      // JavaScript file - look for symbols in statements
      targetSymbol = findSymbolInJavaScriptFile(sourceFile, checker, symbol);

      if (!targetSymbol) {
        return createExtractError(
          'SYMBOL_NOT_FOUND',
          `Symbol '${symbol}' not found in JavaScript module '${module}'`,
        );
      }
    }
  }

  if (!targetSymbol) {
    let symbolToShow: string;
    if (isGlobalModule) {
      symbolToShow = module.startsWith('node:') ? module.slice(5) : module;
    } else {
      symbolToShow = symbol;
    }
    return createExtractError('SYMBOL_NOT_FOUND', `Symbol '${symbolToShow}' not found`);
  }

  const result = getSymbolInfo(checker, targetSymbol, member, isStatic);
  return result;
}

// Get source path for a module or symbol
export async function getSourceLocation(reference: string): Promise<ResolveResult> {
  const options: ExtractorOptions = { prefix: process.cwd() };

  // Check if this is a module:symbol reference
  if (reference.includes(':')) {
    // Parse the reference to get module and symbol parts
    const parseResult = parseModulePath(reference);
    if ('error' in parseResult) {
      return {
        success: false,
        error: {
          code: 'MODULE_NOT_FOUND',
          message: parseResult.error.message,
        },
      };
    }

    const { module, symbol, member, isStatic } = parseResult;

    // In this branch, we know reference contains ':', so symbol should be defined
    // If symbol is undefined here, it means parseModulePath returned successfully for a file-level request
    // which shouldn't happen in this code path
    if (!symbol) {
      return {
        success: false,
        error: {
          code: 'INVALID_SPECIFIER',
          message: 'Symbol reference required for source location lookup',
        },
      };
    }

    const config = loadTsConfig(options.prefix);

    // Try to resolve as a regular module first
    let resolvedModule: InternalResolveResult = resolveModule(module, config.options);
    let isGlobalModule = false;

    // If regular module resolution fails, try as a node builtin
    if (isResolveError(resolvedModule)) {
      const nodeBuiltinResolution = resolveNodeBuiltin(module, config.options);
      if (!isResolveError(nodeBuiltinResolution)) {
        resolvedModule = nodeBuiltinResolution;
        isGlobalModule = true;
      }
    }

    if (isResolveError(resolvedModule)) {
      return {
        success: false,
        error: {
          code: 'MODULE_NOT_FOUND',
          message: `Module '${module}' not found`,
        },
      };
    }

    const { sourceFile, program } = resolvedModule;
    const checker = program.getTypeChecker();
    let targetSymbol: ts.Symbol | undefined;

    if (isGlobalModule) {
      // For node builtin modules, extract the actual symbol name
      const actualSymbolName = module.startsWith('node:') ? module.slice(5) : module;

      // For builtin modules, get the symbol from the global scope
      const globalSymbols = checker.getSymbolsInScope(sourceFile, ts.SymbolFlags.Value);
      targetSymbol = globalSymbols.find((s: ts.Symbol) => s.getName() === actualSymbolName);

      if (!targetSymbol) {
        // Try getting it from the AST node directly
        const [identifierNode] = sourceFile.statements;
        if (identifierNode && ts.isVariableStatement(identifierNode)) {
          const [declaration] = identifierNode.declarationList.declarations;
          if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
            targetSymbol = checker.getSymbolAtLocation(declaration.initializer);
          }
        }
      }
    } else {
      // Regular module handling
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

      if (moduleSymbol) {
        const exports = checker.getExportsOfModule(moduleSymbol);
        const exportSymbol = exports.find((exp: ts.Symbol) => exp.getName() === symbol);

        if (exportSymbol) {
          targetSymbol = exportSymbol;
        } else {
          return {
            success: false,
            error: {
              code: 'MODULE_NOT_FOUND',
              message: `Symbol '${symbol}' not found in module '${module}'`,
            },
          };
        }
      } else {
        // JavaScript file - look for symbols in statements
        targetSymbol = findSymbolInJavaScriptFile(sourceFile, checker, symbol);

        if (!targetSymbol) {
          return {
            success: false,
            error: {
              code: 'MODULE_NOT_FOUND',
              message: `Symbol '${symbol}' not found in JavaScript module '${module}'`,
            },
          };
        }
      }
    }

    if (!targetSymbol) {
      return {
        success: false,
        error: {
          code: 'MODULE_NOT_FOUND',
          message: `Symbol '${symbol}' not found`,
        },
      };
    }

    // Get the symbol info to extract the location
    const symbolInfo = getSymbolInfo(checker, targetSymbol, member, isStatic);
    if (isExtractError(symbolInfo)) {
      return {
        success: false,
        error: {
          code: 'MODULE_NOT_FOUND',
          message: symbolInfo.error.message,
        },
      };
    }

    // Return the location from the symbol info
    return { path: symbolInfo.location, format: 'typescript' };
  }

  // Original module-only logic
  const moduleName = reference;

  // For local files, check if the exact path exists first
  if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
    const absolutePath = path.resolve(moduleName);
    if (ts.sys.fileExists(absolutePath)) {
      const cwd = process.cwd();
      let finalPath: string;
      if (absolutePath.startsWith(cwd)) {
        const relativePath = path.relative(cwd, absolutePath);
        finalPath = relativePath.startsWith('..') ? absolutePath : relativePath;
      } else {
        finalPath = absolutePath;
      }
      return { path: finalPath, format: 'typescript' };
    }
  }

  const config = loadTsConfig(options.prefix);

  const moduleResolver = ts.resolveModuleName(
    moduleName,
    path.resolve('./index.ts'),
    config.options,
    ts.sys,
  );

  if (moduleResolver.resolvedModule) {
    const { resolvedFileName } = moduleResolver.resolvedModule;
    const cwd = process.cwd();

    // Try to make it relative to cwd if possible
    let finalPath: string;
    if (resolvedFileName.startsWith(cwd)) {
      const relativePath = path.relative(cwd, resolvedFileName);
      finalPath = relativePath.startsWith('..') ? resolvedFileName : relativePath;
    } else {
      finalPath = resolvedFileName;
    }
    return { path: finalPath, format: 'typescript' };
  }

  return resolveError(moduleName, process.cwd());
}

// Main extraction function
export async function extractSymbol(
  request: ExtractionRequest,
  options: ExtractorOptions = {},
): Promise<ExtractResult> {
  try {
    if (!request.symbol) {
      return {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Symbol name is required',
        },
      };
    }

    // After the check above, we know symbol is defined
    const { symbol } = request;
    const config = loadTsConfig(options.prefix);

    // Resolve module with dedicated program
    const resolvedModule = resolveModule(request.module, config.options);
    if (isResolveError(resolvedModule)) {
      return {
        error: {
          code: 'MODULE_NOT_FOUND',
          message: `Module '${request.module}' not found`,
        },
      };
    }

    const { sourceFile, program } = resolvedModule;
    const checker = program.getTypeChecker();

    // Get the module symbol
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    let targetSymbol: ts.Symbol | undefined;

    if (moduleSymbol) {
      // TypeScript module with proper exports
      const exports = checker.getExportsOfModule(moduleSymbol);
      targetSymbol = exports.find((exp: ts.Symbol) => exp.getName() === symbol);

      if (!targetSymbol) {
        return {
          error: {
            code: 'SYMBOL_NOT_FOUND',
            message: `Symbol '${symbol}' not found in module '${request.module}'. Available exports: ${exports
              .map((e: ts.Symbol) => e.getName())
              .join(', ')}`,
          },
        };
      }
    } else {
      // JavaScript file - look for symbols in statements
      targetSymbol = findSymbolInJavaScriptFile(sourceFile, checker, symbol);

      if (!targetSymbol) {
        return {
          error: {
            code: 'SYMBOL_NOT_FOUND',
            message: `Symbol '${symbol}' not found in JavaScript module '${request.module}'`,
          },
        };
      }
    }

    const result = getSymbolInfo(checker, targetSymbol, request.member, request.isStatic);
    return result;
  } catch (error) {
    return {
      error: {
        code: 'PARSE_ERROR',
        message: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

// Re-export formatters
export { formatOutput } from './formatters';
