/**
 * Demo script for AI Chat component
 */

import { AIChat, MockChatProvider } from "../src/index.ts";

// Ensure the component is registered
if (!customElements.get("ai-chat")) {
  customElements.define("ai-chat", AIChat);
}

// Get DOM elements
const chat = document.getElementById("demo-chat") as AIChat;
const eventLog = document.getElementById("event-log")!;
const clearBtn = document.getElementById("clear-btn")!;
const exportBtn = document.getElementById("export-btn")!;

// Initialize the mock provider
const provider = new MockChatProvider({
  chunkDelay: 25,
  chunkSize: 4,
});

chat.provider = provider;

// Log events
function logEvent(name: string, detail?: any) {
  const time = new Date().toLocaleTimeString();
  const detailStr = detail ? ` - ${JSON.stringify(detail).slice(0, 100)}` : "";

  const event = document.createElement("div");
  event.className = "event";
  event.innerHTML = `
    <span class="event-time">[${time}]</span>
    <span class="event-name">${name}${detailStr}</span>
  `;

  eventLog.appendChild(event);
  eventLog.scrollTop = eventLog.scrollHeight;
}

// Listen to chat events
chat.addEventListener("message-sent", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  logEvent("message-sent", { content: detail.message.content.slice(0, 50) });
});

chat.addEventListener("response-start", () => {
  logEvent("response-start");
});

chat.addEventListener("response-chunk", (e: Event) => {
  // Don't log every chunk to avoid spam
});

chat.addEventListener("response-complete", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  logEvent("response-complete", {
    length: detail.message.content.length,
  });
});

chat.addEventListener("response-error", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  logEvent("response-error", { error: detail.error.message });
});

// Clear button
clearBtn.addEventListener("click", () => {
  chat.clearMessages();
  logEvent("messages-cleared");
});

// Export button
exportBtn.addEventListener("click", () => {
  const messages = chat.getMessages();
  const json = JSON.stringify(messages, null, 2);

  // Create download
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat-export.json";
  a.click();
  URL.revokeObjectURL(url);

  logEvent("messages-exported", { count: messages.length });
});

// Suggestion buttons
document.querySelectorAll(".suggestion").forEach((btn) => {
  btn.addEventListener("click", () => {
    const message = (btn as HTMLElement).dataset.message;
    if (message) {
      chat.sendMessage(message);
    }
  });
});

// Theme toggle
document.querySelectorAll('input[name="theme"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const value = (e.target as HTMLInputElement).value;
    if (value === "dark") {
      chat.classList.add("dark-theme");
    } else {
      chat.classList.remove("dark-theme");
    }
    logEvent("theme-changed", { theme: value });
  });
});

console.log("AI Chat Demo initialized");
