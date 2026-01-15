/**
 * Figma REST API client
 *
 * Provides typed access to the Figma API endpoints for:
 * - Variables/tokens (Enterprise only)
 * - File structure and components
 * - Image exports
 */

const FIGMA_API_BASE = "https://api.figma.com/v1";

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: "BOOLEAN" | "FLOAT" | "STRING" | "COLOR";
  valuesByMode: Record<string, FigmaVariableValue>;
  remote: boolean;
  description: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  codeSyntax: Record<string, string>;
}

export type FigmaVariableValue =
  | boolean
  | number
  | string
  | FigmaColor
  | FigmaVariableAlias;

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaVariableAlias {
  type: "VARIABLE_ALIAS";
  id: string;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  remote: boolean;
  hiddenFromPublishing: boolean;
  variableIds: string[];
}

export interface FigmaVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  styles: Record<string, FigmaStyle>;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  [key: string]: unknown;
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
  documentationLinks: string[];
}

export interface FigmaStyle {
  key: string;
  name: string;
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
  description: string;
}

export interface FigmaImageExportResponse {
  err: string | null;
  images: Record<string, string>;
}

export class FigmaApiClient {
  private token: string;
  private fileId: string;

  constructor(token: string, fileId: string) {
    this.token = token;
    this.fileId = fileId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${FIGMA_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "X-FIGMA-TOKEN": this.token,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Figma API error (${response.status}): ${errorText}\n` +
          `Endpoint: ${endpoint}`
      );
    }

    return response.json();
  }

  /**
   * Get local variables from the Figma file
   * NOTE: Requires Figma Enterprise plan
   */
  async getLocalVariables(): Promise<FigmaVariablesResponse> {
    return this.request(`/files/${this.fileId}/variables/local`);
  }

  /**
   * Get published variables from the Figma file
   * NOTE: Requires Figma Enterprise plan
   */
  async getPublishedVariables(): Promise<FigmaVariablesResponse> {
    return this.request(`/files/${this.fileId}/variables/published`);
  }

  /**
   * Get the full Figma file structure
   */
  async getFile(depth?: number): Promise<FigmaFile> {
    const params = depth ? `?depth=${depth}` : "";
    return this.request(`/files/${this.fileId}${params}`);
  }

  /**
   * Get file nodes by IDs
   */
  async getFileNodes(nodeIds: string[]): Promise<{
    name: string;
    nodes: Record<string, { document: FigmaNode }>;
  }> {
    const ids = nodeIds.join(",");
    return this.request(`/files/${this.fileId}/nodes?ids=${ids}`);
  }

  /**
   * Export images from nodes
   */
  async getImages(
    nodeIds: string[],
    format: "svg" | "png" | "jpg" | "pdf" = "svg",
    scale: number = 1
  ): Promise<FigmaImageExportResponse> {
    const ids = nodeIds.join(",");
    return this.request(
      `/images/${this.fileId}?ids=${ids}&format=${format}&scale=${scale}`
    );
  }

  /**
   * Get all components in the file
   */
  async getComponents(): Promise<{
    meta: { components: FigmaComponent[] };
  }> {
    return this.request(`/files/${this.fileId}/components`);
  }

  /**
   * Get all styles in the file
   */
  async getStyles(): Promise<{
    meta: { styles: FigmaStyle[] };
  }> {
    return this.request(`/files/${this.fileId}/styles`);
  }
}
