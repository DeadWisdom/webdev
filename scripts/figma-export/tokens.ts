/**
 * Design tokens export and transformation
 *
 * Exports Figma variables as:
 * - CSS custom properties (variables)
 * - TypeScript type definitions
 * - JSON tokens file
 */

import { FigmaApiClient, type FigmaColor, type FigmaVariable } from "./api";
import { type FigmaExportConfig, validateApiConfig } from "./config";

// W3C Design Tokens Format (from Design Tokens plugin)
interface W3CTokenValue {
  $value: string | number | boolean | object;
  $type?:
    | "color"
    | "dimension"
    | "fontFamily"
    | "fontWeight"
    | "duration"
    | "cubicBezier"
    | "number"
    | "string";
  $description?: string;
}

interface W3CTokenGroup {
  [key: string]: W3CTokenValue | W3CTokenGroup;
}

interface ProcessedToken {
  name: string;
  cssName: string;
  value: string;
  type: "color" | "dimension" | "number" | "string" | "boolean";
  description?: string;
  collection?: string;
  mode?: string;
}

/**
 * Export tokens from Figma API (Enterprise only)
 */
export async function exportTokens(
  config: FigmaExportConfig,
  dryRun: boolean = false
): Promise<void> {
  validateApiConfig(config);

  console.log("📥 Fetching variables from Figma API...");
  console.log(
    "   Note: Variables API requires Figma Enterprise plan.\n" +
      "   For other plans, use: --from-file with Design Tokens plugin export.\n"
  );

  const client = new FigmaApiClient(config.token!, config.fileId!);

  try {
    const response = await client.getLocalVariables();

    if (response.error) {
      throw new Error("Failed to fetch variables from Figma");
    }

    const { variables, variableCollections } = response.meta;

    // Process variables into tokens
    const tokens = processVariables(variables, variableCollections, config);

    await writeTokenFiles(tokens, config, dryRun);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("403") &&
      error.message.includes("variables")
    ) {
      console.error(
        "❌ Variables API access denied.\n" +
          "   This endpoint requires Figma Enterprise plan.\n" +
          "   Alternative: Export tokens using the Design Tokens plugin and use --from-file flag."
      );
      throw error;
    }
    throw error;
  }
}

/**
 * Export tokens from a local JSON file (Design Tokens plugin export)
 */
export async function exportTokensFromFile(
  filePath: string,
  config: FigmaExportConfig,
  dryRun: boolean = false
): Promise<void> {
  console.log(`📥 Loading tokens from ${filePath}...`);

  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`Token file not found: ${filePath}`);
  }

  const content = await file.json();

  // Detect format and parse
  let tokens: ProcessedToken[];

  if (isW3CFormat(content)) {
    console.log("   Detected W3C Design Tokens format");
    tokens = parseW3CTokens(content, config);
  } else if (isStyleDictionaryFormat(content)) {
    console.log("   Detected Style Dictionary format");
    tokens = parseStyleDictionaryTokens(content, config);
  } else {
    throw new Error(
      "Unknown token format. Expected W3C Design Tokens or Style Dictionary format."
    );
  }

  await writeTokenFiles(tokens, config, dryRun);
}

function isW3CFormat(content: unknown): content is W3CTokenGroup {
  if (typeof content !== "object" || content === null) return false;
  // W3C format uses $value and optional $type
  const hasW3CProps = (obj: object): boolean => {
    for (const value of Object.values(obj)) {
      if (typeof value === "object" && value !== null) {
        if ("$value" in value) return true;
        if (hasW3CProps(value)) return true;
      }
    }
    return false;
  };
  return hasW3CProps(content as object);
}

function isStyleDictionaryFormat(content: unknown): boolean {
  if (typeof content !== "object" || content === null) return false;
  // Style Dictionary uses value (not $value)
  const hasSDProps = (obj: object): boolean => {
    for (const value of Object.values(obj)) {
      if (typeof value === "object" && value !== null) {
        if ("value" in value && !("$value" in value)) return true;
        if (hasSDProps(value)) return true;
      }
    }
    return false;
  };
  return hasSDProps(content as object);
}

function parseW3CTokens(
  content: W3CTokenGroup,
  config: FigmaExportConfig,
  path: string[] = []
): ProcessedToken[] {
  const tokens: ProcessedToken[] = [];
  const prefix = config.tokens?.prefix || "";

  for (const [key, value] of Object.entries(content)) {
    const currentPath = [...path, key];

    if (typeof value === "object" && value !== null && "$value" in value) {
      // This is a token
      const tokenValue = value as W3CTokenValue;
      const name = currentPath.join("/");
      const cssName = toCssVariableName(currentPath, prefix);

      tokens.push({
        name,
        cssName,
        value: formatCssValue(tokenValue.$value, tokenValue.$type),
        type: mapW3CType(tokenValue.$type),
        description: tokenValue.$description,
      });
    } else if (typeof value === "object" && value !== null) {
      // This is a group, recurse
      tokens.push(...parseW3CTokens(value as W3CTokenGroup, config, currentPath));
    }
  }

  return tokens;
}

function parseStyleDictionaryTokens(
  content: Record<string, unknown>,
  config: FigmaExportConfig,
  path: string[] = []
): ProcessedToken[] {
  const tokens: ProcessedToken[] = [];
  const prefix = config.tokens?.prefix || "";

  for (const [key, value] of Object.entries(content)) {
    const currentPath = [...path, key];

    if (
      typeof value === "object" &&
      value !== null &&
      "value" in value &&
      !("$value" in value)
    ) {
      // This is a Style Dictionary token
      const tokenValue = value as { value: unknown; type?: string; description?: string };
      const name = currentPath.join("/");
      const cssName = toCssVariableName(currentPath, prefix);

      tokens.push({
        name,
        cssName,
        value: formatCssValue(tokenValue.value, tokenValue.type),
        type: mapW3CType(tokenValue.type),
        description: tokenValue.description,
      });
    } else if (typeof value === "object" && value !== null) {
      // This is a group, recurse
      tokens.push(
        ...parseStyleDictionaryTokens(value as Record<string, unknown>, config, currentPath)
      );
    }
  }

  return tokens;
}

function processVariables(
  variables: Record<string, FigmaVariable>,
  collections: Record<string, { name: string; modes: Array<{ modeId: string; name: string }> }>,
  config: FigmaExportConfig
): ProcessedToken[] {
  const tokens: ProcessedToken[] = [];
  const prefix = config.tokens?.prefix || "";
  const filterCollections = config.tokens?.collections || [];
  const filterModes = config.tokens?.modes || [];

  for (const variable of Object.values(variables)) {
    const collection = collections[variable.variableCollectionId];

    // Filter by collection if specified
    if (filterCollections.length > 0 && !filterCollections.includes(collection.name)) {
      continue;
    }

    for (const mode of collection.modes) {
      // Filter by mode if specified
      if (filterModes.length > 0 && !filterModes.includes(mode.name)) {
        continue;
      }

      const value = variable.valuesByMode[mode.modeId];
      if (value === undefined) continue;

      // Skip aliases for now (could resolve them)
      if (typeof value === "object" && value !== null && "type" in value) {
        continue;
      }

      const nameParts =
        collection.modes.length > 1
          ? [collection.name, mode.name, variable.name]
          : [collection.name, variable.name];

      const cssName = toCssVariableName(nameParts, prefix);

      tokens.push({
        name: variable.name,
        cssName,
        value: formatVariableValue(value, variable.resolvedType),
        type: mapFigmaType(variable.resolvedType),
        description: variable.description,
        collection: collection.name,
        mode: mode.name,
      });
    }
  }

  return tokens;
}

function toCssVariableName(parts: string[], prefix: string): string {
  const name = parts
    .map((p) =>
      p
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    )
    .join("-");

  return prefix ? `--${prefix}-${name}` : `--${name}`;
}

function formatCssValue(value: unknown, type?: string): string {
  if (type === "color" && typeof value === "object" && value !== null) {
    const color = value as { r?: number; g?: number; b?: number; a?: number };
    if ("r" in color && "g" in color && "b" in color) {
      return formatColor(color as FigmaColor);
    }
  }

  if (typeof value === "string") {
    // Check if it's already a CSS value
    if (
      value.startsWith("#") ||
      value.startsWith("rgb") ||
      value.startsWith("hsl") ||
      value.endsWith("px") ||
      value.endsWith("rem") ||
      value.endsWith("em") ||
      value.endsWith("%")
    ) {
      return value;
    }
    return value;
  }

  if (typeof value === "number") {
    if (type === "dimension") {
      return `${value}px`;
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return String(value);
}

function formatVariableValue(
  value: boolean | number | string | FigmaColor,
  type: string
): string {
  if (type === "COLOR" && typeof value === "object") {
    return formatColor(value as FigmaColor);
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return String(value);
}

function formatColor(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a;

  if (a === 1) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function mapW3CType(
  type?: string
): "color" | "dimension" | "number" | "string" | "boolean" {
  switch (type) {
    case "color":
      return "color";
    case "dimension":
      return "dimension";
    case "number":
    case "fontWeight":
    case "duration":
      return "number";
    default:
      return "string";
  }
}

function mapFigmaType(
  type: string
): "color" | "dimension" | "number" | "string" | "boolean" {
  switch (type) {
    case "COLOR":
      return "color";
    case "FLOAT":
      return "number";
    case "BOOLEAN":
      return "boolean";
    default:
      return "string";
  }
}

async function writeTokenFiles(
  tokens: ProcessedToken[],
  config: FigmaExportConfig,
  dryRun: boolean
): Promise<void> {
  console.log(`\n📊 Processed ${tokens.length} tokens\n`);

  // Generate CSS
  if (config.tokens?.cssOutput) {
    const css = generateCss(tokens);
    if (dryRun) {
      console.log(`Would write CSS to ${config.tokens.cssOutput}:`);
      console.log(css.slice(0, 500) + (css.length > 500 ? "\n..." : ""));
    } else {
      await ensureDir(config.tokens.cssOutput);
      await Bun.write(config.tokens.cssOutput, css);
      console.log(`✅ Written CSS to ${config.tokens.cssOutput}`);
    }
  }

  // Generate TypeScript
  if (config.tokens?.tsOutput) {
    const ts = generateTypeScript(tokens);
    if (dryRun) {
      console.log(`\nWould write TypeScript to ${config.tokens.tsOutput}:`);
      console.log(ts.slice(0, 500) + (ts.length > 500 ? "\n..." : ""));
    } else {
      await ensureDir(config.tokens.tsOutput);
      await Bun.write(config.tokens.tsOutput, ts);
      console.log(`✅ Written TypeScript to ${config.tokens.tsOutput}`);
    }
  }

  // Generate JSON
  if (config.tokens?.jsonOutput) {
    const json = generateJson(tokens);
    if (dryRun) {
      console.log(`\nWould write JSON to ${config.tokens.jsonOutput}`);
    } else {
      await ensureDir(config.tokens.jsonOutput);
      await Bun.write(config.tokens.jsonOutput, json);
      console.log(`✅ Written JSON to ${config.tokens.jsonOutput}`);
    }
  }
}

function generateCss(tokens: ProcessedToken[]): string {
  const lines = [
    "/**",
    " * Design Tokens - Auto-generated from Figma",
    ` * Generated: ${new Date().toISOString()}`,
    " * Do not edit directly - run figma-export to update",
    " */",
    "",
    ":root {",
  ];

  // Group by type for organization
  const byType = new Map<string, ProcessedToken[]>();
  for (const token of tokens) {
    const existing = byType.get(token.type) || [];
    existing.push(token);
    byType.set(token.type, existing);
  }

  const typeOrder = ["color", "dimension", "number", "string", "boolean"];

  for (const type of typeOrder) {
    const typeTokens = byType.get(type);
    if (!typeTokens?.length) continue;

    lines.push(`  /* ${type}s */`);
    for (const token of typeTokens) {
      if (token.description) {
        lines.push(`  /* ${token.description} */`);
      }
      lines.push(`  ${token.cssName}: ${token.value};`);
    }
    lines.push("");
  }

  lines.push("}");

  return lines.join("\n");
}

function generateTypeScript(tokens: ProcessedToken[]): string {
  const lines = [
    "/**",
    " * Design Tokens - Auto-generated from Figma",
    ` * Generated: ${new Date().toISOString()}`,
    " * Do not edit directly - run figma-export to update",
    " */",
    "",
    "export const tokens = {",
  ];

  for (const token of tokens) {
    const key = token.name
      .split("/")
      .map((p, i) => (i === 0 ? camelCase(p) : pascalCase(p)))
      .join("");

    if (token.description) {
      lines.push(`  /** ${token.description} */`);
    }
    lines.push(`  ${key}: "var(${token.cssName})" as const,`);
  }

  lines.push("} as const;");
  lines.push("");
  lines.push("export type TokenKey = keyof typeof tokens;");
  lines.push("");

  // Generate CSS variable names as a type
  lines.push("export const cssVariables = {");
  for (const token of tokens) {
    const key = token.name
      .split("/")
      .map((p, i) => (i === 0 ? camelCase(p) : pascalCase(p)))
      .join("");
    lines.push(`  ${key}: "${token.cssName}" as const,`);
  }
  lines.push("} as const;");
  lines.push("");
  lines.push("export type CssVariable = (typeof cssVariables)[keyof typeof cssVariables];");

  return lines.join("\n");
}

function generateJson(tokens: ProcessedToken[]): string {
  const output: Record<string, object> = {};

  for (const token of tokens) {
    output[token.name] = {
      cssName: token.cssName,
      value: token.value,
      type: token.type,
      ...(token.description && { description: token.description }),
      ...(token.collection && { collection: token.collection }),
      ...(token.mode && { mode: token.mode }),
    };
  }

  return JSON.stringify(output, null, 2);
}

function camelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

function pascalCase(str: string): string {
  const camel = camelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) {
    await Bun.$`mkdir -p ${dir}`.quiet();
  }
}
