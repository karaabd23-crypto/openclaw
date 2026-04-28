import type { GatewayBrowserClient } from "../gateway.ts";

const LAST_SEEN_DREAM_KEY = "openclaw:lastSeenDreamTimestamp";

export type DreamingBriefingState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  dreamingBriefing: { phase: string; timestamp: string } | null;
};

type MemoryHostEvent = {
  type: string;
  timestamp: string;
  phase?: string;
};

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_DREAM_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(timestamp: string): void {
  try {
    localStorage.setItem(LAST_SEEN_DREAM_KEY, timestamp);
  } catch {
    // ignore — storage may be unavailable
  }
}

export function dismissDreamingBriefing(state: DreamingBriefingState): void {
  if (state.dreamingBriefing) {
    writeLastSeen(state.dreamingBriefing.timestamp);
  }
  state.dreamingBriefing = null;
}

export async function loadDreamingBriefing(state: DreamingBriefingState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request<{ events: MemoryHostEvent[] }>("memory.events.recent", {
      limit: 50,
    });
    const events = Array.isArray(res?.events) ? res.events : [];
    const lastSeen = readLastSeen();
    const dreamEvents = events.filter(
      (e) => e.type === "memory.dream.completed" && (!lastSeen || e.timestamp > lastSeen),
    );
    if (dreamEvents.length === 0) {
      return;
    }
    // Show briefing for the most recent completed dream
    const latest = dreamEvents[dreamEvents.length - 1];
    if (latest) {
      state.dreamingBriefing = {
        phase: latest.phase ?? "dream",
        timestamp: latest.timestamp,
      };
    }
  } catch {
    // memory.events.recent is best-effort; silently ignore errors
  }
}
