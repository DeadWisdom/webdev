/**
 * Types for AI chat components
 */

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp?: number;
}

export interface ChatStreamChunk {
  content: string;
  done: boolean;
}

/**
 * Chat provider interface for streaming AI responses
 */
export interface ChatProvider {
  /**
   * Send a message and receive a streaming response
   * @param messages The conversation history
   * @returns An async iterator of response chunks
   */
  sendMessage(messages: ChatMessage[]): AsyncIterable<ChatStreamChunk>;
}

/**
 * Event detail for message-sent event
 */
export interface MessageSentDetail {
  message: ChatMessage;
}

/**
 * Event detail for response-complete event
 */
export interface ResponseCompleteDetail {
  message: ChatMessage;
}

/**
 * Event detail for response-error event
 */
export interface ResponseErrorDetail {
  error: Error;
}

/**
 * AI Chat element events
 */
export interface AIChatEventMap {
  "message-sent": CustomEvent<MessageSentDetail>;
  "response-start": CustomEvent<void>;
  "response-chunk": CustomEvent<{ content: string }>;
  "response-complete": CustomEvent<ResponseCompleteDetail>;
  "response-error": CustomEvent<ResponseErrorDetail>;
}
