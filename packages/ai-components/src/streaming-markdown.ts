/**
 * Type definitions and loader for streaming-markdown library
 * @see https://github.com/thetarnav/streaming-markdown
 */

export interface Renderer {
  data: HTMLElement;
  add_token: (data: HTMLElement, type: number) => void;
  end_token: (data: HTMLElement, type: number) => void;
  add_text: (data: HTMLElement, text: string) => void;
  set_attr: (data: HTMLElement, type: number, value: string) => void;
}

export interface Parser {
  renderer: Renderer;
}

export interface StreamingMarkdown {
  parser: (renderer: Renderer) => Parser;
  parser_write: (parser: Parser, text: string) => void;
  parser_end: (parser: Parser) => void;
  default_renderer: (element: HTMLElement) => Renderer;
  logger_renderer: () => Renderer;
}

const SMD_CDN_URL = "https://cdn.jsdelivr.net/npm/streaming-markdown@latest/smd.min.js";

let smdModule: StreamingMarkdown | null = null;
let loadPromise: Promise<StreamingMarkdown> | null = null;

/**
 * Dynamically load the streaming-markdown library from CDN
 */
export async function loadStreamingMarkdown(): Promise<StreamingMarkdown> {
  if (smdModule) {
    return smdModule;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = import(/* @vite-ignore */ SMD_CDN_URL).then((mod) => {
    smdModule = mod as StreamingMarkdown;
    return smdModule;
  });

  return loadPromise;
}

/**
 * Get the cached streaming-markdown module (throws if not loaded)
 */
export function getStreamingMarkdown(): StreamingMarkdown {
  if (!smdModule) {
    throw new Error("streaming-markdown not loaded. Call loadStreamingMarkdown() first.");
  }
  return smdModule;
}

/**
 * Check if streaming-markdown is loaded
 */
export function isStreamingMarkdownLoaded(): boolean {
  return smdModule !== null;
}
