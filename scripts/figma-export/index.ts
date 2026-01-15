#!/usr/bin/env bun
/**
 * Figma Export Automation Script
 *
 * Exports design tokens (CSS variables) and assets from Figma files.
 *
 * Usage:
 *   bun scripts/figma-export/index.ts [command] [options]
 *
 * Commands:
 *   tokens    Export design tokens as CSS variables
 *   assets    Export image assets (icons, images)
 *   all       Export both tokens and assets
 *
 * Environment Variables:
 *   FIGMA_TOKEN     - Personal access token from Figma
 *   FIGMA_FILE_ID   - The file ID from the Figma URL
 *
 * Note: Variables API requires Figma Enterprise plan.
 *       For non-Enterprise users, use the Design Tokens plugin export.
 */

import { exportTokens, exportTokensFromFile } from "./tokens";
import { exportAssets } from "./assets";
import { loadConfig, type FigmaExportConfig } from "./config";

const HELP_TEXT = `
Figma Export Automation

Usage:
  bun scripts/figma-export/index.ts <command> [options]

Commands:
  tokens              Export design tokens as CSS variables
  tokens --from-file  Import tokens from a local JSON file (Design Tokens plugin export)
  assets              Export image assets (icons, images, etc.)
  all                 Export both tokens and assets

Options:
  --config <path>     Path to config file (default: figma-export.config.ts)
  --from-file <path>  Import tokens from local JSON instead of API (for non-Enterprise)
  --dry-run           Preview what would be exported without writing files
  --help              Show this help message

Environment Variables:
  FIGMA_TOKEN         Personal access token from Figma (required for API)
  FIGMA_FILE_ID       The file ID from the Figma URL (required for API)

Examples:
  # Export tokens from Figma API (Enterprise only)
  FIGMA_TOKEN=xxx FIGMA_FILE_ID=abc123 bun scripts/figma-export/index.ts tokens

  # Export tokens from local JSON file (any plan)
  bun scripts/figma-export/index.ts tokens --from-file ./design-tokens.json

  # Export assets
  FIGMA_TOKEN=xxx FIGMA_FILE_ID=abc123 bun scripts/figma-export/index.ts assets

  # Export everything
  FIGMA_TOKEN=xxx FIGMA_FILE_ID=abc123 bun scripts/figma-export/index.ts all
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const command = args[0];
  const dryRun = args.includes("--dry-run");
  const fromFileIndex = args.indexOf("--from-file");
  const fromFile = fromFileIndex !== -1 ? args[fromFileIndex + 1] : undefined;

  const configIndex = args.indexOf("--config");
  const configPath =
    configIndex !== -1 ? args[configIndex + 1] : "figma-export.config.ts";

  const config = await loadConfig(configPath);

  console.log("🎨 Figma Export Automation\n");

  try {
    switch (command) {
      case "tokens":
        if (fromFile) {
          await exportTokensFromFile(fromFile, config, dryRun);
        } else {
          await exportTokens(config, dryRun);
        }
        break;

      case "assets":
        await exportAssets(config, dryRun);
        break;

      case "all":
        if (fromFile) {
          await exportTokensFromFile(fromFile, config, dryRun);
        } else {
          await exportTokens(config, dryRun);
        }
        await exportAssets(config, dryRun);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP_TEXT);
        process.exit(1);
    }

    console.log("\n✅ Export complete!");
  } catch (error) {
    console.error("\n❌ Export failed:", error);
    process.exit(1);
  }
}

main();
