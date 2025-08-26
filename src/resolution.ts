// src/extraction/typescript.ts
import ts from 'typescript';
import path from 'node:path';
import type { ExtractionRequest, ExtractResult, ExtractorOptions, SymbolInfo } from './core';

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
    moduleResolution: ts.ModuleResolutionKind.Bundler,
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

  if (!module || !symbolPath) {
    throw new Error(`Invalid format. Expected 'module:symbol', got '${modulePath}'`);
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

function resolveModule(
  moduleName: string,
  compilerOptions: ts.CompilerOptions,
): { sourceFile: ts.SourceFile; program: ts.Program } | null {
  // For local files, check if the exact path exists first (to prefer .js over .ts)
  if (
    moduleName.startsWith('./') ||
    moduleName.startsWith('../') ||
    (moduleName.includes('.') && !moduleName.includes('/'))
  ) {
    const absolutePath = path.resolve(moduleName);
    if (ts.sys.fileExists(absolutePath)) {
      const dedicatedProgram = ts.createProgram([absolutePath], compilerOptions);
      const sourceFile = dedicatedProgram.getSourceFile(absolutePath);

      if (sourceFile) {
        return { sourceFile, program: dedicatedProgram };
      }
    }
  }

  // Fall back to normal module resolution for non-local modules
  const moduleResolver = ts.resolveModuleName(
    moduleName,
    path.resolve('./index.ts'),
    compilerOptions,
    ts.sys,
  );

  if (moduleResolver.resolvedModule) {
    const { resolvedFileName } = moduleResolver.resolvedModule;
    const dedicatedProgram = ts.createProgram([resolvedFileName], compilerOptions);
    const sourceFile = dedicatedProgram.getSourceFile(resolvedFileName);

    if (sourceFile) {
      return { sourceFile, program: dedicatedProgram };
    }
  }

  return null;
}

// Handle global symbols from lib.d.ts (like Math, console, etc.)
function resolveGlobalSymbol(
  symbolName: string,
  compilerOptions: ts.CompilerOptions,
): { sourceFile: ts.SourceFile; program: ts.Program; isGlobal: true } | null {
  try {
    // Create a minimal TypeScript file that references the global symbol
    const virtualFileName = 'virtual-globals.ts';
    const virtualContent = `// Global symbol reference\nconst _ref = ${symbolName};`;

    // Create program with default host and proper lib files
    const program = ts.createProgram(
      [virtualFileName],
      {
        ...compilerOptions,
        lib: compilerOptions.lib || ['lib.es2020.d.ts'],
        skipLibCheck: false,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
      },
      {
        ...ts.createCompilerHost(compilerOptions),
        getSourceFile: (fileName: string, languageVersion: ts.ScriptTarget) => {
          if (fileName === virtualFileName) {
            return ts.createSourceFile(virtualFileName, virtualContent, languageVersion, true);
          }
          // Use the default compiler host for everything else (including lib.d.ts files)
          return ts.createCompilerHost(compilerOptions).getSourceFile(fileName, languageVersion);
        },
        fileExists: (fileName: string) => {
          if (fileName === virtualFileName) return true;
          return ts.createCompilerHost(compilerOptions).fileExists(fileName);
        },
      },
    );

    const sourceFile = program.getSourceFile(virtualFileName);
    if (sourceFile) {
      return { sourceFile, program, isGlobal: true };
    }
  } catch (error) {
    // If global symbol resolution fails, return null
    console.debug(`Failed to resolve global symbol ${symbolName}:`, error);
  }

  return null;
}

// Find symbol in JavaScript file
function findSymbolInJavaScriptFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  symbolName: string,
): ts.Symbol | undefined {
  // First, look through top-level declarations
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

    // Look for CommonJS exports: module.exports = { symbolName, ... }
    if (ts.isExpressionStatement(statement)) {
      const { expression } = statement;

      // Check for module.exports assignment
      if (
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        const { left, right } = expression;

        // module.exports = { ... }
        if (
          ts.isPropertyAccessExpression(left) &&
          ts.isIdentifier(left.expression) &&
          left.expression.text === 'module' &&
          ts.isIdentifier(left.name) &&
          left.name.text === 'exports' &&
          ts.isObjectLiteralExpression(right)
        ) {
          // Look for the symbol in the object literal
          for (const prop of right.properties) {
            if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
              const propName = ts.isIdentifier(prop.name) ? prop.name.text : undefined;

              if (propName === symbolName) {
                let targetIdentifier: ts.Identifier | undefined;

                if (ts.isShorthandPropertyAssignment(prop)) {
                  // { greetUser } - shorthand
                  targetIdentifier = prop.name;
                } else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.initializer)) {
                  // { greetUser: greetUser } - full form
                  targetIdentifier = prop.initializer;
                }

                if (targetIdentifier) {
                  // For CommonJS exports, we prioritize finding the original declaration
                  // over the export reference to get proper TypeScript symbol flags

                  // FIRST: Try to find the original declaration in the source file
                  for (const statement of sourceFile.statements) {
                    // Check for function declarations with matching name
                    if (
                      ts.isFunctionDeclaration(statement) &&
                      statement.name?.text === targetIdentifier.text
                    ) {
                      const originalSymbol = checker.getSymbolAtLocation(statement.name);
                      if (originalSymbol) {
                        return originalSymbol;
                      }
                    }

                    // Check for class declarations with matching name
                    if (
                      ts.isClassDeclaration(statement) &&
                      statement.name?.text === targetIdentifier.text
                    ) {
                      const originalSymbol = checker.getSymbolAtLocation(statement.name);
                      if (originalSymbol) {
                        return originalSymbol;
                      }
                    }

                    // Check for variable declarations (function expressions, class expressions)
                    if (ts.isVariableStatement(statement)) {
                      for (const declaration of statement.declarationList.declarations) {
                        if (
                          ts.isIdentifier(declaration.name) &&
                          declaration.name.text === targetIdentifier.text
                        ) {
                          const originalSymbol = checker.getSymbolAtLocation(declaration.name);
                          if (originalSymbol) {
                            return originalSymbol;
                          }
                        }
                      }
                    }
                  }

                  // FALLBACK: If original declaration not found, use export symbol
                  const exportSymbol = checker.getSymbolAtLocation(targetIdentifier);
                  return exportSymbol;
                }
              }
            }
          }
        }
      }
    }
  }

  return undefined;
}

// Get better type string representation, especially for interfaces
function getTypeString(checker: ts.TypeChecker, symbol: ts.Symbol, type: ts.Type): string {
  // For interfaces and type aliases, provide a more detailed representation
  if (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) {
    const declaration = symbol.valueDeclaration || (symbol.declarations && symbol.declarations[0]);

    if (declaration && ts.isInterfaceDeclaration(declaration)) {
      // For interfaces, show the object type structure
      const properties = type.getProperties();
      if (properties.length > 0) {
        const propertyStrings = properties.map(prop => {
          const propDeclaration =
            prop.valueDeclaration || (prop.declarations && prop.declarations[0]);
          const propType = propDeclaration
            ? checker.getTypeOfSymbolAtLocation(prop, propDeclaration)
            : checker.getTypeAtLocation(prop.declarations![0]!);
          const propTypeString = checker.typeToString(propType);
          const isOptional = prop.flags & ts.SymbolFlags.Optional;
          return `${prop.getName()}${isOptional ? '?' : ''}: ${propTypeString}`;
        });
        return `{ ${propertyStrings.join('; ')} }`;
      }
    }
  }

  // Fallback to default type string
  const defaultTypeString = checker.typeToString(type);

  // If the default gives us "any" but we know it's an interface, be more descriptive
  if (defaultTypeString === 'any' && symbol.flags & ts.SymbolFlags.Interface) {
    return `interface ${symbol.getName()}`;
  }

  return defaultTypeString;
}

// Get symbol info with member access
function getSymbolInfo(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  member?: string,
  isStatic?: boolean,
): SymbolInfo {
  // For symbols without valueDeclaration (like interfaces), use the first declaration
  const declaration = symbol.valueDeclaration || (symbol.declarations && symbol.declarations[0]);
  const type = declaration
    ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
    : checker.getTypeOfSymbolAtLocation(symbol, symbol.declarations![0]!);
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
          if (constructSignature) {
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
          if (constructSignature) {
            instanceType = checker.getReturnTypeOfSignature(constructSignature);
          }
        } else if (callSignatures.length > 0) {
          // This might be a function that returns an instance
          const [callSignature] = callSignatures;
          if (callSignature) {
            instanceType = checker.getReturnTypeOfSignature(callSignature);
          }
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

  const typeString = getTypeString(checker, targetSymbol, targetType);
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

  // For JavaScript CommonJS exports, check the value declaration to infer the type
  if (symbol.valueDeclaration) {
    if (ts.isFunctionDeclaration(symbol.valueDeclaration)) {
      return 'function';
    }
    if (ts.isClassDeclaration(symbol.valueDeclaration)) {
      return 'class';
    }
    if (ts.isVariableDeclaration(symbol.valueDeclaration)) {
      return 'variable';
    }
    if (ts.isMethodDeclaration(symbol.valueDeclaration)) {
      return 'method';
    }
  }

  return 'unknown';
}

// Get location
function getLocation(symbol: ts.Symbol): string {
  if (symbol.valueDeclaration) {
    const sourceFile = symbol.valueDeclaration.getSourceFile();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      symbol.valueDeclaration.getStart(),
    );

    // Convert absolute paths to relative paths for better display
    let { fileName } = sourceFile;
    const cwd = process.cwd();
    if (fileName.startsWith(cwd)) {
      fileName = path.relative(cwd, fileName);
    }

    return `${fileName}:${line + 1}:${character + 1}`;
  }

  // Try alternative approaches if valueDeclaration is not available
  if (symbol.declarations && symbol.declarations.length > 0) {
    const [firstDeclaration] = symbol.declarations;
    const sourceFile = firstDeclaration?.getSourceFile();
    if (sourceFile === undefined || firstDeclaration === undefined) return 'unknown';

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      firstDeclaration.getStart(),
    );

    let fileName = sourceFile?.fileName;
    const cwd = process.cwd();
    if (fileName?.startsWith(cwd)) {
      fileName = path.relative(cwd, fileName);
    }

    return `${fileName}:${line + 1}:${character + 1}`;
  }

  return 'unknown';
}

// Get signature
function getSignature(checker: ts.TypeChecker, symbol: ts.Symbol, type: ts.Type): string {
  // Try to get call signatures first (for functions)
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  if (signatures.length > 0) {
    return signatures
      .map(sig => {
        const sigString = checker.signatureToString(sig);
        // Prepend function name to signature for better readability
        return `${symbol.getName()}${sigString}`;
      })
      .join('\n');
  }

  // Try construct signatures (for classes)
  const constructSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Construct);
  if (constructSignatures.length > 0) {
    return constructSignatures.map(sig => 'new ' + checker.signatureToString(sig)).join('\n');
  }

  // For interfaces, classes, and other types, try to get a better representation
  if (symbol.valueDeclaration || (symbol.declarations && symbol.declarations.length > 0)) {
    const declaration = symbol.valueDeclaration || symbol.declarations![0];
    const sourceFile = declaration.getSourceFile();

    if (ts.isFunctionDeclaration(declaration) && declaration.name) {
      // For function declarations, create a signature from the declaration
      const functionType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      const functionSignatures = checker.getSignaturesOfType(functionType, ts.SignatureKind.Call);
      if (functionSignatures.length > 0) {
        return functionSignatures.map(sig => checker.signatureToString(sig)).join('\n');
      }
    }

    if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
      // For interfaces and type aliases, show the full declaration
      const start = declaration.getStart();
      const end = declaration.getEnd();
      const text = sourceFile.text.substring(start, end);

      // Clean up whitespace and format nicely
      const lines = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // For interfaces, show a compact but complete representation
      if (ts.isInterfaceDeclaration(declaration)) {
        // Extract just the interface body for a cleaner signature
        const bodyStart = text.indexOf('{');
        const bodyEnd = text.lastIndexOf('}');
        if (bodyStart !== -1 && bodyEnd !== -1) {
          const body = text.substring(bodyStart, bodyEnd + 1);
          const interfaceName = `interface ${declaration.name.text}`;
          // Format the body to be more compact
          const compactBody = body.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ');
          return `${interfaceName} ${compactBody}`;
        }
      }

      // Fallback: return cleaned up full text
      return lines.join(' ').replace(/\s+/g, ' ');
    }

    if (ts.isClassDeclaration(declaration)) {
      // For classes, show constructor signature if available
      const classType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      const classConstructSignatures = checker.getSignaturesOfType(
        classType,
        ts.SignatureKind.Construct,
      );
      if (classConstructSignatures.length > 0) {
        return classConstructSignatures
          .map(sig => 'new ' + checker.signatureToString(sig))
          .join('\n');
      } else {
        // Fallback to class declaration
        const start = declaration.getStart();
        const end = Math.min(declaration.getStart() + 100, declaration.getEnd()); // Limit length
        const text = sourceFile.text.substring(start, end);
        return text.split('\n')[0].trim() + (text.includes('\n') ? '...' : '');
      }
    }

    // For other declarations, show the first line
    const start = declaration.getStart();
    const end = Math.min(declaration.getStart() + 100, declaration.getEnd());
    const text = sourceFile.text.substring(start, end);
    return text.split('\n')[0].trim() + (text.includes('\n') ? '...' : '');
  }

  // Final fallback: just the type string
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
    const config = loadTsConfig(options.tsConfigPath);

    // Try to resolve as a regular module first
    let resolvedModule = resolveModule(module, config.options);
    let isGlobalModule = false;

    // If regular module resolution fails, try as a global symbol
    if (!resolvedModule) {
      const globalResolution = resolveGlobalSymbol(module, config.options);
      if (globalResolution) {
        resolvedModule = globalResolution;
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
      // For global modules, get the symbol from the global scope
      const globalSymbols = checker.getSymbolsInScope(sourceFile, ts.SymbolFlags.Value);
      targetSymbol = globalSymbols.find(s => s.getName() === module);

      if (!targetSymbol) {
        // Try getting it from the AST node directly
        const [identifierNode] = sourceFile.statements;
        if (ts.isVariableStatement(identifierNode)) {
          const [declaration] = identifierNode.declarationList.declarations;
          if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
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
      throw new Error(`Symbol '${isGlobalModule ? module : symbol}' not found`);
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
