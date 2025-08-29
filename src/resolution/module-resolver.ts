import ts from 'typescript';
import path from 'node:path';
import type { InternalResolveResult } from '../core';
import { resolveError } from '../core';

// Load TypeScript configuration
export function loadTsConfig(tsConfigPath?: string): {
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

export function resolveModule(
  moduleName: string,
  compilerOptions: ts.CompilerOptions,
): InternalResolveResult {
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

    // Load the resolved file
    const dedicatedProgram = ts.createProgram([resolvedFileName], compilerOptions);
    const sourceFile = dedicatedProgram.getSourceFile(resolvedFileName);

    if (sourceFile) {
      return { sourceFile, program: dedicatedProgram };
    }
  }

  return resolveError(moduleName, process.cwd());
}

// Resolve node builtin symbols like node:Math
export function resolveNodeBuiltin(
  moduleName: string,
  compilerOptions: ts.CompilerOptions,
): InternalResolveResult {
  // Check if it's a node: builtin module
  if (!moduleName.startsWith('node:')) {
    return resolveError(moduleName, process.cwd());
  }

  const symbolName = moduleName.slice(5); // Remove 'node:' prefix

  // Known Node.js global modules
  const globalBuiltins = [
    'Math',
    'Date',
    'JSON',
    'Object',
    'Array',
    'String',
    'Number',
    'Boolean',
    'RegExp',
    'Function',
    'Promise',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Symbol',
    'Error',
    'console',
    'process',
    'Buffer',
    'global',
    '__dirname',
    '__filename',
  ];

  if (globalBuiltins.includes(symbolName)) {
    // Create a synthetic file that imports the global symbol
    const syntheticContent = `declare const ${symbolName}: typeof globalThis.${symbolName};`;
    const syntheticFileName = `synthetic-global-${symbolName}.d.ts`;

    // Create a dedicated program with the synthetic file
    const host = ts.createCompilerHost(compilerOptions);
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ): ts.SourceFile | undefined => {
      if (fileName === syntheticFileName) {
        return ts.createSourceFile(fileName, syntheticContent, ts.ScriptTarget.Latest, true);
      }
      return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    };

    const dedicatedProgram = ts.createProgram([syntheticFileName], compilerOptions, host);
    const sourceFile = dedicatedProgram.getSourceFile(syntheticFileName);

    if (sourceFile) {
      return { sourceFile, program: dedicatedProgram };
    }
  }

  return resolveError(moduleName, process.cwd());
}
