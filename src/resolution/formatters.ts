import ts from 'typescript';
import type { SymbolInfo, FileInfo } from '../core';

// Get signature
export function getSignature(checker: ts.TypeChecker, symbol: ts.Symbol, type: ts.Type): string {
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
    if (!declaration) return checker.typeToString(type);

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
        return text.split('\n')[0]?.trim() + (text.includes('\n') ? '...' : '') || '';
      }
    }

    // For other declarations, show the first line
    const start = declaration.getStart();
    const end = Math.min(declaration.getStart() + 100, declaration.getEnd());
    const text = sourceFile.text.substring(start, end);
    return text.split('\n')[0]?.trim() + (text.includes('\n') ? '...' : '') || '';
  }

  // Final fallback: just the type string
  return checker.typeToString(type);
}

// Get better type string representation, especially for interfaces
export function getTypeString(checker: ts.TypeChecker, symbol: ts.Symbol, type: ts.Type): string {
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

// Format symbol info for display
function formatSymbolInfo(info: SymbolInfo): string {
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

// Format file info for display
function formatFileInfo(info: FileInfo): string {
  const output: string[] = [];

  output.push(`\nFile: ${info.path}`);
  output.push('');

  if (info.overview) {
    output.push('Overview:');
    output.push(info.overview);
    output.push('');
  }

  output.push(`Symbols (${info.exportCount} total):`);
  output.push('');

  for (const exp of info.exports) {
    output.push(`  ${exp.name} (${exp.kind}) - line ${exp.line}`);
    if (exp.documentation) {
      output.push(`    ${exp.documentation}`);
    }
  }

  return output.join('\n');
}

// Format output dispatcher - handles both SymbolInfo and FileInfo
export function formatOutput(info: SymbolInfo | FileInfo): string {
  if ('exports' in info) {
    return formatFileInfo(info);
  }
  return formatSymbolInfo(info);
}
