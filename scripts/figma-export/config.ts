/**
 * Configuration types and loader for Figma export
 */

export interface FigmaExportConfig {
  /** Figma personal access token (can also use FIGMA_TOKEN env var) */
  token?: string;

  /** Figma file ID from the URL (can also use FIGMA_FILE_ID env var) */
  fileId?: string;

  /** Output configuration for tokens */
  tokens?: {
    /** Output file path for CSS variables */
    cssOutput?: string;
    /** Output file path for TypeScript types */
    tsOutput?: string;
    /** Output file path for JSON tokens */
    jsonOutput?: string;
    /** CSS variable prefix (default: none) */
    prefix?: string;
    /** Variable collections to include (empty = all) */
    collections?: string[];
    /** Variable modes to export (empty = all) */
    modes?: string[];
  };

  /** Output configuration for assets */
  assets?: {
    /** Output directory for exported assets */
    outputDir?: string;
    /** Asset formats to export */
    formats?: ("svg" | "png" | "jpg" | "webp" | "pdf")[];
    /** Scale factors for raster formats (default: [1]) */
    scales?: number[];
    /** Node IDs to export (empty = all exportable) */
    nodeIds?: string[];
    /** Export components matching these names (glob patterns) */
    componentPatterns?: string[];
  };
}

const DEFAULT_CONFIG: FigmaExportConfig = {
  tokens: {
    cssOutput: "src/styles/tokens.css",
    tsOutput: "src/styles/tokens.ts",
    jsonOutput: "src/styles/tokens.json",
    prefix: "",
    collections: [],
    modes: [],
  },
  assets: {
    outputDir: "src/assets/figma",
    formats: ["svg"],
    scales: [1, 2],
    nodeIds: [],
    componentPatterns: ["Icon/*", "Logo/*"],
  },
};

export async function loadConfig(
  configPath: string
): Promise<FigmaExportConfig> {
  // Try to load config file
  let fileConfig: Partial<FigmaExportConfig> = {};

  try {
    const fullPath = configPath.startsWith("/")
      ? configPath
      : `${process.cwd()}/${configPath}`;

    const configModule = await import(fullPath);
    fileConfig = configModule.default || configModule;
    console.log(`📄 Loaded config from ${configPath}`);
  } catch {
    console.log(`📄 No config file found, using defaults`);
  }

  // Merge with defaults and environment variables
  const config: FigmaExportConfig = {
    token: process.env.FIGMA_TOKEN || fileConfig.token,
    fileId: process.env.FIGMA_FILE_ID || fileConfig.fileId,
    tokens: {
      ...DEFAULT_CONFIG.tokens,
      ...fileConfig.tokens,
    },
    assets: {
      ...DEFAULT_CONFIG.assets,
      ...fileConfig.assets,
    },
  };

  return config;
}

export function validateApiConfig(config: FigmaExportConfig): void {
  if (!config.token) {
    throw new Error(
      "Missing Figma token. Set FIGMA_TOKEN environment variable or add to config."
    );
  }
  if (!config.fileId) {
    throw new Error(
      "Missing Figma file ID. Set FIGMA_FILE_ID environment variable or add to config."
    );
  }
}
