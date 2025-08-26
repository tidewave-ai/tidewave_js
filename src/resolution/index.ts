import ts from 'typescript';
import path from 'node:path';
import type { ExtractionRequest, ExtractResult, ExtractorOptions, SymbolInfo } from '../core';
import { loadTsConfig, resolveModule, resolveNodeBuiltin } from './module-resolver';
import { findSymbolInJavaScriptFile, getSymbolInfo } from './symbol-finder';
import { formatOutput } from './formatters';

// Parse module path into extraction request
function parseModulePath(modulePath: string): ExtractionRequest {
  // Handle node: prefix specially
  let module: string;
  let symbolPath: string;

  if (modulePath.startsWith('node:')) {
    // For node:Math -> module='node:Math', symbol='Math'
    // For node:Math.min -> module='node:Math', symbol='Math.min'
    const nodeSymbol = modulePath.slice(5); // Remove 'node:' prefix
    const baseSymbol = nodeSymbol.split('.')[0]; // Get 'Math' from 'Math.min'
    module = `node:${baseSymbol}`; // 'node:Math'
    symbolPath = nodeSymbol; // 'Math' or 'Math.min'
  } else {
    // Regular module:symbol format
    const [mod, symPath] = modulePath.split(':');
    if (!mod || !symPath) {
      throw new Error(`Invalid format. Expected 'module:symbol', got '${modulePath}'`);
    }
    module = mod;
    symbolPath = symPath;
  }

  // Check for instance member (Constructor#instanceMember)
  if (symbolPath.includes('#')) {
    const [symbol, member] = symbolPath.split('#');
    if (!symbol || !member) {
      throw new Error(`Invalid format. Expected 'symbol#instance-member', got '${symbolPath}'`);
    }
    return { module, symbol, member, isStatic: false };
  }

  // Check for static member (Constructor.staticMember)
  if (symbolPath.includes('.')) {
    const [symbol, member] = symbolPath.split('.');
    if (!symbol || !member) {
      throw new Error(`Invalid format. Expected 'symbol.static-member', got '${symbolPath}'`);
    }
    return { module, symbol, member, isStatic: true };
  }

  return { module, symbol: symbolPath, member: undefined, isStatic: false };
}

// Extract documentation for a module:symbol path
export async function extractDocs(
  modulePath: string,
  options: ExtractorOptions = {},
): Promise<SymbolInfo | null> {
  try {
    const { module, symbol, member, isStatic } = parseModulePath(modulePath);
    const config = loadTsConfig(options.tsConfigPath);

    // Try to resolve as a regular module first
    let resolvedModule = resolveModule(module, config.options);
    let isGlobalModule = false;

    // If regular module resolution fails, try as a node builtin
    if (!resolvedModule) {
      const nodeBuiltinResolution = resolveNodeBuiltin(module, config.options);
      if (nodeBuiltinResolution) {
        resolvedModule = nodeBuiltinResolution;
        isGlobalModule = true;
      }
    }

    if (!resolvedModule) {
      throw new Error(`Module '${module}' not found`);
    }

    const { sourceFile, program } = resolvedModule;
    const checker = program.getTypeChecker();
    let targetSymbol: ts.Symbol | undefined;

    if (isGlobalModule) {
      // For node builtin modules, extract the actual symbol name
      const actualSymbolName = module.startsWith('node:') ? module.slice(5) : module;

      // For builtin modules, get the symbol from the global scope
      const globalSymbols = checker.getSymbolsInScope(sourceFile, ts.SymbolFlags.Value);
      targetSymbol = globalSymbols.find(s => s.getName() === actualSymbolName);

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
        const exportSymbol = exports.find(exp => exp.getName() === symbol);

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
          throw new Error(
            `Symbol '${symbol}' not found in module '${module}'. Available exports: ${exports
              .map(e => e.getName())
              .join(', ')}`,
          );
        }
      } else {
        // JavaScript file - look for symbols in statements
        targetSymbol = findSymbolInJavaScriptFile(sourceFile, checker, symbol);

        if (!targetSymbol) {
          throw new Error(`Symbol '${symbol}' not found in JavaScript module '${module}'`);
        }
      }
    }

    if (!targetSymbol) {
      const symbolToShow = isGlobalModule
        ? module.startsWith('node:')
          ? module.slice(5)
          : module
        : symbol;
      throw new Error(`Symbol '${symbolToShow}' not found`);
    }

    const result = getSymbolInfo(checker, targetSymbol, member, isStatic);
    return result;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// Get source path for a module
export async function getSourcePath(
  moduleName: string,
  options: ExtractorOptions = {},
): Promise<string | null> {
  try {
    // For local files, check if the exact path exists first
    if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
      const absolutePath = path.resolve(moduleName);
      if (ts.sys.fileExists(absolutePath)) {
        const cwd = process.cwd();
        if (absolutePath.startsWith(cwd)) {
          const relativePath = path.relative(cwd, absolutePath);
          return relativePath.startsWith('..') ? absolutePath : relativePath;
        }
        return absolutePath;
      }
    }

    const config = loadTsConfig(options.tsConfigPath);

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
      if (resolvedFileName.startsWith(cwd)) {
        const relativePath = path.relative(cwd, resolvedFileName);
        return relativePath.startsWith('..') ? resolvedFileName : relativePath;
      }

      return resolvedFileName;
    }

    throw new Error(`Module '${moduleName}' not found`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
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

    const config = loadTsConfig(options.tsConfigPath);

    // Resolve module with dedicated program
    const resolvedModule = resolveModule(request.module, config.options);
    if (!resolvedModule) {
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
      targetSymbol = exports.find(exp => exp.getName() === request.symbol);

      if (!targetSymbol) {
        return {
          error: {
            code: 'SYMBOL_NOT_FOUND',
            message: `Symbol '${request.symbol}' not found in module '${request.module}'. Available exports: ${exports
              .map(e => e.getName())
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

    try {
      const result = getSymbolInfo(checker, targetSymbol, request.member, request.isStatic);
      return result;
    } catch (memberError) {
      return {
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: memberError instanceof Error ? memberError.message : String(memberError),
        },
      };
    }
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
