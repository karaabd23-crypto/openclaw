import { html, nothing } from "lit";
import { icons } from "../icons.ts";

export type ChatRunControlsProps = {
  canAbort: boolean;
  connected: boolean;
  draft: string;
  hasMessages: boolean;
  isBusy: boolean;
  busyModeWhenBusy: "queue" | "steer";
  sending: boolean;
  onAbort?: () => void;
  onBusyModeChange: (mode: "queue" | "steer") => void;
  onExport: () => void;
  onNewSession: () => void;
  onSend: () => void;
  onSendSteer?: () => void;
  onStoreDraft: (draft: string) => void;
};

export function renderChatRunControls(props: ChatRunControlsProps) {
  return html`
    <div class="agent-chat__toolbar-right">
      ${props.canAbort
        ? nothing
        : html`
            <button
              class="btn btn--ghost"
              @click=${props.onNewSession}
              title="New session"
              aria-label="New session"
            >
              ${icons.plus}
            </button>
          `}
      <button
        class="btn btn--ghost"
        @click=${props.onExport}
        title="Export"
        aria-label="Export chat"
        ?disabled=${!props.hasMessages}
      >
        ${icons.download}
      </button>
      <button
        class="btn btn--ghost"
        @click=${() =>
          props.onBusyModeChange(props.busyModeWhenBusy === "queue" ? "steer" : "queue")}
        title="When a run is active, choose whether Send queues or steers"
        aria-label="Toggle busy send mode"
      >
        ${props.busyModeWhenBusy === "queue" ? "Queue" : "Steer"}
      </button>

      ${props.canAbort
        ? html`
            <button
              class="chat-send-btn"
              @click=${() => {
                if (props.draft.trim()) {
                  props.onStoreDraft(props.draft);
                }
                props.onSend();
              }}
              ?disabled=${!props.connected || props.sending}
              title="Queue"
              aria-label="Queue message"
            >
              ${icons.send}
            </button>
            <button
              class="chat-send-btn chat-send-btn--stop"
              @click=${props.onAbort}
              title="Stop"
              aria-label="Stop generating"
            >
              ${icons.stop}
            </button>
          `
        : nothing}
      <button
        class="chat-send-btn"
        @click=${(e: MouseEvent) => {
          if (props.draft.trim()) {
            props.onStoreDraft(props.draft);
          }
          if ((e.ctrlKey || e.metaKey) && props.onSendSteer) {
            props.onSendSteer();
          } else {
            props.onSend();
          }
        }}
        ?disabled=${!props.connected || props.sending}
        title=${props.isBusy
          ? "Queue message (Enter) · Ctrl+click or Ctrl+Enter to Steer"
          : "Send (Enter)"}
        aria-label=${props.isBusy ? "Queue or steer message" : "Send message"}
      >
        ${icons.send}
      </button>
    </div>
  `;
}
