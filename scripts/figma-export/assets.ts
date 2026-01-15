/**
 * Asset export from Figma
 *
 * Exports components and frames as image assets (SVG, PNG, JPG, WebP, PDF)
 */

import { FigmaApiClient, type FigmaNode, type FigmaComponent } from "./api";
import { type FigmaExportConfig, validateApiConfig } from "./config";

interface ExportableNode {
  id: string;
  name: string;
  path: string[];
}

/**
 * Export assets from Figma file
 */
export async function exportAssets(
  config: FigmaExportConfig,
  dryRun: boolean = false
): Promise<void> {
  validateApiConfig(config);

  console.log("📥 Fetching file structure from Figma...\n");

  const client = new FigmaApiClient(config.token!, config.fileId!);

  // Get file structure to find exportable components
  const file = await client.getFile();

  console.log(`📄 File: ${file.name}`);
  console.log(`   Last modified: ${file.lastModified}\n`);

  // Find components matching patterns
  const patterns = config.assets?.componentPatterns || [];
  const nodeIds = config.assets?.nodeIds || [];

  let exportableNodes: ExportableNode[] = [];

  if (nodeIds.length > 0) {
    // Use explicitly specified node IDs
    exportableNodes = nodeIds.map((id) => ({
      id,
      name: id,
      path: [],
    }));
    console.log(`🎯 Using ${nodeIds.length} specified node IDs`);
  } else if (patterns.length > 0) {
    // Find components matching patterns
    exportableNodes = findMatchingNodes(file.document, patterns);
    console.log(
      `🔍 Found ${exportableNodes.length} components matching patterns: ${patterns.join(", ")}`
    );
  } else {
    // Find all components
    exportableNodes = findAllComponents(file.document, file.components);
    console.log(`🔍 Found ${exportableNodes.length} components in file`);
  }

  if (exportableNodes.length === 0) {
    console.log("⚠️  No exportable assets found");
    return;
  }

  // Export in each format
  const formats = config.assets?.formats || ["svg"];
  const scales = config.assets?.scales || [1];
  const outputDir = config.assets?.outputDir || "src/assets/figma";

  for (const format of formats) {
    const isRaster = ["png", "jpg", "webp"].includes(format);
    const formatScales = isRaster ? scales : [1]; // Only scale raster formats

    for (const scale of formatScales) {
      console.log(
        `\n📤 Exporting ${format.toUpperCase()}${isRaster && scale !== 1 ? ` @${scale}x` : ""}...`
      );

      const nodeIdList = exportableNodes.map((n) => n.id);

      if (dryRun) {
        console.log(`   Would export ${nodeIdList.length} assets`);
        for (const node of exportableNodes.slice(0, 5)) {
          const fileName = generateFileName(node, format, scale);
          console.log(`   - ${outputDir}/${fileName}`);
        }
        if (exportableNodes.length > 5) {
          console.log(`   ... and ${exportableNodes.length - 5} more`);
        }
        continue;
      }

      // Get image URLs from Figma
      const response = await client.getImages(nodeIdList, format as "svg" | "png" | "jpg" | "pdf", scale);

      if (response.err) {
        console.error(`   ❌ Error: ${response.err}`);
        continue;
      }

      // Download and save each image
      let successCount = 0;
      let errorCount = 0;

      for (const node of exportableNodes) {
        const imageUrl = response.images[node.id];

        if (!imageUrl) {
          console.error(`   ⚠️  No image URL for ${node.name}`);
          errorCount++;
          continue;
        }

        const fileName = generateFileName(node, format, scale);
        const filePath = `${outputDir}/${fileName}`;

        try {
          await downloadImage(imageUrl, filePath);
          successCount++;
        } catch (error) {
          console.error(`   ❌ Failed to download ${node.name}: ${error}`);
          errorCount++;
        }
      }

      console.log(`   ✅ Exported ${successCount} assets${errorCount > 0 ? `, ${errorCount} failed` : ""}`);
    }
  }
}

function findMatchingNodes(
  root: FigmaNode,
  patterns: string[],
  path: string[] = []
): ExportableNode[] {
  const nodes: ExportableNode[] = [];

  const currentPath = root.name ? [...path, root.name] : path;
  const fullPath = currentPath.join("/");

  // Check if this node matches any pattern
  for (const pattern of patterns) {
    if (matchGlobPattern(fullPath, pattern)) {
      nodes.push({
        id: root.id,
        name: root.name,
        path: currentPath,
      });
      break;
    }
  }

  // Recurse into children
  if (root.children) {
    for (const child of root.children) {
      nodes.push(...findMatchingNodes(child, patterns, currentPath));
    }
  }

  return nodes;
}

function findAllComponents(
  root: FigmaNode,
  components: Record<string, FigmaComponent>,
  path: string[] = []
): ExportableNode[] {
  const nodes: ExportableNode[] = [];
  const currentPath = root.name ? [...path, root.name] : path;

  // Check if this is a component
  if (root.type === "COMPONENT" || root.type === "COMPONENT_SET") {
    nodes.push({
      id: root.id,
      name: root.name,
      path: currentPath,
    });
  }

  // Recurse into children
  if (root.children) {
    for (const child of root.children) {
      nodes.push(...findAllComponents(child, components, currentPath));
    }
  }

  return nodes;
}

function matchGlobPattern(str: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*/g, ".*") // * matches anything
    .replace(/\?/g, "."); // ? matches single char

  const regex = new RegExp(`^${regexPattern}$`, "i");
  return regex.test(str);
}

function generateFileName(
  node: ExportableNode,
  format: string,
  scale: number
): string {
  // Use the path to create a hierarchical filename
  const nameParts = node.path.length > 0 ? node.path : [node.name];

  const safeName = nameParts
    .map((p) =>
      p
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    )
    .join("/");

  const scaleSuffix = scale !== 1 ? `@${scale}x` : "";

  return `${safeName}${scaleSuffix}.${format}`;
}

async function downloadImage(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();

  // Ensure directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) {
    await Bun.$`mkdir -p ${dir}`.quiet();
  }

  await Bun.write(filePath, buffer);
}
