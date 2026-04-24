import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const sessionEntryState = vi.hoisted(() => ({
  sessionId: "sess-main",
  sessionFile: "/tmp/sess-main.jsonl",
  storePath: "/tmp/sessions.json",
}));

const rewriteTranscriptEntriesInSessionFileMock = vi.hoisted(() =>
  vi.fn(async () => ({
    changed: true,
    bytesFreed: 42,
    rewrittenEntries: 2,
  })),
);

vi.mock("../session-utils.js", async () => {
  const original =
    await vi.importActual<typeof import("../session-utils.js")>("../session-utils.js");
  return {
    ...original,
    loadSessionEntry: () => ({
      cfg: {},
      storePath: sessionEntryState.storePath,
      entry: {
        sessionId: sessionEntryState.sessionId,
        sessionFile: sessionEntryState.sessionFile,
      },
      canonicalKey: "main",
    }),
  };
});

vi.mock("../../agents/pi-embedded-runner/transcript-rewrite.js", () => ({
  rewriteTranscriptEntriesInSessionFile: rewriteTranscriptEntriesInSessionFileMock,
}));

const { chatHandlers } = await import("./chat.js");

describe("chat.delete", () => {
  it("rewrites persisted transcript entries through the existing transcript helper", async () => {
    rewriteTranscriptEntriesInSessionFileMock.mockClear();
    sessionEntryState.sessionFile = path.join("/tmp", "sess-main.jsonl");
    sessionEntryState.storePath = path.join("/tmp", "sessions.json");

    const respond = vi.fn();

    await chatHandlers["chat.delete"]({
      params: {
        sessionKey: "legacy-main",
        entryIds: ["entry-1", "entry-2", "entry-1"],
      },
      respond,
      context: {} as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(rewriteTranscriptEntriesInSessionFileMock).toHaveBeenCalledWith({
      sessionFile: sessionEntryState.sessionFile,
      sessionId: sessionEntryState.sessionId,
      sessionKey: "main",
      request: {
        replacements: [
          { entryId: "entry-1", message: null },
          { entryId: "entry-2", message: null },
        ],
      },
    });

    expect(respond).toHaveBeenCalledWith(true, {
      ok: true,
      deleted: true,
      deletedEntryIds: ["entry-1", "entry-2"],
      deletedCount: 2,
    });
  });
});
