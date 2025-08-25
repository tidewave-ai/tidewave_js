// src/extraction/typescript.ts
import ts from 'typescript';
import path from 'node:path';
import type { ExtractionRequest, ExtractResult, ExtractorOptions, SymbolInfo } from '../core/types';

// Load TypeScript configuration
function loadTsConfig(tsConfigPath?: string): {
  fileNames: string[];
  options: ts.CompilerOptions;
} {
  const configPath =
    tsConfigPath || ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');

  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    allowJs: true,
    declaration: true,
    typeRoots: ['./node_modules/@types'],
    baseUrl: '.',
  };

  let rootNames: string[] = [];

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.config) {
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath),
      );
      compilerOptions = { ...compilerOptions, ...parsedConfig.options };
      rootNames = parsedConfig.fileNames;
    }
  }

  return {
    fileNames: rootNames,
    options: compilerOptions,
  };
}

function parseModulePath(modulePath: string): ExtractionRequest {
  const [module, symbolPath] = modulePath.split(':');

  if (!symbolPath) {
    throw new Error(`Invalid format. Expected 'module:symbol', got '${modulePath}'`);
  }

  // Check for instance member (Constructor#instanceMember)
  if (symbolPath.includes('#')) {
    const [symbol, member] = symbolPath.split('#');
    return { module, symbol, member, isStatic: false };
  }

  // Check for static member (Constructor.staticMember)
  if (symbolPath.includes('.')) {
    const [symbol, member] = symbolPath.split('.');
    return { module, symbol, member, isStatic: true };
  }

  return { module, symbol: symbolPath };
}

function resolveModule(
  moduleName: string,
  compilerOptions: ts.CompilerOptions,
): { sourceFile: ts.SourceFile; program: ts.Program } | null {
  // Use TypeScript's built-in module resolution
  const moduleResolver = ts.resolveModuleName(
    moduleName,
    path.resolve('./index.ts'), // Use absolute path for containing file
    compilerOptions,
    ts.sys,
  );

  if (moduleResolver.resolvedModule) {
    const { resolvedFileName } = moduleResolver.resolvedModule;

    // Create a dedicated program for this file like
    const dedicatedProgram = ts.createProgram([resolvedFileName], compilerOptions);
    const sourceFile = dedicatedProgram.getSourceFile(resolvedFileName);

    if (sourceFile) {
      return { sourceFile, program: dedicatedProgram };
    }
  }

  return null;
}

// Find symbol in JavaScript file
function findSymbolInJavaScriptFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  symbolName: string,
): ts.Symbol | undefined {
  // Look through statements for function declarations, class declarations, etc.
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === symbolName) {
      return checker.getSymbolAtLocation(statement.name);
    }
    if (ts.isClassDeclaration(statement) && statement.name?.text === symbolName) {
      return checker.getSymbolAtLocation(statement.name);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === symbolName) {
          return checker.getSymbolAtLocation(declaration.name);
        }
      }
    }
  }
  return undefined;
}

// Get symbol info with member access
function getSymbolInfo(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  member?: string,
  isStatic?: boolean,
): SymbolInfo {
  const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);
  const symbolName = symbol.getName();

  let targetSymbol = symbol;
  let targetType = type;
  let name = symbolName;

  // Handle member access like
  if (member) {
    if (isStatic) {
      // Static member: look in the constructor/class itself
      const staticMembers = checker.getPropertiesOfType(type);
      const staticMember = staticMembers.find(s => s.getName() === member);
      if (staticMember) {
        targetSymbol = staticMember;
        targetType = checker.getTypeOfSymbolAtLocation(
          staticMember,
          staticMember.valueDeclaration!,
        );
        name = `${symbolName}.${member}`;
      } else {
        throw new Error(`Static member '${member}' not found on '${symbolName}'`);
      }
    } else {
      // Instance member: look in the instance type
      let instanceType: ts.Type | undefined;

      // Check if this is a class symbol
      if (symbol.flags & ts.SymbolFlags.Class) {
        // For classes, get the instance type directly
        instanceType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);

        // Try getting instance type from construct signatures
        const constructSignatures = instanceType.getConstructSignatures();
        if (constructSignatures.length > 0) {
          const [constructSignature] = constructSignatures;
          const instanceTypeFromConstruct = checker.getReturnTypeOfSignature(constructSignature);
          const instanceMembers = checker.getPropertiesOfType(instanceTypeFromConstruct);

          const instanceMember = instanceMembers.find(s => s.getName() === member);

          if (instanceMember) {
            targetSymbol = instanceMember;
            targetType = checker.getTypeOfSymbolAtLocation(
              instanceMember,
              instanceMember.valueDeclaration!,
            );
            name = `${symbolName}#${member}`;
          } else {
            throw new Error(
              `Instance member '${member}' not found on '${symbolName}'. Available: ${instanceMembers
                .map(m => m.getName())
                .join(', ')}`,
            );
          }
        } else {
          // Fallback: try direct property access
          const instanceMembers = checker.getPropertiesOfType(instanceType);

          const instanceMember = instanceMembers.find(s => s.getName() === member);

          if (instanceMember) {
            targetSymbol = instanceMember;
            targetType = checker.getTypeOfSymbolAtLocation(
              instanceMember,
              instanceMember.valueDeclaration!,
            );
            name = `${symbolName}#${member}`;
          } else {
            throw new Error(
              `Instance member '${member}' not found on '${symbolName}'. Available: ${instanceMembers
                .map(m => m.getName())
                .join(', ')}`,
            );
          }
        }
      } else {
        // Try constructor signatures
        const callSignatures = type.getCallSignatures();
        const constructSignatures = type.getConstructSignatures();

        if (constructSignatures.length > 0) {
          // This is a constructor, get the instance type
          const [constructSignature] = constructSignatures;
          instanceType = checker.getReturnTypeOfSignature(constructSignature);
        } else if (callSignatures.length > 0) {
          // This might be a function that returns an instance
          const [callSignature] = callSignatures;
          instanceType = checker.getReturnTypeOfSignature(callSignature);
        }

        if (instanceType) {
          const instanceMembers = checker.getPropertiesOfType(instanceType);
          const instanceMember = instanceMembers.find(s => s.getName() === member);

          if (instanceMember) {
            targetSymbol = instanceMember;
            targetType = checker.getTypeOfSymbolAtLocation(
              instanceMember,
              instanceMember.valueDeclaration!,
            );
            name = `${symbolName}#${member}`;
          } else {
            throw new Error(`Instance member '${member}' not found on '${symbolName}'`);
          }
        } else {
          throw new Error(`'${symbolName}' is not a constructor or class`);
        }
      }
    }
  }

  const typeString = checker.typeToString(targetType);
  const signature = getSignature(checker, targetSymbol, targetType);
  const documentation = getDocumentation(checker, targetSymbol);
  const jsDoc = getJSDoc(checker, targetSymbol);
  const kind = getSymbolKind(targetSymbol);
  const location = getLocation(targetSymbol);

  return {
    name,
    kind,
    type: typeString,
    documentation,
    jsDoc,
    signature,
    location,
  };
}

// Get symbol kind
function getSymbolKind(symbol: ts.Symbol): string {
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
}

// Get location
function getLocation(symbol: ts.Symbol): string {
  if (symbol.valueDeclaration) {
    const sourceFile = symbol.valueDeclaration.getSourceFile();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      symbol.valueDeclaration.getStart(),
    );
    return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
  }
  return 'unknown';
}

// Get signature
function getSignature(checker: ts.TypeChecker, symbol: ts.Symbol, type: ts.Type): string {
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);

  if (signatures.length > 0) {
    return signatures.map(sig => checker.signatureToString(sig)).join('\n');
  }

  const constructSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Construct);
  if (constructSignatures.length > 0) {
    return constructSignatures.map(sig => 'new ' + checker.signatureToString(sig)).join('\n');
  }

  // For properties, show the declaration
  if (symbol.valueDeclaration) {
    const sourceFile = symbol.valueDeclaration.getSourceFile();
    const start = symbol.valueDeclaration.getStart();
    const end = symbol.valueDeclaration.getEnd();
    const text = sourceFile.text.substring(start, end);
    return text.split('\n')[0].trim(); // Just the first line
  }

  return checker.typeToString(type);
}

// Get documentation
function getDocumentation(checker: ts.TypeChecker, symbol: ts.Symbol): string {
  return ts.displayPartsToString(symbol.getDocumentationComment(checker));
}

// Get JSDoc
function getJSDoc(checker: ts.TypeChecker, symbol: ts.Symbol): string {
  const jsDocTags = symbol.getJsDocTags(checker);
  return jsDocTags
    .map(tag => {
      const tagName = tag.name;
      const tagText = tag.text ? ts.displayPartsToString(tag.text) : '';
      return `@${tagName}${tagText ? ' ' + tagText : ''}`;
    })
    .join('\n');
}

// Extract documentation for a module:symbol path
export async function extractDocs(
  modulePath: string,
  options: ExtractorOptions = {},
): Promise<SymbolInfo | null> {
  try {
    const { module, symbol, member, isStatic } = parseModulePath(modulePath);

    // Load config like
    const config = loadTsConfig(options.tsConfigPath);

    // Resolve module with dedicated program like
    const resolvedModule = resolveModule(module, config.options);
    if (!resolvedModule) {
      throw new Error(`Module '${module}' not found`);
    }

    const { sourceFile, program } = resolvedModule;
    const checker = program.getTypeChecker();

    // Get the module symbol
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    let targetSymbol: ts.Symbol | undefined;

    if (moduleSymbol) {
      // TypeScript module with proper exports
      const exports = checker.getExportsOfModule(moduleSymbol);
      targetSymbol = exports.find(exp => exp.getName() === symbol);

      if (!targetSymbol) {
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

    // Get symbol info like
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

// Format output for display
export function formatOutput(info: SymbolInfo): string {
  const output: string[] = [];

  output.push(`\n${info.name}`);
  output.push(`Kind: ${info.kind}`);
  output.push(`Location: ${info.location}`);
  output.push('');

  if (info.signature) {
    output.push('Signature:');
    output.push(info.signature);
    output.push('');
  }

  if (info.documentation) {
    output.push('Documentation:');
    output.push(info.documentation);
    output.push('');
  }

  if (info.jsDoc) {
    output.push('JSDoc Tags:');
    output.push(info.jsDoc);
    output.push('');
  }

  output.push('Type:');
  output.push(info.type);

  return output.join('\n');
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
