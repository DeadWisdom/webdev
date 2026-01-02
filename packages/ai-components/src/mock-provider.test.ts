import { test, expect, describe } from "bun:test";
import {
  MockChatProvider,
  EchoChatProvider,
  ProgrammableChatProvider,
} from "./mock-provider.ts";
import type { ChatMessage } from "./types.ts";

describe("MockChatProvider", () => {
  test("should respond to hello", async () => {
    const provider = new MockChatProvider({ chunkDelay: 1, chunkSize: 100 });
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "hello" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toContain("Hello");
    expect(response).toContain("Nice to meet you");
  });

  test("should respond to code request", async () => {
    const provider = new MockChatProvider({ chunkDelay: 1, chunkSize: 100 });
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "show me some code" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toContain("```typescript");
    expect(response).toContain("function");
  });

  test("should respond to table request", async () => {
    const provider = new MockChatProvider({ chunkDelay: 1, chunkSize: 100 });
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "show me a table" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toContain("|");
    expect(response).toContain("Feature");
  });

  test("should give default response for unknown input", async () => {
    const provider = new MockChatProvider({ chunkDelay: 1, chunkSize: 100 });
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "xyzabc123" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toContain("mock response");
  });

  test("should stream chunks with proper done flag", async () => {
    const provider = new MockChatProvider({ chunkDelay: 1, chunkSize: 10 });
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "hello" },
    ];

    const chunks = [];
    for await (const chunk of provider.sendMessage(messages)) {
      chunks.push(chunk);
    }

    // All chunks except the last should have done: false
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].done).toBe(false);
    }

    // Last chunk should have done: true
    expect(chunks[chunks.length - 1].done).toBe(true);
  });

  test("should accept custom responses", async () => {
    const customResponses = new Map<RegExp, string>([
      [/custom/i, "This is a custom response!"],
    ]);

    const provider = new MockChatProvider({
      chunkDelay: 1,
      chunkSize: 100,
      responses: customResponses,
    });

    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "custom message" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toBe("This is a custom response!");
  });
});

describe("EchoChatProvider", () => {
  test("should echo user message", async () => {
    const provider = new EchoChatProvider(1);
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "test message" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toBe('You said: "test message"');
  });

  test("should handle empty message", async () => {
    const provider = new EchoChatProvider(1);
    const messages: ChatMessage[] = [];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toBe('You said: "(empty)"');
  });
});

describe("ProgrammableChatProvider", () => {
  test("should return queued responses in order", async () => {
    const provider = new ProgrammableChatProvider(1, 100);
    provider.queueResponse("First response");
    provider.queueResponse("Second response");

    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "anything" },
    ];

    let response1 = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response1 += chunk.content;
    }

    let response2 = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response2 += chunk.content;
    }

    expect(response1).toBe("First response");
    expect(response2).toBe("Second response");
  });

  test("should handle empty queue", async () => {
    const provider = new ProgrammableChatProvider(1, 100);
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "anything" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toBe("No response queued.");
  });

  test("should clear queue", async () => {
    const provider = new ProgrammableChatProvider(1, 100);
    provider.queueResponse("Will be cleared");
    provider.clearQueue();

    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "anything" },
    ];

    let response = "";
    for await (const chunk of provider.sendMessage(messages)) {
      response += chunk.content;
    }

    expect(response).toBe("No response queued.");
  });
});
