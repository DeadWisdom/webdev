/**
 * Figma Export Configuration
 *
 * This file configures how design tokens and assets are exported from Figma.
 *
 * Setup:
 * 1. Get a Personal Access Token from Figma (Settings > Personal Access Tokens)
 * 2. Get your File ID from the Figma URL: figma.com/file/<FILE_ID>/...
 * 3. Set FIGMA_TOKEN and FIGMA_FILE_ID environment variables, or add below
 *
 * Usage:
 *   bun scripts/figma-export/index.ts tokens    # Export design tokens
 *   bun scripts/figma-export/index.ts assets    # Export assets
 *   bun scripts/figma-export/index.ts all       # Export everything
 *
 * For non-Enterprise plans (no Variables API):
 *   1. Install "Design Tokens" plugin in Figma
 *   2. Export tokens as JSON from the plugin
 *   3. Run: bun scripts/figma-export/index.ts tokens --from-file ./design-tokens.json
 */

import type { FigmaExportConfig } from "./scripts/figma-export/config";

const config: FigmaExportConfig = {
  // Figma credentials (or use environment variables FIGMA_TOKEN and FIGMA_FILE_ID)
  // token: "your-figma-token",
  // fileId: "your-file-id",

  tokens: {
    // Output paths for generated files
    cssOutput: "src/styles/tokens.css",
    tsOutput: "src/styles/tokens.ts",
    jsonOutput: "src/styles/tokens.json",

    // Optional CSS variable prefix (e.g., "app" → --app-color-primary)
    prefix: "",

    // Filter to specific variable collections (empty = all)
    // collections: ["Colors", "Typography", "Spacing"],

    // Filter to specific modes/themes (empty = all)
    // modes: ["Light", "Dark"],
  },

  assets: {
    // Output directory for exported assets
    outputDir: "src/assets/figma",

    // Image formats to export
    formats: ["svg"],

    // Scale factors for raster formats (PNG, JPG, WebP)
    scales: [1, 2],

    // Export components matching these patterns (glob syntax)
    componentPatterns: [
      "Icons/*",
      "Icon/*",
      "Logos/*",
      "Logo/*",
      "Illustrations/*",
    ],

    // Or specify exact node IDs to export
    // nodeIds: ["1:23", "4:56"],
  },
};

export default config;
