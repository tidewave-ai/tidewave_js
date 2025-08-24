// src/extraction/typescript.ts
import ts from 'typescript';
import path from 'node:path';
import { isResolveError } from '../core/types';
import type { ExtractionRequest, ExtractResult, ExtractorOptions } from '../core/types';
import * as NodeResolver from '../resolution/node';

// Load TypeScript configuration
const loadTsConfig = (tsConfigPath?: string) => {
  const configPath =
    tsConfigPath || ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
    );
    return parsedConfig.options;
  }

  // Default options
  return {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: true,
    esModuleInterop: true,
    skipLibCheck: true,
  };
};

// Extract symbol documentation
const extractDocumentation = (symbol: ts.Symbol, checker: ts.TypeChecker): string =>
  ts.displayPartsToString(symbol.getDocumentationComment(checker));

// Extract JSDoc tags
const extractJsDoc = (symbol: ts.Symbol, checker: ts.TypeChecker): string => {
  const tags = symbol.getJsDocTags(checker);
  return tags
    .map(tag => {
      const text = tag.text ? ts.displayPartsToString(tag.text) : '';
      return `@${tag.name}${text ? ' ' + text : ''}`;
    })
    .join('\n');
};

// Get symbol kind
const getSymbolKind = (symbol: ts.Symbol): string => {
  const flags = symbol.getFlags();

  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Interface) return 'interface';
  if (flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (flags & ts.SymbolFlags.Variable) return 'variable';
  if (flags & ts.SymbolFlags.Property) return 'property';
  if (flags & ts.SymbolFlags.Method) return 'method';
  if (flags & ts.SymbolFlags.Enum) return 'enum';
  if (flags & ts.SymbolFlags.Module) return 'module';

  return 'unknown';
};

// Get symbol location
const getSymbolLocation = (symbol: ts.Symbol): string => {
  if (symbol.valueDeclaration) {
    const sourceFile = symbol.valueDeclaration.getSourceFile();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      symbol.valueDeclaration.getStart(),
    );
    return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
  }
  return 'unknown';
};

// Get symbol signature
const getSignature = (type: ts.Type, checker: ts.TypeChecker): string => {
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);

  if (signatures.length > 0) {
    return signatures.map(sig => checker.signatureToString(sig)).join('\n');
  }

  const constructSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Construct);

  if (constructSignatures.length > 0) {
    return constructSignatures.map(sig => 'new ' + checker.signatureToString(sig)).join('\n');
  }

  return checker.typeToString(type);
};

// Find symbol in source file
const findSymbol = (
  sourceFile: ts.SourceFile,
  symbolName: string,
  checker: ts.TypeChecker,
): ts.Symbol | null => {
  // Try module exports first
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol) {
    const exports = checker.getExportsOfModule(moduleSymbol);
    const found = exports.find(exp => exp.getName() === symbolName);
    if (found) return found;
  }

  // For JavaScript files, look through statements
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === symbolName) {
      return checker.getSymbolAtLocation(statement.name) || null;
    }

    if (ts.isClassDeclaration(statement) && statement.name?.text === symbolName) {
      return checker.getSymbolAtLocation(statement.name) || null;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === symbolName) {
          return checker.getSymbolAtLocation(declaration.name) || null;
        }
      }
    }
  }

  return null;
};

// Handle member access
const resolveMember = (
  symbol: ts.Symbol,
  member: string,
  isStatic: boolean,
  checker: ts.TypeChecker,
): ts.Symbol | null => {
  const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);

  if (isStatic) {
    // Look for static members
    const properties = checker.getPropertiesOfType(type);
    return properties.find(p => p.getName() === member) || null;
  } else {
    // Look for instance members
    const constructSignatures = type.getConstructSignatures();
    if (constructSignatures.length > 0) {
      const instanceType = checker.getReturnTypeOfSignature(constructSignatures[0]!);
      const properties = checker.getPropertiesOfType(instanceType);
      return properties.find(p => p.getName() === member) || null;
    }
  }

  return null;
};

// Main extraction function
export const extractSymbol = async (
  request: ExtractionRequest,
  options: ExtractorOptions = {},
): Promise<ExtractResult> => {
  try {
    // Resolve module path
    const resolved = await NodeResolver.resolveModule({
      specifier: request.module,
      source: path.resolve(process.cwd(), 'index.ts'),
      runtime: options.runtime || 'node',
    });

    if (isResolveError(resolved)) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: `Cannot resolve module: ${resolved.error.message}`,
          details: resolved.error,
        },
      };
    }

    // Create TypeScript program
    const compilerOptions = loadTsConfig(options.tsConfigPath);
    const program = ts.createProgram([resolved.path], compilerOptions);
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(resolved.path);

    if (!sourceFile) {
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: `Cannot parse file: ${resolved.path}`,
        },
      };
    }

    // If no symbol specified, extract module info
    if (!request.symbol) {
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
      if (!moduleSymbol) {
        return {
          success: false,
          error: {
            code: 'SYMBOL_NOT_FOUND',
            message: 'No module symbol found',
          },
        };
      }

      const type = checker.getTypeOfSymbolAtLocation(moduleSymbol, sourceFile);

      return {
        name: path.basename(resolved.path, path.extname(resolved.path)),
        kind: 'module',
        type: checker.typeToString(type),
        documentation: extractDocumentation(moduleSymbol, checker),
        signature: '',
        location: resolved.path,
        jsDoc: extractJsDoc(moduleSymbol, checker),
      };
    }

    // Find the requested symbol
    let targetSymbol = findSymbol(sourceFile, request.symbol, checker);

    if (!targetSymbol) {
      return {
        success: false,
        error: {
          code: 'SYMBOL_NOT_FOUND',
          message: `Symbol '${request.symbol}' not found in module`,
        },
      };
    }

    // Handle member access
    if (request.member) {
      const memberSymbol = resolveMember(
        targetSymbol,
        request.member,
        request.isStatic || false,
        checker,
      );

      if (!memberSymbol) {
        return {
          success: false,
          error: {
            code: 'SYMBOL_NOT_FOUND',
            message: `Member '${request.member}' not found on '${request.symbol}'`,
          },
        };
      }

      targetSymbol = memberSymbol;
    }

    // Extract symbol information
    const type = checker.getTypeOfSymbolAtLocation(targetSymbol, targetSymbol.valueDeclaration!);

    const symbolName = request.member
      ? `${request.symbol}${request.isStatic ? '.' : '#'}${request.member}`
      : request.symbol;

    return {
      name: symbolName,
      kind: getSymbolKind(targetSymbol),
      type: checker.typeToString(type),
      documentation: extractDocumentation(targetSymbol, checker),
      signature: getSignature(type, checker),
      location: getSymbolLocation(targetSymbol),
      jsDoc: extractJsDoc(targetSymbol, checker),
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: `Extraction failed: ${error}`,
        details: error,
      },
    };
  }
};
