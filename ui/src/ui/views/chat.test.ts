/* @vitest-environment jsdom */

import { render } from "lit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupChatModuleState, renderChat, type ChatProps } from "./chat.ts";

function createProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    sessionKey: "main",
    onSessionKeyChange: () => undefined,
    thinkingLevel: null,
    showThinking: false,
    showToolCalls: true,
    loading: false,
    sending: false,
    canAbort: false,
    messages: [],
    toolMessages: [],
    streamSegments: [],
    stream: null,
    streamStartedAt: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    sessions: null,
    focusMode: false,
    onRefresh: () => undefined,
    onToggleFocusMode: () => undefined,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onQueueRemove: () => undefined,
    onNewSession: () => undefined,
    agentsList: null,
    currentAgentId: "main",
    onAgentChange: () => undefined,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    ...overrides,
  };
}

describe("chat view actions", () => {
  beforeEach(() => {
    cleanupChatModuleState();
  });

  it("injects reply tags and quote when replying to an assistant message", async () => {
    const container = document.createElement("div");
    const onSend = vi.fn();
    const state = {
      draft: "Can you elaborate?",
    };
    const props = createProps({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "The build passed.",
          timestamp: Date.now(),
        },
      ],
      getDraft: () => state.draft,
      onDraftChange: (next) => {
        state.draft = next;
        props.draft = next;
      },
      onSend: (busyModeWhenBusy) => onSend(busyModeWhenBusy),
    });
    const rerender = () => render(renderChat(props), container);
    props.onRequestUpdate = rerender;
    rerender();

    const replyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reply with quote"]',
    );
    expect(replyButton).not.toBeNull();
    replyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    const sendButton = container.querySelector<HTMLButtonElement>(".chat-send-btn");
    expect(sendButton).not.toBeNull();
    sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(onSend).toHaveBeenCalledWith("queue");
    expect(state.draft).toContain("[[reply_to:assistant-1]]");
    expect(state.draft).toContain("> The build passed.");
    expect(state.draft).toContain("Can you elaborate?");
  });

  it("starts edit mode for user messages and deletes original entry before resending", async () => {
    const container = document.createElement("div");
    const onSend = vi.fn();
    const onDeleteMessages = vi.fn().mockResolvedValue(true);
    const state = {
      draft: "",
    };
    const props = createProps({
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Initial text",
          timestamp: Date.now(),
        },
      ],
      getDraft: () => state.draft,
      onDraftChange: (next) => {
        state.draft = next;
        props.draft = next;
      },
      onSend: (busyModeWhenBusy) => onSend(busyModeWhenBusy),
      onDeleteMessages,
    });
    const rerender = () => render(renderChat(props), container);
    props.onRequestUpdate = rerender;
    rerender();

    const editButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit and resend"]',
    );
    expect(editButton).not.toBeNull();
    editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(state.draft).toBe("Initial text");

    const sendButton = container.querySelector<HTMLButtonElement>(".chat-send-btn");
    sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(onDeleteMessages).toHaveBeenCalledWith(["user-1"]);
    expect(onSend).toHaveBeenCalledWith("queue");
  });
});
