/**
 * <ai-chat> Web Component
 *
 * A chat interface for AI conversations with streaming markdown support.
 * Uses streaming-markdown library for real-time markdown rendering.
 *
 * @example
 * ```html
 * <ai-chat placeholder="Ask me anything..."></ai-chat>
 *
 * <script type="module">
 *   import { MockChatProvider } from 'ai-components';
 *
 *   const chat = document.querySelector('ai-chat');
 *   chat.provider = new MockChatProvider();
 * </script>
 * ```
 */

import { loadStreamingMarkdown, type StreamingMarkdown, type Parser } from "./streaming-markdown.ts";
import type {
  ChatMessage,
  ChatProvider,
  MessageSentDetail,
  ResponseCompleteDetail,
  ResponseErrorDetail,
} from "./types.ts";

// Generate unique IDs
let idCounter = 0;
function generateId(): string {
  return `msg-${Date.now()}-${++idCounter}`;
}

export class AIChat extends HTMLElement {
  private messages: ChatMessage[] = [];
  private _provider: ChatProvider | null = null;
  private smd: StreamingMarkdown | null = null;
  private isStreaming = false;
  private currentParser: Parser | null = null;

  // DOM references
  private messagesContainer: HTMLElement | null = null;
  private inputElement: HTMLTextAreaElement | null = null;
  private sendButton: HTMLButtonElement | null = null;

  static get observedAttributes() {
    return ["placeholder", "disabled"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  get provider(): ChatProvider | null {
    return this._provider;
  }

  set provider(value: ChatProvider | null) {
    this._provider = value;
  }

  get placeholder(): string {
    return this.getAttribute("placeholder") || "Type a message...";
  }

  set placeholder(value: string) {
    this.setAttribute("placeholder", value);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    if (value) {
      this.setAttribute("disabled", "");
    } else {
      this.removeAttribute("disabled");
    }
  }

  async connectedCallback() {
    // Load streaming-markdown library
    this.smd = await loadStreamingMarkdown();

    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    // Cleanup
    if (this.currentParser && this.smd) {
      this.smd.parser_end(this.currentParser);
    }
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (name === "placeholder" && this.inputElement) {
      this.inputElement.placeholder = newValue || "Type a message...";
    }
    if (name === "disabled") {
      this.updateDisabledState();
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 300px;
          font-family: system-ui, -apple-system, sans-serif;
          --ai-chat-bg: #ffffff;
          --ai-chat-border: #e0e0e0;
          --ai-chat-user-bg: #007bff;
          --ai-chat-user-color: #ffffff;
          --ai-chat-assistant-bg: #f0f0f0;
          --ai-chat-assistant-color: #333333;
          --ai-chat-input-bg: #ffffff;
          --ai-chat-input-border: #cccccc;
          --ai-chat-button-bg: #007bff;
          --ai-chat-button-color: #ffffff;
          --ai-chat-button-hover: #0056b3;
        }

        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--ai-chat-bg);
          border: 1px solid var(--ai-chat-border);
          border-radius: 8px;
          overflow: hidden;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 12px;
          line-height: 1.5;
        }

        .message.user {
          align-self: flex-end;
          background: var(--ai-chat-user-bg);
          color: var(--ai-chat-user-color);
          border-bottom-right-radius: 4px;
        }

        .message.assistant {
          align-self: flex-start;
          background: var(--ai-chat-assistant-bg);
          color: var(--ai-chat-assistant-color);
          border-bottom-left-radius: 4px;
        }

        /* Streaming markdown styles */
        .message.assistant pre {
          background: rgba(0,0,0,0.05);
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 8px 0;
        }

        .message.assistant code {
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          font-size: 0.9em;
        }

        .message.assistant :not(pre) > code {
          background: rgba(0,0,0,0.08);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .message.assistant h1,
        .message.assistant h2,
        .message.assistant h3 {
          margin: 12px 0 8px 0;
        }

        .message.assistant h1:first-child,
        .message.assistant h2:first-child,
        .message.assistant h3:first-child {
          margin-top: 0;
        }

        .message.assistant p {
          margin: 8px 0;
        }

        .message.assistant p:first-child {
          margin-top: 0;
        }

        .message.assistant p:last-child {
          margin-bottom: 0;
        }

        .message.assistant ul,
        .message.assistant ol {
          margin: 8px 0;
          padding-left: 24px;
        }

        .message.assistant blockquote {
          border-left: 3px solid rgba(0,0,0,0.2);
          margin: 8px 0;
          padding-left: 12px;
          color: rgba(0,0,0,0.7);
        }

        .message.assistant a {
          color: #0066cc;
          text-decoration: underline;
        }

        .message.assistant table {
          border-collapse: collapse;
          margin: 8px 0;
        }

        .message.assistant th,
        .message.assistant td {
          border: 1px solid rgba(0,0,0,0.2);
          padding: 6px 10px;
        }

        .message.assistant th {
          background: rgba(0,0,0,0.05);
        }

        .input-area {
          display: flex;
          gap: 8px;
          padding: 12px;
          border-top: 1px solid var(--ai-chat-border);
          background: var(--ai-chat-input-bg);
        }

        .input-area textarea {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid var(--ai-chat-input-border);
          border-radius: 20px;
          resize: none;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.4;
          max-height: 120px;
          min-height: 40px;
        }

        .input-area textarea:focus {
          outline: none;
          border-color: var(--ai-chat-button-bg);
        }

        .input-area textarea:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .input-area button {
          padding: 10px 20px;
          background: var(--ai-chat-button-bg);
          color: var(--ai-chat-button-color);
          border: none;
          border-radius: 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .input-area button:hover:not(:disabled) {
          background: var(--ai-chat-button-hover);
        }

        .input-area button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .streaming-indicator {
          display: none;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          font-size: 13px;
          color: #666;
        }

        .streaming-indicator.active {
          display: flex;
        }

        .streaming-indicator .dot {
          width: 6px;
          height: 6px;
          background: #666;
          border-radius: 50%;
          animation: pulse 1.4s infinite;
        }

        .streaming-indicator .dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .streaming-indicator .dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes pulse {
          0%, 80%, 100% {
            opacity: 0.3;
          }
          40% {
            opacity: 1;
          }
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
          text-align: center;
          padding: 20px;
        }

        .empty-state svg {
          width: 48px;
          height: 48px;
          margin-bottom: 12px;
          opacity: 0.5;
        }
      </style>

      <div class="chat-container">
        <div class="messages" role="log" aria-live="polite">
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>Start a conversation</span>
          </div>
        </div>
        <div class="streaming-indicator" aria-hidden="true">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
          <span>AI is thinking...</span>
        </div>
        <div class="input-area">
          <textarea
            placeholder="${this.placeholder}"
            rows="1"
            aria-label="Message input"
          ></textarea>
          <button type="button" aria-label="Send message">Send</button>
        </div>
      </div>
    `;

    this.messagesContainer = this.shadowRoot!.querySelector(".messages");
    this.inputElement = this.shadowRoot!.querySelector("textarea");
    this.sendButton = this.shadowRoot!.querySelector("button");

    this.updateDisabledState();
  }

  private setupEventListeners() {
    if (!this.inputElement || !this.sendButton) return;

    // Send on button click
    this.sendButton.addEventListener("click", () => this.handleSend());

    // Send on Enter (Shift+Enter for newline)
    this.inputElement.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea
    this.inputElement.addEventListener("input", () => {
      if (!this.inputElement) return;
      this.inputElement.style.height = "auto";
      this.inputElement.style.height = `${Math.min(this.inputElement.scrollHeight, 120)}px`;
    });
  }

  private updateDisabledState() {
    const isDisabled = this.disabled || this.isStreaming;
    if (this.inputElement) {
      this.inputElement.disabled = isDisabled;
    }
    if (this.sendButton) {
      this.sendButton.disabled = isDisabled;
    }
  }

  private async handleSend() {
    if (!this.inputElement || !this._provider || this.isStreaming) return;

    const content = this.inputElement.value.trim();
    if (!content) return;

    // Clear input
    this.inputElement.value = "";
    this.inputElement.style.height = "auto";

    // Create user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };

    this.addMessage(userMessage);

    // Dispatch message-sent event
    this.dispatchEvent(
      new CustomEvent<MessageSentDetail>("message-sent", {
        detail: { message: userMessage },
        bubbles: true,
      })
    );

    // Get AI response
    await this.getResponse();
  }

  private async getResponse() {
    if (!this._provider || !this.smd) return;

    this.isStreaming = true;
    this.updateDisabledState();
    this.setStreamingIndicator(true);

    // Dispatch response-start event
    this.dispatchEvent(
      new CustomEvent("response-start", { bubbles: true })
    );

    // Create assistant message element
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const messageEl = this.createMessageElement(assistantMessage);
    const contentEl = document.createElement("div");
    contentEl.className = "content";
    messageEl.appendChild(contentEl);

    // Initialize streaming markdown parser
    const renderer = this.smd.default_renderer(contentEl);
    this.currentParser = this.smd.parser(renderer);

    try {
      for await (const chunk of this._provider.sendMessage(this.messages)) {
        if (chunk.content) {
          assistantMessage.content += chunk.content;
          this.smd.parser_write(this.currentParser, chunk.content);

          // Dispatch chunk event
          this.dispatchEvent(
            new CustomEvent("response-chunk", {
              detail: { content: chunk.content },
              bubbles: true,
            })
          );

          // Scroll to bottom
          this.scrollToBottom();
        }

        if (chunk.done) {
          break;
        }
      }

      // End the parser
      this.smd.parser_end(this.currentParser);
      this.currentParser = null;

      // Store the message
      this.messages.push(assistantMessage);

      // Dispatch complete event
      this.dispatchEvent(
        new CustomEvent<ResponseCompleteDetail>("response-complete", {
          detail: { message: assistantMessage },
          bubbles: true,
        })
      );
    } catch (error) {
      // End parser on error
      if (this.currentParser) {
        this.smd.parser_end(this.currentParser);
        this.currentParser = null;
      }

      // Show error in message
      contentEl.textContent = "Sorry, an error occurred. Please try again.";

      // Dispatch error event
      this.dispatchEvent(
        new CustomEvent<ResponseErrorDetail>("response-error", {
          detail: { error: error as Error },
          bubbles: true,
        })
      );
    } finally {
      this.isStreaming = false;
      this.updateDisabledState();
      this.setStreamingIndicator(false);
    }
  }

  private addMessage(message: ChatMessage) {
    this.messages.push(message);

    // Remove empty state if present
    const emptyState = this.messagesContainer?.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }

    const messageEl = this.createMessageElement(message);

    // For user messages, add content directly
    if (message.role === "user") {
      messageEl.textContent = message.content;
    }

    this.scrollToBottom();
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const el = document.createElement("div");
    el.className = `message ${message.role}`;
    el.setAttribute("data-message-id", message.id);
    this.messagesContainer?.appendChild(el);
    return el;
  }

  private setStreamingIndicator(active: boolean) {
    const indicator = this.shadowRoot?.querySelector(".streaming-indicator");
    if (indicator) {
      indicator.classList.toggle("active", active);
    }
  }

  private scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  // ========== Public API ==========

  /**
   * Get the current conversation messages
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    this.messages = [];
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>Start a conversation</span>
        </div>
      `;
    }
  }

  /**
   * Programmatically send a message
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.inputElement) return;
    this.inputElement.value = content;
    await this.handleSend();
  }

  /**
   * Set initial messages (for restoring conversation)
   */
  setMessages(messages: ChatMessage[]) {
    this.messages = [];

    // Remove empty state
    const emptyState = this.messagesContainer?.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }

    // Clear existing messages
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = "";
    }

    // Add each message
    for (const message of messages) {
      this.messages.push(message);
      const el = this.createMessageElement(message);
      el.textContent = message.content;
    }

    this.scrollToBottom();
  }
}

// Register the custom element
if (typeof customElements !== "undefined") {
  customElements.define("ai-chat", AIChat);
}
