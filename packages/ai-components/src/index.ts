/**
 * AI Components
 *
 * A collection of AI-related web components for building chat interfaces
 * and other AI-powered UI elements.
 */

// Components
export { AIChat } from "./ai-chat.ts";

// Providers
export {
  MockChatProvider,
  EchoChatProvider,
  ProgrammableChatProvider,
  type MockProviderOptions,
} from "./mock-provider.ts";

// Types
export type {
  ChatMessage,
  ChatProvider,
  ChatStreamChunk,
  MessageRole,
  MessageSentDetail,
  ResponseCompleteDetail,
  ResponseErrorDetail,
  AIChatEventMap,
} from "./types.ts";

// Streaming markdown utilities
export {
  loadStreamingMarkdown,
  getStreamingMarkdown,
  isStreamingMarkdownLoaded,
  type StreamingMarkdown,
  type Parser,
  type Renderer,
} from "./streaming-markdown.ts";
