import ts from 'typescript';
import path from 'node:path';
import type {
  ExtractionRequest,
  ExtractResult,
  ExtractorOptions,
  ResolveResult,
  ExtractError,
  InternalResolveResult,
} from '../core';
import { createExtractError, resolveError, isResolveError } from '../core';
import { loadTsConfig, resolveModule, resolveNodeBuiltin } from './module-resolver';
import { findSymbolInJavaScriptFile, getSymbolInfo } from './symbol-finder';
import { formatOutput } from './formatters';

// Parse module path into extraction request
function parseModulePath(modulePath: string): ExtractionRequest | ExtractError {
  // Handle node: prefix specially
  let module: string;
  let symbolPath: string;

  if (modulePath.startsWith('node:')) {
    // For node:Math -> module='node:Math', symbol='Math'
    // For node:Math.min -> module='node:Math', symbol='Math.min'
    const nodeSymbol = modulePath.slice(5); // Remove 'node:' prefix
    const [baseSymbol] = nodeSymbol.split('.'); // Get 'Math' from 'Math.min'
    module = `node:${baseSymbol}`; // 'node:Math'
    symbolPath = nodeSymbol; // 'Math' or 'Math.min'
  } else {
    // Regular module:symbol format
    const [mod, symPath] = modulePath.split(':');
    if (!mod || !symPath) {
      return createExtractError(
        'INVALID_REQUEST',
        `Invalid format. Expected 'module:symbol', got '${modulePath}'`,
      );
    }
    module = mod;
    symbolPath = symPath;
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

// Extract documentation for a module:symbol path
export async function extractDocs(
  modulePath: string,
  options: ExtractorOptions = {},
): Promise<ExtractResult> {
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
        // OR if it's a type-only symbol like interface/type alias
        if (
          exportSymbol.valueDeclaration &&
          (ts.isFunctionDeclaration(exportSymbol.valueDeclaration) ||
            ts.isClassDeclaration(exportSymbol.valueDeclaration) ||
            ts.isVariableDeclaration(exportSymbol.valueDeclaration))
        ) {
          targetSymbol = exportSymbol;
        } else if (exportSymbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) {
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

// Get source path for a module
export async function getSourceLocation(
  moduleName: string,
  options: ExtractorOptions = {},
): Promise<ResolveResult> {
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
      targetSymbol = exports.find((exp: ts.Symbol) => exp.getName() === request.symbol);

      if (!targetSymbol) {
        return {
          error: {
            code: 'SYMBOL_NOT_FOUND',
            message: `Symbol '${request.symbol}' not found in module '${request.module}'. Available exports: ${exports
              .map((e: ts.Symbol) => e.getName())
              .join(', ')}`,
          },
        };
      }
    } else {
      // JavaScript file - look for symbols in statements
      targetSymbol = findSymbolInJavaScriptFile(sourceFile, checker, request.symbol);

      if (!targetSymbol) {
        return {
          error: {
            code: 'SYMBOL_NOT_FOUND',
            message: `Symbol '${request.symbol}' not found in JavaScript module '${request.module}'`,
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

// Re-export formatOutput
export { formatOutput };
