import ts from 'typescript';
import type { SymbolInfo, ExtractError } from '../core';
import { createExtractError } from '../core';
import { getLocation, getDocumentation, getJSDoc, getSymbolKind } from './utils';
import { getSignature, getTypeString } from './formatters';

// Find a symbol in a JavaScript file
export function findSymbolInJavaScriptFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  symbolName: string,
): ts.Symbol | undefined {
  // Look for the symbol in the source file statements
  for (const statement of sourceFile.statements) {
    // Direct function declarations
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

// Get symbol info with member access
export function getSymbolInfo(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  member?: string,
  isStatic?: boolean,
): SymbolInfo | ExtractError {
  // For symbols without valueDeclaration (like interfaces), use the first declaration
  const declaration = symbol.valueDeclaration || (symbol.declarations && symbol.declarations[0]);
  if (!declaration && (!symbol.declarations || symbol.declarations.length === 0)) {
    return createExtractError('TYPE_ERROR', `Symbol '${symbol.getName()}' has no declarations`);
  }
  const targetDeclaration = declaration || symbol.declarations![0]!;

  // For interfaces and type aliases, use getDeclaredTypeOfSymbol to get the actual type with members
  let type: ts.Type;
  if (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) {
    type = checker.getDeclaredTypeOfSymbol(symbol);
  } else {
    type = checker.getTypeOfSymbolAtLocation(symbol, targetDeclaration);
  }

  const symbolName = symbol.getName();

  let targetSymbol = symbol;
  let targetType = type;
  let name = symbolName;

  // Handle member access like
  if (member) {
    if (isStatic) {
      // Static member: look in the constructor/class itself or enum values
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
        return createExtractError(
          'MEMBER_NOT_FOUND',
          `Static member '${member}' not found on '${symbolName}'. Available: ${staticMembers
            .map(m => m.getName())
            .join(', ')}`,
        );
      }
    } else {
      // Instance member: look in the instance type
      let instanceType: ts.Type | undefined;

      // Check if this is an interface symbol
      if (symbol.flags & ts.SymbolFlags.Interface) {
        // For interfaces, the type itself contains the properties
        instanceType = type;
        const instanceMembers = checker.getPropertiesOfType(instanceType);
        const instanceMember = instanceMembers.find(s => s.getName() === member);

        if (instanceMember) {
          targetSymbol = instanceMember;
          const memberDecl = instanceMember.valueDeclaration || instanceMember.declarations?.[0];
          if (memberDecl) {
            targetType = checker.getTypeOfSymbolAtLocation(instanceMember, memberDecl);
          } else {
            targetType = checker.getTypeOfSymbol(instanceMember);
          }
          name = `${symbolName}#${member}`;
        } else {
          return createExtractError(
            'MEMBER_NOT_FOUND',
            `Instance member '${member}' not found on interface '${symbolName}'. Available: ${instanceMembers
              .map(m => m.getName())
              .join(', ')}`,
          );
        }
      } else if (symbol.flags & ts.SymbolFlags.Class) {
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
              return createExtractError(
                'MEMBER_NOT_FOUND',
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
            return createExtractError(
              'MEMBER_NOT_FOUND',
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
            return createExtractError(
              'MEMBER_NOT_FOUND',
              `Instance member '${member}' not found on '${symbolName}'`,
            );
          }
        } else {
          return createExtractError('TYPE_ERROR', `'${symbolName}' is not a constructor or class`);
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
