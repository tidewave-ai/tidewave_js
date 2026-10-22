import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";
import chalk from "chalk";

export interface InstallOptions {
  prefix?: string;
  dryRun?: boolean;
  skipDeps?: boolean;
}

type ProjectType = "vite" | "tanstack";

interface FileChange {
  path: string;
  content: string;
}

interface VitePlugin {
  module: string;
  name: string;
  namedExport: boolean;
}

const TIDEWAVE_PLUGIN: VitePlugin = {
  module: "tidewave/vite-plugin",
  name: "tidewave",
  namedExport: false,
};

// TanStack Devtools adds source locations to JSX elements, which makes
// Tidewave more precise. As per TanStack docs, it must be the first plugin,
// so that it runs before other TanStack plugins transform the source.
// The position of the Tidewave plugin does not matter.
const DEVTOOLS_PLUGIN: VitePlugin = {
  module: "@tanstack/devtools-vite",
  name: "devtools",
  namedExport: true,
};

const VITE_CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
];

const TANSTACK_START_FILES = ["src/start.ts", "src/start.js"];

const DEFAULT_START = `import { createStart } from '@tanstack/react-start';

export const startInstance = createStart(() => {
  return {};
});
`;

export async function handleInstall(options: InstallOptions): Promise<void> {
  const targetDir = path.resolve(options.prefix ?? process.cwd());
  const dryRun = options.dryRun ?? false;

  console.log(chalk.blue("\n🌊 Tidewave Installer\n"));
  console.log(chalk.gray(`Target directory: ${targetDir}`));

  if (dryRun) {
    console.log(chalk.yellow("\n⚠️  DRY RUN MODE - No files will be changed\n"));
  }

  const packageJson = readPackageJson(targetDir);
  const dependencies = {
    ...asDependencies(packageJson.dependencies),
    ...asDependencies(packageJson.devDependencies),
  };
  const projectType = detectProjectType(dependencies);
  const changes = buildFileChanges(targetDir, projectType);

  console.log(
    chalk.green(`✅ Detected ${projectType === "tanstack" ? "TanStack Start" : "Vite"} project`),
  );

  for (const change of changes) {
    const relativePath = path.relative(targetDir, change.path);

    if (dryRun) {
      console.log(chalk.gray(`[DRY RUN] Would update: ${relativePath}`));
    } else {
      fs.mkdirSync(path.dirname(change.path), { recursive: true });
      fs.writeFileSync(change.path, change.content, "utf8");
      console.log(chalk.green(`✅ Updated: ${relativePath}`));
    }
  }

  if (!options.skipDeps) {
    const packages = ["tidewave"];
    if (projectType === "tanstack" && !(DEVTOOLS_PLUGIN.module in dependencies)) {
      packages.push(DEVTOOLS_PLUGIN.module);
    }
    installDependencies(targetDir, packages, dryRun);
  }

  console.log(chalk.green("\n✅ Tidewave setup complete!\n"));
  console.log("Next step: add Tidewave as a MCP server to your favorite coding agent");
  console.log("More info: https://tidewave.hexdocs.pm/mcp.html");
}

function readPackageJson(dir: string): Record<string, unknown> {
  const packageJsonPath = path.join(dir, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Could not find package.json in ${dir}`);
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`Could not parse ${packageJsonPath}`);
  }
}

function detectProjectType(dependencies: Record<string, unknown>): ProjectType {
  if ("@tanstack/react-start" in dependencies) {
    return "tanstack";
  }

  if ("vite" in dependencies) {
    return "vite";
  }

  throw new Error(
    "Could not detect Vite or TanStack Start. Make sure it is listed in package.json.",
  );
}

function asDependencies(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function buildFileChanges(dir: string, projectType: ProjectType): FileChange[] {
  const viteConfigPath = findFile(dir, VITE_CONFIG_FILES);
  if (!viteConfigPath) {
    throw new Error(`Could not find ${VITE_CONFIG_FILES.join(", ")}`);
  }

  const changes: FileChange[] = [];
  const viteConfig = fs.readFileSync(viteConfigPath, "utf8");
  let updatedViteConfig = addVitePlugin(viteConfig, viteConfigPath, TIDEWAVE_PLUGIN);

  if (projectType === "tanstack") {
    updatedViteConfig = addVitePlugin(updatedViteConfig, viteConfigPath, DEVTOOLS_PLUGIN);
  }

  if (updatedViteConfig !== viteConfig) {
    changes.push({ path: viteConfigPath, content: updatedViteConfig });
  }

  if (projectType === "tanstack") {
    // The start file is optional in TanStack Start, so we create it when missing.
    const startPath =
      findFile(dir, TANSTACK_START_FILES) ?? path.join(dir, TANSTACK_START_FILES[0]!);
    const start = fs.existsSync(startPath) ? fs.readFileSync(startPath, "utf8") : DEFAULT_START;
    const updatedStart = addTanStackImport(start, startPath);

    if (updatedStart !== start) {
      changes.push({ path: startPath, content: updatedStart });
    }
  }

  return changes;
}

function findFile(dir: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const filePath = path.join(dir, candidate);
    if (fs.existsSync(filePath)) return filePath;
  }

  return null;
}

function addVitePlugin(source: string, fileName: string, plugin: VitePlugin): string {
  let updated = source;
  const sourceFile = parseSource(source, fileName);
  const config = findViteConfigObject(sourceFile);

  if (!config) {
    throw new Error(`Could not find the Vite configuration object in ${fileName}`);
  }

  const existingImportName = findImportName(sourceFile, plugin);
  const pluginName = existingImportName ?? availablePluginName(sourceFile, plugin);

  if (new RegExp(`\\b${pluginName}\\s*\\(`).test(source)) {
    return source;
  }

  const devtoolsName = findImportName(sourceFile, DEVTOOLS_PLUGIN);
  updated = addPluginToConfig(updated, config, pluginName, devtoolsName);

  if (!existingImportName) {
    const reparsed = parseSource(updated, fileName);
    updated = addImport(updated, reparsed, pluginName, plugin);
  }

  return updated;
}

function addTanStackImport(source: string, fileName: string): string {
  if (source.includes("tidewave/tanstack")) return source;

  const sourceFile = parseSource(source, fileName);
  const insertion = `// Import Tidewave only in development.
if (process.env.NODE_ENV === 'development' && typeof window === 'undefined') {
  import('tidewave/tanstack');
}
`;
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);

  if (imports.length === 0) {
    return `${insertion}\n${source}`;
  }

  const lastImport = imports[imports.length - 1]!;
  const remainder = source.slice(lastImport.end).replace(/^\r?\n/, "");
  return `${source.slice(0, lastImport.end)}\n\n${insertion}${remainder}`;
}

function parseSource(source: string, fileName: string): ts.SourceFile {
  const scriptKind =
    fileName.endsWith(".js") || fileName.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const { parseDiagnostics } = sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[];
  };

  if (parseDiagnostics && parseDiagnostics.length > 0) {
    throw new Error(`Could not parse ${fileName}`);
  }

  return sourceFile;
}

function findViteConfigObject(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
  let result: ts.ObjectLiteralExpression | null = null;

  function visit(node: ts.Node): void {
    if (result) return;

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "defineConfig"
    ) {
      const [argument] = node.arguments;
      if (argument) {
        result = findObjectLiteral(argument);
        if (result) return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

function findObjectLiteral(node: ts.Node): ts.ObjectLiteralExpression | null {
  if (ts.isObjectLiteralExpression(node)) return node;

  let result: ts.ObjectLiteralExpression | null = null;
  ts.forEachChild(node, (child) => {
    if (!result) result = findObjectLiteral(child);
  });
  return result;
}

function findImportName(sourceFile: ts.SourceFile, plugin: VitePlugin): string | null {
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === plugin.module
    ) {
      const clause = statement.importClause;
      if (!plugin.namedExport) return clause?.name?.text ?? null;

      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const element = bindings.elements.find(
          (element) => (element.propertyName ?? element.name).text === plugin.name,
        );
        if (element) return element.name.text;
      }
    }
  }

  return null;
}

function availablePluginName(sourceFile: ts.SourceFile, plugin: VitePlugin): string {
  const identifiers = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return identifiers.has(plugin.name) ? `${plugin.name}Plugin` : plugin.name;
}

function addPluginToConfig(
  source: string,
  config: ts.ObjectLiteralExpression,
  pluginName: string,
  firstPluginName: string | null,
): string {
  const plugins = config.properties.find(
    (property) =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      property.name.getText() === "plugins",
  );

  if (plugins) {
    if (ts.isShorthandPropertyAssignment(plugins)) {
      return `${source.slice(0, plugins.getStart())}plugins: [${pluginName}(), ...plugins]${source.slice(
        plugins.end,
      )}`;
    }

    if (!ts.isPropertyAssignment(plugins) || !ts.isArrayLiteralExpression(plugins.initializer)) {
      throw new Error(
        "The Vite plugins option must be an inline array to install Tidewave automatically. " +
          `Add ${pluginName}() to the existing plugins array manually.`,
      );
    }

    const array = plugins.initializer;
    if (array.elements.length === 0) {
      return `${source.slice(0, array.getStart() + 1)}${pluginName}()${source.slice(array.end - 1)}`;
    }

    const firstElement = array.elements[0]!;
    if (isCallTo(firstElement, firstPluginName)) {
      return `${source.slice(0, firstElement.end)}, ${pluginName}()${source.slice(firstElement.end)}`;
    }

    return `${source.slice(0, firstElement.getStart())}${pluginName}(), ${source.slice(
      firstElement.getStart(),
    )}`;
  }

  if (config.properties.some(ts.isSpreadAssignment)) {
    throw new Error(
      "Could not safely add Tidewave to a Vite config with spread properties. " +
        `Add ${pluginName}() to the plugins array manually.`,
    );
  }

  const closingBrace = config.end - 1;
  const configText = source.slice(config.getStart(), config.end);

  if (!configText.includes("\n")) {
    const openingBrace = config.getStart() + 1;
    const separator = config.properties.length > 0 ? ", " : "";
    return `${source.slice(0, openingBrace)}plugins: [${pluginName}()]${separator}${source.slice(
      openingBrace,
    )}`;
  }

  const closingLineStart = source.lastIndexOf("\n", closingBrace - 1) + 1;
  const closingIndent = source.slice(closingLineStart, closingBrace);
  const propertyIndent = `${closingIndent}  `;
  const previous = source.slice(0, closingLineStart);
  const needsComma = config.properties.length > 0 && !previous.trimEnd().endsWith(",");
  const comma = needsComma ? "," : "";

  return `${previous.trimEnd()}${comma}\n${propertyIndent}plugins: [${pluginName}()],\n${source.slice(
    closingLineStart,
  )}`;
}

function isCallTo(node: ts.Node, name: string | null): boolean {
  return (
    name !== null &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === name
  );
}

function addImport(
  source: string,
  sourceFile: ts.SourceFile,
  name: string,
  plugin: VitePlugin,
): string {
  let binding = name;
  if (plugin.namedExport) {
    binding = name === plugin.name ? `{ ${name} }` : `{ ${plugin.name} as ${name} }`;
  }
  const statement = `import ${binding} from '${plugin.module}';`;
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);

  if (imports.length === 0) return `${statement}\n${source}`;

  const lastImport = imports[imports.length - 1]!;
  return `${source.slice(0, lastImport.end)}\n${statement}${source.slice(lastImport.end)}`;
}

function detectPackageManager(dir: string): string {
  if (fs.existsSync(path.join(dir, "bun.lock")) || fs.existsSync(path.join(dir, "bun.lockb"))) {
    return "bun";
  }
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

function installDependencies(dir: string, packages: string[], dryRun: boolean): void {
  const packageManager = detectPackageManager(dir);
  const args: Record<string, string[]> = {
    npm: ["install", "-D"],
    yarn: ["add", "-D"],
    pnpm: ["add", "--save-dev"],
    bun: ["add", "--dev"],
  };
  const installArgs = [...args[packageManager]!, ...packages];

  console.log(chalk.yellow("📦 Installing Tidewave..."));

  if (dryRun) {
    console.log(chalk.gray(`[DRY RUN] Would run: ${packageManager} ${installArgs.join(" ")}`));
    return;
  }

  try {
    childProcess.execFileSync(packageManager, installArgs, {
      cwd: dir,
      stdio: "inherit",
    });
    console.log(chalk.green("✅ Tidewave installed"));
  } catch {
    console.error(chalk.red("\n❌ Failed to install Tidewave"));
    console.log(chalk.gray(`\nPlease run manually:\n  ${packageManager} ${installArgs.join(" ")}`));
  }
}
