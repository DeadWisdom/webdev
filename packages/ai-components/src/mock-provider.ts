/**
 * Mock Chat Provider for testing
 *
 * Provides simulated AI responses with streaming markdown content.
 */

import type { ChatMessage, ChatProvider, ChatStreamChunk } from "./types.ts";

export interface MockProviderOptions {
  /** Delay between chunks in milliseconds (default: 30) */
  chunkDelay?: number;
  /** Size of each chunk in characters (default: 5) */
  chunkSize?: number;
  /** Custom responses based on user input patterns */
  responses?: Map<RegExp, string>;
}

const DEFAULT_RESPONSES: Array<[RegExp, string]> = [
  [
    /hello|hi|hey/i,
    `# Hello! 👋

Nice to meet you! I'm a mock AI assistant. I can help you test this chat interface.

Here's what I can do:
- Respond with **markdown** content
- Stream responses in real-time
- Handle various conversation patterns

Feel free to ask me anything!`,
  ],
  [
    /code|programming|javascript|typescript/i,
    `# Code Example

Here's a simple TypeScript function:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

// Usage
const message = greet("World");
console.log(message); // "Hello, World!"
\`\`\`

You can also use inline code like \`const x = 42;\` for shorter snippets.

## Key Features

1. **Type safety** - TypeScript catches errors at compile time
2. **Modern syntax** - Uses ES6+ features
3. **Easy to read** - Clean and expressive code`,
  ],
  [
    /list|items|bullets/i,
    `# Lists Example

## Unordered List
- First item
- Second item
  - Nested item
  - Another nested item
- Third item

## Ordered List
1. Step one
2. Step two
3. Step three

## Task List
- [x] Complete task
- [ ] Pending task
- [ ] Future task`,
  ],
  [
    /table|data/i,
    `# Data Table

Here's a comparison table:

| Feature | Basic | Pro | Enterprise |
|---------|-------|-----|------------|
| Users | 1 | 10 | Unlimited |
| Storage | 5GB | 50GB | 500GB |
| Support | Email | Priority | Dedicated |
| Price | Free | $10/mo | $99/mo |

Tables are great for organizing structured data!`,
  ],
  [
    /quote|blockquote/i,
    `# Quotes

Here's a famous quote:

> The only way to do great work is to love what you do.
> — Steve Jobs

And a multi-paragraph quote:

> This is the first paragraph of the quote.
>
> This is the second paragraph, continuing the thought.`,
  ],
  [
    /math|equation|formula/i,
    `# Mathematical Expressions

While I can't render LaTeX directly, I can show formulas:

The quadratic formula: \`x = (-b ± √(b² - 4ac)) / 2a\`

Euler's identity: \`e^(iπ) + 1 = 0\`

Common equations:
- Area of circle: \`A = πr²\`
- Pythagorean theorem: \`a² + b² = c²\`
- Derivative: \`f'(x) = lim(h→0) [f(x+h) - f(x)] / h\``,
  ],
  [
    /help|commands|what can you do/i,
    `# Help & Commands

I'm a **mock AI assistant** designed to demonstrate streaming markdown.

## Try asking about:

1. **Code** - I'll show programming examples
2. **Lists** - See bullet points and numbered lists
3. **Tables** - View structured data tables
4. **Quotes** - Display blockquotes
5. **Math** - Show mathematical formulas

## Features

- Real-time streaming responses
- Full markdown rendering
- Code syntax highlighting
- Responsive design

Just type naturally and I'll respond!`,
  ],
];

export class MockChatProvider implements ChatProvider {
  private options: Required<MockProviderOptions>;
  private responses: Map<RegExp, string>;

  constructor(options: MockProviderOptions = {}) {
    this.options = {
      chunkDelay: options.chunkDelay ?? 30,
      chunkSize: options.chunkSize ?? 5,
      responses: options.responses ?? new Map(),
    };

    // Combine custom responses with defaults
    this.responses = new Map([
      ...DEFAULT_RESPONSES,
      ...Array.from(this.options.responses.entries()),
    ]);
  }

  async *sendMessage(messages: ChatMessage[]): AsyncIterable<ChatStreamChunk> {
    const lastMessage = messages[messages.length - 1];
    const userInput = lastMessage?.content || "";

    // Find matching response
    let response = this.getDefaultResponse();
    for (const [pattern, text] of this.responses) {
      if (pattern.test(userInput)) {
        response = text;
        break;
      }
    }

    // Stream the response in chunks
    const { chunkDelay, chunkSize } = this.options;

    for (let i = 0; i < response.length; i += chunkSize) {
      const chunk = response.slice(i, i + chunkSize);

      yield {
        content: chunk,
        done: false,
      };

      // Simulate network delay
      await this.delay(chunkDelay);
    }

    // Signal completion
    yield {
      content: "",
      done: true,
    };
  }

  private getDefaultResponse(): string {
    return `# Response

I received your message. This is a **mock response** to demonstrate the streaming markdown functionality.

## What you can do

- Try saying "hello" for a greeting
- Ask about "code" for programming examples
- Request "help" to see available commands

The response is streamed character by character to simulate real AI behavior.`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Echo provider that simply echoes back what the user says
 * Useful for basic testing
 */
export class EchoChatProvider implements ChatProvider {
  private delay: number;

  constructor(delay = 20) {
    this.delay = delay;
  }

  async *sendMessage(messages: ChatMessage[]): AsyncIterable<ChatStreamChunk> {
    const lastMessage = messages[messages.length - 1];
    const response = `You said: "${lastMessage?.content || "(empty)"}"`;

    for (const char of response) {
      yield { content: char, done: false };
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    yield { content: "", done: true };
  }
}

/**
 * Programmable provider for custom test scenarios
 */
export class ProgrammableChatProvider implements ChatProvider {
  private responseQueue: string[] = [];
  private chunkDelay: number;
  private chunkSize: number;

  constructor(chunkDelay = 30, chunkSize = 5) {
    this.chunkDelay = chunkDelay;
    this.chunkSize = chunkSize;
  }

  /**
   * Queue a response to be sent
   */
  queueResponse(response: string) {
    this.responseQueue.push(response);
  }

  /**
   * Clear all queued responses
   */
  clearQueue() {
    this.responseQueue = [];
  }

  async *sendMessage(_messages: ChatMessage[]): AsyncIterable<ChatStreamChunk> {
    const response = this.responseQueue.shift() || "No response queued.";

    for (let i = 0; i < response.length; i += this.chunkSize) {
      const chunk = response.slice(i, i + this.chunkSize);
      yield { content: chunk, done: false };
      await new Promise((resolve) => setTimeout(resolve, this.chunkDelay));
    }

    yield { content: "", done: true };
  }
}
