import ts from 'typescript';
import path from 'node:path';

// Get location
export function getLocation(symbol: ts.Symbol): string {
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

// Get documentation
export function getDocumentation(checker: ts.TypeChecker, symbol: ts.Symbol): string {
  return ts.displayPartsToString(symbol.getDocumentationComment(checker));
}

// Get JSDoc
export function getJSDoc(checker: ts.TypeChecker, symbol: ts.Symbol): string {
  const jsDocTags = symbol.getJsDocTags(checker);
  return jsDocTags
    .map(tag => {
      const tagName = tag.name;
      const tagText = tag.text ? ts.displayPartsToString(tag.text) : '';
      return `@${tagName}${tagText ? ' ' + tagText : ''}`;
    })
    .join('\n');
}

// Get symbol kind
export function getSymbolKind(symbol: ts.Symbol): string {
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
