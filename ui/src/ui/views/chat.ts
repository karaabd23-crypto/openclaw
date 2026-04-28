import { html, nothing, type TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import type { CompactionStatus, FallbackStatus } from "../app-tool-stream.ts";
import {
  CHAT_ATTACHMENT_ACCEPT,
  isSupportedChatAttachmentFile,
} from "../chat/attachment-support.ts";
import { buildChatItems } from "../chat/build-chat-items.ts";
import { renderChatQueue } from "../chat/chat-queue.ts";
import { buildRawSidebarContent } from "../chat/chat-sidebar-raw.ts";
import { renderWelcomeState, resolveAssistantDisplayAvatar } from "../chat/chat-welcome.ts";
import { renderContextNotice } from "../chat/context-notice.ts";
import { exportChatMarkdown } from "../chat/export.ts";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import type { ChatInputHistoryKeyInput, ChatInputHistoryKeyResult } from "../chat/input-history.ts";
import { extractText } from "../chat/message-extract.ts";
import { PinnedMessages } from "../chat/pinned-messages.ts";
import { getPinnedMessageSummary } from "../chat/pinned-summary.ts";
import type { RealtimeTalkStatus } from "../chat/realtime-talk.ts";
import { renderChatRunControls } from "../chat/run-controls.ts";
import { getOrCreateSessionCacheValue } from "../chat/session-cache.ts";
import { renderSideResult } from "../chat/side-result-render.ts";
import type { ChatSideResult } from "../chat/side-result.ts";
import {
  CATEGORY_LABELS,
  SLASH_COMMANDS,
  getHiddenCommandCount,
  getSlashCommandCompletions,
  type SlashCommandCategory,
  type SlashCommandDef,
} from "../chat/slash-commands.ts";
import { renderCompactionIndicator, renderFallbackIndicator } from "../chat/status-indicators.ts";
import { getExpandedToolCards, syncToolCardExpansionState } from "../chat/tool-expansion-state.ts";
import type { EmbedSandboxMode } from "../embed-sandbox.ts";
import { icons } from "../icons.ts";
import type { SidebarContent } from "../sidebar-content.ts";
import { detectTextDirection } from "../text-direction.ts";
import type { SessionsListResult } from "../types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import { resolveLocalUserName } from "../user-identity.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  showToolCalls: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionStatus | null;
  fallbackStatus?: FallbackStatus | null;
  messages: unknown[];
  sideResult?: ChatSideResult | null;
  toolMessages: unknown[];
  streamSegments: Array<{ text: string; ts: number }>;
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  realtimeTalkActive?: boolean;
  realtimeTalkStatus?: RealtimeTalkStatus;
  realtimeTalkDetail?: string | null;
  realtimeTalkTranscript?: string | null;
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  focusMode: boolean;
  sidebarOpen?: boolean;
  sidebarContent?: SidebarContent | null;
  sidebarError?: string | null;
  splitRatio?: number;
  canvasHostUrl?: string | null;
  embedSandboxMode?: EmbedSandboxMode;
  allowExternalEmbedUrls?: boolean;
  assistantName: string;
  assistantAvatar: string | null;
  userName?: string | null;
  userAvatar?: string | null;
  localMediaPreviewRoots?: string[];
  assistantAttachmentAuthToken?: string | null;
  autoExpandToolCalls?: boolean;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  onRefresh: () => void;
  onDeleteMessages?: (entryIds: string[]) => void | Promise<boolean>;
  onToggleFocusMode: () => void;
  getDraft?: () => string;
  onDraftChange: (next: string) => void;
  onRequestUpdate?: () => void;
  onHistoryKeydown?: (input: ChatInputHistoryKeyInput) => ChatInputHistoryKeyResult;
  onSend: (busyModeWhenBusy?: "queue" | "steer") => void;
  onCompact?: () => void | Promise<void>;
  onToggleRealtimeTalk?: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onQueueEdit?: (id: string) => void;
  onQueuePromote?: (id: string) => void;
  onQueueSteer?: (id: string) => void;
  onDismissSideResult?: () => void;
  onNewSession: () => void;
  onClearHistory?: () => void;
  agentsList: {
    agents: Array<{ id: string; name?: string; identity?: { name?: string; avatarUrl?: string } }>;
    defaultId?: string;
  } | null;
  currentAgentId: string;
  onAgentChange: (agentId: string) => void;
  onNavigateToAgent?: () => void;
  onSessionSelect?: (sessionKey: string) => void;
  onOpenSidebar?: (content: SidebarContent) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  basePath?: string;
};

const pinnedMessagesMap = new Map<string, PinnedMessages>();

function getPinnedMessages(sessionKey: string): PinnedMessages {
  return getOrCreateSessionCacheValue(
    pinnedMessagesMap,
    sessionKey,
    () => new PinnedMessages(sessionKey),
  );
}

interface ChatEphemeralState {
  slashMenuOpen: boolean;
  slashMenuItems: SlashCommandDef[];
  slashMenuIndex: number;
  slashMenuMode: "command" | "args";
  slashMenuCommand: SlashCommandDef | null;
  slashMenuArgItems: string[];
  slashMenuExpanded: boolean;
  searchOpen: boolean;
  searchQuery: string;
  pinnedExpanded: boolean;
  busySendModeWhenBusy: "queue" | "steer";
  composerReply: { entryId: string | null; quote: string } | null;
  composerEdit: { entryId: string | null; preview: string } | null;
}

function createChatEphemeralState(): ChatEphemeralState {
  return {
    slashMenuOpen: false,
    slashMenuItems: [],
    slashMenuIndex: 0,
    slashMenuMode: "command",
    slashMenuCommand: null,
    slashMenuArgItems: [],
    slashMenuExpanded: false,
    searchOpen: false,
    searchQuery: "",
    pinnedExpanded: false,
    busySendModeWhenBusy: "queue",
    composerReply: null,
    composerEdit: null,
  };
}

const vs = createChatEphemeralState();

/**
 * Reset chat view ephemeral state when navigating away.
 * Clears search/slash UI that should not survive navigation.
 */
export function resetChatViewState() {
  Object.assign(vs, createChatEphemeralState());
}

export const cleanupChatModuleState = resetChatViewState;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
}

function restoreHistoryCaret(target: HTMLTextAreaElement, direction: "up" | "down") {
  requestAnimationFrame(() => {
    if (document.activeElement !== target) {
      return;
    }
    adjustTextareaHeight(target);
    const caret = direction === "up" ? 0 : target.value.length;
    target.selectionStart = caret;
    target.selectionEnd = caret;
  });
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function chatAttachmentFromFile(file: File, dataUrl: string): ChatAttachment {
  return {
    id: generateAttachmentId(),
    dataUrl,
    mimeType: file.type || "application/octet-stream",
    fileName: file.name || undefined,
  };
}

function isImageAttachment(att: ChatAttachment): boolean {
  return att.mimeType.startsWith("image/");
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }
  const fileItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file") {
      fileItems.push(item);
    }
  }
  if (fileItems.length === 0) {
    return;
  }
  e.preventDefault();
  for (const item of fileItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment = chatAttachmentFromFile(file, dataUrl);
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function handleFileSelect(e: Event, props: ChatProps) {
  const input = e.target as HTMLInputElement;
  if (!input.files || !props.onAttachmentsChange) {
    return;
  }
  const current = props.attachments ?? [];
  const additions: ChatAttachment[] = [];
  let pending = 0;
  for (const file of input.files) {
    if (!isSupportedChatAttachmentFile(file)) {
      continue;
    }
    pending++;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      additions.push(chatAttachmentFromFile(file, reader.result as string));
      pending--;
      if (pending === 0) {
        props.onAttachmentsChange?.([...current, ...additions]);
      }
    });
    reader.readAsDataURL(file);
  }
  input.value = "";
}

function handleDrop(e: DragEvent, props: ChatProps) {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (!files || !props.onAttachmentsChange) {
    return;
  }
  const current = props.attachments ?? [];
  const additions: ChatAttachment[] = [];
  let pending = 0;
  for (const file of files) {
    if (!isSupportedChatAttachmentFile(file)) {
      continue;
    }
    pending++;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      additions.push(chatAttachmentFromFile(file, reader.result as string));
      pending--;
      if (pending === 0) {
        props.onAttachmentsChange?.([...current, ...additions]);
      }
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps): TemplateResult | typeof nothing {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }
  return html`
    <div class="chat-attachments-preview">
      ${attachments.map(
        (att) => html`
          <div
            class=${[
              "chat-attachment-thumb",
              isImageAttachment(att) ? "" : "chat-attachment-thumb--file",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            ${isImageAttachment(att)
              ? html`<img src=${att.dataUrl} alt="Attachment preview" />`
              : html`
                  <div class="chat-attachment-file" title=${att.fileName ?? "Attached file"}>
                    <span class="chat-attachment-file__icon">${icons.paperclip}</span>
                    <span class="chat-attachment-file__name"
                      >${att.fileName ?? "Attached file"}</span
                    >
                  </div>
                `}
            <button
              class="chat-attachment-remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              &times;
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

function formatQueuedAttachmentText(attachments?: ChatAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return "";
  }
  if (attachments.length === 1) {
    return attachments[0]?.fileName?.trim() || "Attachment";
  }
  const first = attachments[0]?.fileName?.trim() || "Attachment";
  const extra = attachments.length - 1;
  return `${first} +${extra} more file${extra === 1 ? "" : "s"}`;
}

function trimQuoteForComposer(text: string, maxChars = 200): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Message";
  }
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars).trimEnd()}...`
    : normalized;
}

function parseDataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl);
  return match?.[1]?.trim() || null;
}

function defaultAttachmentFileName(mimeType: string, index: number): string {
  const normalized = mimeType.trim().toLowerCase();
  const extByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
    "text/plain": "txt",
  };
  const ext = extByMime[normalized];
  return ext ? `attachment-${index}.${ext}` : `attachment-${index}`;
}

function extractEditableAttachmentsFromMessage(message: unknown): ChatAttachment[] {
  if (!message || typeof message !== "object") {
    return [];
  }
  const record = message as Record<string, unknown>;
  if (!Array.isArray(record.content)) {
    return [];
  }

  const attachments: ChatAttachment[] = [];
  const seenDataUrls = new Set<string>();

  const addAttachment = (params: { dataUrl: string; mimeType: string; fileName: string }) => {
    const normalizedDataUrl = params.dataUrl.trim();
    if (!normalizedDataUrl || seenDataUrls.has(normalizedDataUrl)) {
      return;
    }
    seenDataUrls.add(normalizedDataUrl);
    attachments.push({
      id: generateAttachmentId(),
      dataUrl: normalizedDataUrl,
      mimeType: params.mimeType,
      fileName: params.fileName,
    });
  };

  for (const [index, item] of record.content.entries()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const block = item as Record<string, unknown>;
    if (block.type === "image" && block.source && typeof block.source === "object") {
      const source = block.source as Record<string, unknown>;
      if (source.type !== "base64" || typeof source.data !== "string") {
        continue;
      }
      const mimeType =
        typeof source.media_type === "string" && source.media_type.trim()
          ? source.media_type
          : "image/png";
      const dataUrl = source.data.startsWith("data:")
        ? source.data
        : `data:${mimeType};base64,${source.data}`;
      addAttachment({
        dataUrl,
        mimeType,
        fileName: defaultAttachmentFileName(mimeType, index + 1),
      });
      continue;
    }
    if (block.type === "attachment" && block.attachment && typeof block.attachment === "object") {
      const attachment = block.attachment as Record<string, unknown>;
      if (typeof attachment.url !== "string" || !attachment.url.startsWith("data:")) {
        continue;
      }
      const mimeType =
        typeof attachment.mimeType === "string" && attachment.mimeType.trim()
          ? attachment.mimeType
          : (parseDataUrlMimeType(attachment.url) ?? "application/octet-stream");
      const fileName =
        typeof attachment.label === "string" && attachment.label.trim()
          ? attachment.label
          : defaultAttachmentFileName(mimeType, index + 1);
      addAttachment({
        dataUrl: attachment.url,
        mimeType,
        fileName,
      });
    }
  }

  return attachments;
}

function buildReplyPrefixedDraft(params: {
  draft: string;
  entryId: string | null;
  quote: string;
}): string {
  const replyTag = params.entryId ? `[[reply_to:${params.entryId}]]` : "[[reply_to_current]]";
  const quoteLine = `> ${trimQuoteForComposer(params.quote)}`;
  const body = params.draft.trim();
  return body ? `${replyTag}\n${quoteLine}\n\n${body}` : `${replyTag}\n${quoteLine}`;
}

function renderComposerIntentBanner(requestUpdate: () => void): TemplateResult | typeof nothing {
  const reply = vs.composerReply;
  const edit = vs.composerEdit;
  if (!reply && !edit) {
    return nothing;
  }
  return html`
    <div class="chat-compose-intent">
      ${reply
        ? html`
            <span class="chat-compose-intent__pill chat-compose-intent__pill--reply">
              ${icons.messageSquare} Replying: "${trimQuoteForComposer(reply.quote, 120)}"
            </span>
          `
        : nothing}
      ${edit
        ? html`
            <span class="chat-compose-intent__pill chat-compose-intent__pill--edit">
              ${icons.edit} Editing: "${trimQuoteForComposer(edit.preview, 120)}"
            </span>
          `
        : nothing}
      <button
        class="btn btn--ghost chat-compose-intent__clear"
        type="button"
        @click=${() => {
          vs.composerReply = null;
          vs.composerEdit = null;
          requestUpdate();
        }}
      >
        Clear
      </button>
    </div>
  `;
}

function resetSlashMenuState(): void {
  vs.slashMenuMode = "command";
  vs.slashMenuCommand = null;
  vs.slashMenuArgItems = [];
  vs.slashMenuItems = [];
  vs.slashMenuExpanded = false;
}

function updateSlashMenu(value: string, requestUpdate: () => void): void {
  // Arg mode: /command <partial-arg>
  const argMatch = value.match(/^\/(\S+)\s(.*)$/);
  if (argMatch) {
    const cmdName = argMatch[1].toLowerCase();
    const argFilter = argMatch[2].toLowerCase();
    const cmd = SLASH_COMMANDS.find((c) => c.name === cmdName);
    if (cmd?.argOptions?.length) {
      const filtered = argFilter
        ? cmd.argOptions.filter((opt) => opt.toLowerCase().startsWith(argFilter))
        : cmd.argOptions;
      if (filtered.length > 0) {
        vs.slashMenuMode = "args";
        vs.slashMenuCommand = cmd;
        vs.slashMenuArgItems = filtered;
        vs.slashMenuOpen = true;
        vs.slashMenuIndex = 0;
        vs.slashMenuItems = [];
        requestUpdate();
        return;
      }
    }
    vs.slashMenuOpen = false;
    resetSlashMenuState();
    requestUpdate();
    return;
  }

  // Command mode: /partial-command
  const match = value.match(/^\/(\S*)$/);
  if (match) {
    const items = getSlashCommandCompletions(match[1], { showAll: vs.slashMenuExpanded });
    vs.slashMenuItems = items;
    vs.slashMenuOpen = items.length > 0;
    vs.slashMenuIndex = 0;
    vs.slashMenuMode = "command";
    vs.slashMenuCommand = null;
    vs.slashMenuArgItems = [];
  } else {
    vs.slashMenuOpen = false;
    resetSlashMenuState();
  }
  requestUpdate();
}

function selectSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  // Transition to arg picker when the command has fixed options
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    vs.slashMenuMode = "args";
    vs.slashMenuCommand = cmd;
    vs.slashMenuArgItems = cmd.argOptions;
    vs.slashMenuOpen = true;
    vs.slashMenuIndex = 0;
    vs.slashMenuItems = [];
    requestUpdate();
    return;
  }

  vs.slashMenuOpen = false;
  resetSlashMenuState();

  if (cmd.executeLocal && !cmd.args) {
    props.onDraftChange(`/${cmd.name}`);
    requestUpdate();
    props.onSend();
  } else {
    props.onDraftChange(`/${cmd.name} `);
    requestUpdate();
  }
}

function tabCompleteSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  // Tab: fill in the command text without executing
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    vs.slashMenuMode = "args";
    vs.slashMenuCommand = cmd;
    vs.slashMenuArgItems = cmd.argOptions;
    vs.slashMenuOpen = true;
    vs.slashMenuIndex = 0;
    vs.slashMenuItems = [];
    requestUpdate();
    return;
  }

  vs.slashMenuOpen = false;
  resetSlashMenuState();
  props.onDraftChange(cmd.args ? `/${cmd.name} ` : `/${cmd.name}`);
  requestUpdate();
}

function selectSlashArg(
  arg: string,
  props: ChatProps,
  requestUpdate: () => void,
  execute: boolean,
): void {
  const cmdName = vs.slashMenuCommand?.name ?? "";
  vs.slashMenuOpen = false;
  resetSlashMenuState();
  props.onDraftChange(`/${cmdName} ${arg}`);
  requestUpdate();
  if (execute) {
    props.onSend();
  }
}

function tokenEstimate(draft: string): string | null {
  if (draft.length < 100) {
    return null;
  }
  return `~${Math.ceil(draft.length / 4)} tokens`;
}

/**
 * Export chat markdown - delegates to shared utility.
 */
function exportMarkdown(props: ChatProps): void {
  exportChatMarkdown(props.messages, props.assistantName);
}

function resolveTranscriptEntryId(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const record = message as Record<string, unknown>;
  if (typeof record.id === "string" && record.id.trim()) {
    return record.id;
  }
  const marker = record.__openclaw;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    return null;
  }
  const entryId = (marker as Record<string, unknown>).id;
  return typeof entryId === "string" && entryId.trim() ? entryId : null;
}

function collectTranscriptEntryIds(messages: Array<{ message: unknown }>): string[] {
  return Array.from(
    new Set(
      messages
        .map((item) => resolveTranscriptEntryId(item.message))
        .filter((entryId): entryId is string => Boolean(entryId)),
    ),
  );
}

function renderSearchBar(requestUpdate: () => void): TemplateResult | typeof nothing {
  if (!vs.searchOpen) {
    return nothing;
  }
  return html`
    <div class="agent-chat__search-bar">
      ${icons.search}
      <input
        type="text"
        placeholder="Search messages..."
        aria-label="Search messages"
        .value=${vs.searchQuery}
        @input=${(e: Event) => {
          vs.searchQuery = (e.target as HTMLInputElement).value;
          requestUpdate();
        }}
      />
      <button
        class="btn btn--ghost"
        aria-label="Close search"
        @click=${() => {
          vs.searchOpen = false;
          vs.searchQuery = "";
          requestUpdate();
        }}
      >
        ${icons.x}
      </button>
    </div>
  `;
}

function renderPinnedSection(
  props: ChatProps,
  pinned: PinnedMessages,
  requestUpdate: () => void,
): TemplateResult | typeof nothing {
  const userRoleLabel = resolveLocalUserName({
    name: props.userName ?? null,
    avatar: props.userAvatar ?? null,
  });
  const messages = Array.isArray(props.messages) ? props.messages : [];
  const entries: Array<{ index: number; text: string; role: string }> = [];
  for (const idx of pinned.indices) {
    const msg = messages[idx] as Record<string, unknown> | undefined;
    if (!msg) {
      continue;
    }
    const text = getPinnedMessageSummary(msg);
    const role = typeof msg.role === "string" ? msg.role : "unknown";
    entries.push({ index: idx, text, role });
  }
  if (entries.length === 0) {
    return nothing;
  }
  return html`
    <div class="agent-chat__pinned">
      <button
        class="agent-chat__pinned-toggle"
        aria-expanded=${vs.pinnedExpanded}
        @click=${() => {
          vs.pinnedExpanded = !vs.pinnedExpanded;
          requestUpdate();
        }}
      >
        ${icons.bookmark} ${entries.length} pinned
        <span class="collapse-chevron ${vs.pinnedExpanded ? "" : "collapse-chevron--collapsed"}"
          >${icons.chevronDown}</span
        >
      </button>
      ${vs.pinnedExpanded
        ? html`
            <div class="agent-chat__pinned-list">
              ${entries.map(
                ({ index, text, role }) => html`
                  <div class="agent-chat__pinned-item">
                    <span class="agent-chat__pinned-role"
                      >${role === "user" ? userRoleLabel : "Assistant"}</span
                    >
                    <span class="agent-chat__pinned-text"
                      >${text.slice(0, 100)}${text.length > 100 ? "..." : ""}</span
                    >
                    <button
                      class="btn btn--ghost"
                      @click=${() => {
                        pinned.unpin(index);
                        requestUpdate();
                      }}
                      title="Unpin"
                    >
                      ${icons.x}
                    </button>
                  </div>
                `,
              )}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderSlashMenu(
  requestUpdate: () => void,
  props: ChatProps,
): TemplateResult | typeof nothing {
  if (!vs.slashMenuOpen) {
    return nothing;
  }

  // Arg-picker mode: show options for the selected command
  if (vs.slashMenuMode === "args" && vs.slashMenuCommand && vs.slashMenuArgItems.length > 0) {
    return html`
      <div class="slash-menu" role="listbox" aria-label="Command arguments">
        <div class="slash-menu-group">
          <div class="slash-menu-group__label">
            /${vs.slashMenuCommand.name} ${vs.slashMenuCommand.description}
          </div>
          ${vs.slashMenuArgItems.map(
            (arg, i) => html`
              <div
                class="slash-menu-item ${i === vs.slashMenuIndex ? "slash-menu-item--active" : ""}"
                role="option"
                aria-selected=${i === vs.slashMenuIndex}
                @click=${() => selectSlashArg(arg, props, requestUpdate, true)}
                @mouseenter=${() => {
                  vs.slashMenuIndex = i;
                  requestUpdate();
                }}
              >
                ${vs.slashMenuCommand?.icon
                  ? html`<span class="slash-menu-icon">${icons[vs.slashMenuCommand.icon]}</span>`
                  : nothing}
                <span class="slash-menu-name">${arg}</span>
                <span class="slash-menu-desc">/${vs.slashMenuCommand?.name} ${arg}</span>
              </div>
            `,
          )}
        </div>
        <div class="slash-menu-footer">
          <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> fill <kbd>Enter</kbd> run <kbd>Esc</kbd> close
        </div>
      </div>
    `;
  }

  // Command mode: show grouped commands
  if (vs.slashMenuItems.length === 0) {
    return nothing;
  }

  const grouped = new Map<
    SlashCommandCategory,
    Array<{ cmd: SlashCommandDef; globalIdx: number }>
  >();
  for (let i = 0; i < vs.slashMenuItems.length; i++) {
    const cmd = vs.slashMenuItems[i];
    const cat = cmd.category ?? "session";
    let list = grouped.get(cat);
    if (!list) {
      list = [];
      grouped.set(cat, list);
    }
    list.push({ cmd, globalIdx: i });
  }

  const sections: TemplateResult[] = [];
  for (const [cat, entries] of grouped) {
    sections.push(html`
      <div class="slash-menu-group">
        <div class="slash-menu-group__label">${CATEGORY_LABELS[cat]}</div>
        ${entries.map(
          ({ cmd, globalIdx }) => html`
            <div
              class="slash-menu-item ${globalIdx === vs.slashMenuIndex
                ? "slash-menu-item--active"
                : ""}"
              role="option"
              aria-selected=${globalIdx === vs.slashMenuIndex}
              @click=${() => selectSlashCommand(cmd, props, requestUpdate)}
              @mouseenter=${() => {
                vs.slashMenuIndex = globalIdx;
                requestUpdate();
              }}
            >
              ${cmd.icon ? html`<span class="slash-menu-icon">${icons[cmd.icon]}</span>` : nothing}
              <span class="slash-menu-name">/${cmd.name}</span>
              ${cmd.args ? html`<span class="slash-menu-args">${cmd.args}</span>` : nothing}
              <span class="slash-menu-desc">${cmd.description}</span>
              ${cmd.argOptions?.length
                ? html`<span class="slash-menu-badge">${cmd.argOptions.length} options</span>`
                : cmd.executeLocal && !cmd.args
                  ? html` <span class="slash-menu-badge">instant</span> `
                  : nothing}
            </div>
          `,
        )}
      </div>
    `);
  }

  const hiddenCount = vs.slashMenuExpanded ? 0 : getHiddenCommandCount();

  return html`
    <div class="slash-menu" role="listbox" aria-label="Slash commands">
      ${sections}
      ${hiddenCount > 0
        ? html`<button
            class="slash-menu-show-more"
            @click=${(e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              vs.slashMenuExpanded = true;
              updateSlashMenu(props.draft, requestUpdate);
            }}
          >
            Show ${hiddenCount} more command${hiddenCount !== 1 ? "s" : ""}
          </button>`
        : nothing}
      <div class="slash-menu-footer">
        <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> fill <kbd>Enter</kbd> select <kbd>Esc</kbd> close
      </div>
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const compactBusy =
    props.compactionStatus?.phase === "active" || props.compactionStatus?.phase === "retrying";
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: resolveAssistantDisplayAvatar(props),
  };
  const pinned = getPinnedMessages(props.sessionKey);
  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const tokens = tokenEstimate(props.draft);

  const placeholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more files..."
      : `Message ${props.assistantName || "agent"} (Enter to send · Ctrl+Enter to steer)`
    : "Connect to the gateway to start chatting...";

  const requestUpdate = props.onRequestUpdate ?? (() => {});
  const getDraft = props.getDraft ?? (() => props.draft);

  const sendFromComposer = async (modeOverride?: "queue" | "steer") => {
    if (!props.connected) {
      return;
    }

    const currentDraft = getDraft();
    const draftStartsWithSlash = currentDraft.trim().startsWith("/");
    const shouldInjectReply = Boolean(vs.composerReply && !draftStartsWithSlash);
    const outgoingMessage =
      shouldInjectReply && vs.composerReply
        ? buildReplyPrefixedDraft({
            draft: currentDraft,
            entryId: vs.composerReply.entryId,
            quote: vs.composerReply.quote,
          })
        : currentDraft;
    const hasOutgoingText = outgoingMessage.trim().length > 0;
    const hasComposerAttachments = (props.attachments?.length ?? 0) > 0;
    if (!hasOutgoingText && !hasComposerAttachments) {
      return;
    }

    if (vs.composerEdit?.entryId && props.onDeleteMessages) {
      const editDeleted = await props.onDeleteMessages([vs.composerEdit.entryId]);
      if (!editDeleted) {
        return;
      }
    }

    if (shouldInjectReply && outgoingMessage !== currentDraft) {
      props.onDraftChange(outgoingMessage);
    }

    props.onSend(modeOverride ?? vs.busySendModeWhenBusy);
    vs.composerReply = null;
    vs.composerEdit = null;
    requestUpdate();
  };

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);

  const handleCodeBlockCopy = (e: Event) => {
    const btn = (e.target as HTMLElement).closest(".code-block-copy");
    if (!btn) {
      return;
    }
    const code = (btn as HTMLElement).dataset.code ?? "";
    navigator.clipboard.writeText(code).then(
      () => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1500);
      },
      () => {},
    );
  };

  const chatItems = buildChatItems({
    sessionKey: props.sessionKey,
    messages: props.messages,
    toolMessages: props.toolMessages,
    streamSegments: props.streamSegments,
    stream: props.stream,
    streamStartedAt: props.streamStartedAt,
    showToolCalls: props.showToolCalls,
    searchOpen: vs.searchOpen,
    searchQuery: vs.searchQuery,
  });
  syncToolCardExpansionState(props.sessionKey, chatItems, Boolean(props.autoExpandToolCalls));
  const expandedToolCards = getExpandedToolCards(props.sessionKey);
  const toggleToolCardExpanded = (toolCardId: string) => {
    expandedToolCards.set(toolCardId, !expandedToolCards.get(toolCardId));
    requestUpdate();
  };
  const isEmpty = chatItems.length === 0 && !props.loading;
  const showLoadingSkeleton = props.loading && chatItems.length === 0;

  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
      @click=${handleCodeBlockCopy}
    >
      <div class="chat-thread-inner">
        ${showLoadingSkeleton
          ? html`
              <div class="chat-loading-skeleton" aria-label="Loading chat">
                <div class="chat-line assistant">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div
                        class="skeleton skeleton-line skeleton-line--long"
                        style="margin-bottom: 8px"
                      ></div>
                      <div
                        class="skeleton skeleton-line skeleton-line--medium"
                        style="margin-bottom: 8px"
                      ></div>
                      <div class="skeleton skeleton-line skeleton-line--short"></div>
                    </div>
                  </div>
                </div>
                <div class="chat-line user" style="margin-top: 12px">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div class="skeleton skeleton-line skeleton-line--medium"></div>
                    </div>
                  </div>
                </div>
                <div class="chat-line assistant" style="margin-top: 12px">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div
                        class="skeleton skeleton-line skeleton-line--long"
                        style="margin-bottom: 8px"
                      ></div>
                      <div class="skeleton skeleton-line skeleton-line--short"></div>
                    </div>
                  </div>
                </div>
              </div>
            `
          : nothing}
        ${isEmpty && !vs.searchOpen ? renderWelcomeState(props) : nothing}
        ${isEmpty && vs.searchOpen
          ? html` <div class="agent-chat__empty">No matching messages</div> `
          : nothing}
        ${repeat(
          chatItems,
          (item) => item.key,
          (item) => {
            if (item.kind === "divider") {
              return html`
                <div class="chat-divider" role="separator" data-ts=${String(item.timestamp)}>
                  <span class="chat-divider__line"></span>
                  <span class="chat-divider__label">${item.label}</span>
                  <span class="chat-divider__line"></span>
                </div>
              `;
            }
            if (item.kind === "reading-indicator") {
              return renderReadingIndicatorGroup(
                assistantIdentity,
                props.basePath,
                props.assistantAttachmentAuthToken ?? null,
              );
            }
            if (item.kind === "stream") {
              return renderStreamingGroup(
                item.text,
                item.startedAt,
                props.onOpenSidebar,
                assistantIdentity,
                props.basePath,
                props.assistantAttachmentAuthToken ?? null,
              );
            }
            if (item.kind === "group") {
              const entryIds = collectTranscriptEntryIds(item.messages);
              const latestMessage = item.messages[item.messages.length - 1]?.message;
              const latestEntryId = resolveTranscriptEntryId(latestMessage);
              const latestMessageText = (extractText(latestMessage) ?? "").trim();
              const latestMessageAttachments = extractEditableAttachmentsFromMessage(latestMessage);
              const normalizedRole = item.role.trim().toLowerCase();
              const canReplyToGroup = normalizedRole === "assistant";
              const canEditGroup =
                normalizedRole === "user" &&
                Boolean(
                  latestEntryId ||
                  latestMessageText.length > 0 ||
                  latestMessageAttachments.length > 0,
                );
              const replyQuote =
                latestMessageText ||
                formatQueuedAttachmentText(latestMessageAttachments) ||
                "Message";

              return renderMessageGroup(item, {
                onOpenSidebar: props.onOpenSidebar,
                showReasoning,
                showToolCalls: props.showToolCalls,
                autoExpandToolCalls: Boolean(props.autoExpandToolCalls),
                isToolMessageExpanded: (messageId: string) =>
                  expandedToolCards.get(messageId) ?? false,
                onToggleToolMessageExpanded: (messageId: string) => {
                  expandedToolCards.set(messageId, !expandedToolCards.get(messageId));
                  requestUpdate();
                },
                isToolExpanded: (toolCardId: string) => expandedToolCards.get(toolCardId) ?? false,
                onToggleToolExpanded: toggleToolCardExpanded,
                onRequestUpdate: requestUpdate,
                assistantName: props.assistantName,
                assistantAvatar: assistantIdentity.avatar,
                userName: props.userName ?? null,
                userAvatar: props.userAvatar ?? null,
                basePath: props.basePath,
                localMediaPreviewRoots: props.localMediaPreviewRoots ?? [],
                assistantAttachmentAuthToken: props.assistantAttachmentAuthToken ?? null,
                canvasHostUrl: props.canvasHostUrl,
                embedSandboxMode: props.embedSandboxMode ?? "scripts",
                allowExternalEmbedUrls: props.allowExternalEmbedUrls ?? false,
                contextWindow:
                  activeSession?.contextTokens ?? props.sessions?.defaults?.contextTokens ?? null,
                onReply: canReplyToGroup
                  ? () => {
                      vs.composerReply = {
                        entryId: latestEntryId,
                        quote: replyQuote,
                      };
                      vs.composerEdit = null;
                      requestUpdate();
                    }
                  : undefined,
                onEdit: canEditGroup
                  ? () => {
                      props.onDraftChange(latestMessageText);
                      props.onAttachmentsChange?.(latestMessageAttachments);
                      vs.composerEdit = {
                        entryId: latestEntryId,
                        preview:
                          latestMessageText ||
                          formatQueuedAttachmentText(latestMessageAttachments) ||
                          "Message",
                      };
                      vs.composerReply = null;
                      requestUpdate();
                    }
                  : undefined,
                deleteCount: entryIds.length,
                onDelete:
                  entryIds.length > 0
                    ? () => {
                        void props.onDeleteMessages?.(entryIds);
                      }
                    : undefined,
              });
            }
            return nothing;
          },
        )}
      </div>
    </div>
  `;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Slash menu navigation — arg mode
    if (vs.slashMenuOpen && vs.slashMenuMode === "args" && vs.slashMenuArgItems.length > 0) {
      const len = vs.slashMenuArgItems.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex + 1) % len;
          requestUpdate();
          return;
        case "ArrowUp":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex - 1 + len) % len;
          requestUpdate();
          return;
        case "Tab":
          e.preventDefault();
          selectSlashArg(vs.slashMenuArgItems[vs.slashMenuIndex], props, requestUpdate, false);
          return;
        case "Enter":
          e.preventDefault();
          selectSlashArg(vs.slashMenuArgItems[vs.slashMenuIndex], props, requestUpdate, true);
          return;
        case "Escape":
          e.preventDefault();
          vs.slashMenuOpen = false;
          resetSlashMenuState();
          requestUpdate();
          return;
      }
    }

    // Slash menu navigation — command mode
    if (vs.slashMenuOpen && vs.slashMenuItems.length > 0) {
      const len = vs.slashMenuItems.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex + 1) % len;
          requestUpdate();
          return;
        case "ArrowUp":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex - 1 + len) % len;
          requestUpdate();
          return;
        case "Tab":
          e.preventDefault();
          tabCompleteSlashCommand(vs.slashMenuItems[vs.slashMenuIndex], props, requestUpdate);
          return;
        case "Enter":
          e.preventDefault();
          selectSlashCommand(vs.slashMenuItems[vs.slashMenuIndex], props, requestUpdate);
          return;
        case "Escape":
          e.preventDefault();
          vs.slashMenuOpen = false;
          resetSlashMenuState();
          requestUpdate();
          return;
      }
    }

    if (e.key === "Escape" && props.sideResult && !vs.searchOpen) {
      e.preventDefault();
      props.onDismissSideResult?.();
      return;
    }

    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && props.onHistoryKeydown) {
      const target = e.target as HTMLTextAreaElement;
      const result = props.onHistoryKeydown({
        key: e.key,
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
        valueLength: target.value.length,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        isComposing: e.isComposing,
        keyCode: e.keyCode,
      });
      if (result.handled) {
        if (result.preventDefault) {
          e.preventDefault();
        }
        if (result.restoreCaret) {
          restoreHistoryCaret(target, result.restoreCaret);
        }
        return;
      }
    }

    // Cmd+F for search
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "f") {
      e.preventDefault();
      vs.searchOpen = !vs.searchOpen;
      if (!vs.searchOpen) {
        vs.searchQuery = "";
      }
      requestUpdate();
      return;
    }

    // Ctrl+Enter → steer (inject into running agent)
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (e.isComposing || e.keyCode === 229) {
        return;
      }
      if (!props.connected) {
        return;
      }
      e.preventDefault();
      if (canCompose) {
        void sendFromComposer("steer");
      }
      return;
    }

    // Enter → queue (default: never steer via plain Enter)
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.isComposing || e.keyCode === 229) {
        return;
      }
      if (!props.connected) {
        return;
      }
      e.preventDefault();
      if (canCompose) {
        void sendFromComposer("queue");
      }
    }
  };

  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    adjustTextareaHeight(target);
    updateSlashMenu(target.value, requestUpdate);
    props.onDraftChange(target.value);
  };

  return html`
    <section
      class="card chat"
      @drop=${(e: DragEvent) => handleDrop(e, props)}
      @dragover=${(e: DragEvent) => e.preventDefault()}
    >
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
      ${props.focusMode
        ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
        : nothing}
      ${renderSearchBar(requestUpdate)} ${renderPinnedSection(props, pinned, requestUpdate)}

      <div class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}">
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${sidebarOpen
          ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  canvasHostUrl: props.canvasHostUrl,
                  embedSandboxMode: props.embedSandboxMode ?? "scripts",
                  allowExternalEmbedUrls: props.allowExternalEmbedUrls ?? false,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.onOpenSidebar) {
                      return;
                    }
                    const rawContent = buildRawSidebarContent(props.sidebarContent);
                    if (rawContent) {
                      props.onOpenSidebar(rawContent);
                    }
                  },
                })}
              </div>
            `
          : nothing}
      </div>

      ${props.queue.length
        ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">Queued (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div
                      class="chat-queue__item ${item.sendAsSteer ? "chat-queue__item--steer" : ""}"
                    >
                      <div class="chat-queue__text">
                        ${item.text || formatQueuedAttachmentText(item.attachments)}
                        ${item.sendAsSteer
                          ? html`<span class="chat-queue__steer-badge">steer</span>`
                          : nothing}
                      </div>
                      <div class="chat-queue__actions">
                        ${props.onQueueSteer
                          ? html`
                              <button
                                class="btn btn--xs chat-queue__steer ${item.sendAsSteer
                                  ? "chat-queue__steer--active"
                                  : ""}"
                                type="button"
                                title="${item.sendAsSteer
                                  ? "Undo steer (send as queue)"
                                  : "Mark as steer (inject when run ends)"}"
                                aria-label="${item.sendAsSteer ? "Undo steer" : "Mark as steer"}"
                                aria-pressed="${item.sendAsSteer}"
                                @click=${() => props.onQueueSteer!(item.id)}
                              >
                                ${icons.zap}
                              </button>
                            `
                          : nothing}
                        ${props.onQueuePromote
                          ? html`
                              <button
                                class="btn btn--xs chat-queue__promote"
                                type="button"
                                title="Send now as steer (skip queue)"
                                aria-label="Promote to steer"
                                @click=${() => props.onQueuePromote!(item.id)}
                              >
                                ${icons.send}
                              </button>
                            `
                          : nothing}
                        ${props.onQueueEdit
                          ? html`
                              <button
                                class="btn btn--xs chat-queue__edit"
                                type="button"
                                title="Edit message"
                                aria-label="Edit queued message"
                                @click=${() => props.onQueueEdit!(item.id)}
                              >
                                ${icons.edit}
                              </button>
                            `
                          : nothing}
                        <button
                          class="btn btn--xs chat-queue__remove"
                          type="button"
                          title="Cancel"
                          aria-label="Remove queued message"
                          @click=${() => props.onQueueRemove(item.id)}
                        >
                          ${icons.x}
                        </button>
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
      ${renderSideResult(props.sideResult, props.onDismissSideResult)}
      ${renderFallbackIndicator(props.fallbackStatus)}
      ${renderCompactionIndicator(props.compactionStatus)}
      ${renderContextNotice(activeSession, props.sessions?.defaults?.contextTokens ?? null, {
        compactBusy,
        compactDisabled: !props.connected || isBusy || Boolean(props.canAbort),
        onCompact: props.onCompact,
      })}
      ${props.showNewMessages
        ? html`
            <button class="chat-new-messages" type="button" @click=${props.onScrollToBottom}>
              ${icons.arrowDown} New messages
            </button>
          `
        : nothing}

      <!-- Input bar -->
      <div class="agent-chat__input">
        ${renderSlashMenu(requestUpdate, props)} ${renderComposerIntentBanner(requestUpdate)}
        ${renderAttachmentPreview(props)}

        <input
          type="file"
          accept=${CHAT_ATTACHMENT_ACCEPT}
          multiple
          class="agent-chat__file-input"
          @change=${(e: Event) => handleFileSelect(e, props)}
        />

        ${props.realtimeTalkActive || props.realtimeTalkDetail || props.realtimeTalkTranscript
          ? html`
              <div class="agent-chat__stt-interim agent-chat__talk-status">
                ${props.realtimeTalkDetail ??
                props.realtimeTalkTranscript ??
                (props.realtimeTalkStatus === "thinking"
                  ? "Asking OpenClaw..."
                  : props.realtimeTalkStatus === "connecting"
                    ? "Connecting Talk..."
                    : "Talk live")}
              </div>
            `
          : nothing}

        <textarea
          ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
          .value=${props.draft}
          dir=${detectTextDirection(props.draft)}
          ?disabled=${!props.connected}
          @keydown=${handleKeyDown}
          @input=${handleInput}
          @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
          placeholder=${placeholder}
          rows="1"
        ></textarea>

        <div class="agent-chat__toolbar">
          <div class="agent-chat__toolbar-left">
            <button
              class="agent-chat__input-btn"
              @click=${() => {
                document.querySelector<HTMLInputElement>(".agent-chat__file-input")?.click();
              }}
              title="Attach file"
              aria-label="Attach file"
              ?disabled=${!props.connected}
            >
              ${icons.paperclip}
            </button>

            ${props.onToggleRealtimeTalk
              ? html`
                  <button
                    class="agent-chat__input-btn ${props.realtimeTalkActive
                      ? "agent-chat__input-btn--talk"
                      : ""}"
                    @click=${props.onToggleRealtimeTalk}
                    title=${props.realtimeTalkActive ? "Stop Talk" : "Start Talk"}
                    aria-label=${props.realtimeTalkActive ? "Stop Talk" : "Start Talk"}
                    ?disabled=${!props.connected}
                  >
                    ${props.realtimeTalkActive ? icons.volume2 : icons.radio}
                  </button>
                `
              : nothing}
            ${tokens ? html`<span class="agent-chat__token-count">${tokens}</span>` : nothing}
          </div>

          ${renderChatRunControls({
            canAbort,
            connected: props.connected,
            draft: props.draft,
            hasMessages: props.messages.length > 0,
            isBusy,
            busyModeWhenBusy: vs.busySendModeWhenBusy,
            sending: props.sending,
            onAbort: props.onAbort,
            onBusyModeChange: (mode) => {
              vs.busySendModeWhenBusy = mode;
              requestUpdate();
            },
            onExport: () => exportMarkdown(props),
            onNewSession: props.onNewSession,
            onSend: () => {
              void sendFromComposer("queue");
            },
            onSendSteer: () => {
              void sendFromComposer("steer");
            },
            onStoreDraft: () => undefined,
          })}
        </div>
      </div>
    </section>
  `;
}
