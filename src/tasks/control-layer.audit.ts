import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { resolveControlLayerAuditPath } from "./control-layer.paths.js";

const CONTROL_LAYER_AUDIT_DIR_MODE = 0o700;
const CONTROL_LAYER_AUDIT_FILE_MODE = 0o600;

export type ControlAuditEntry = {
  event: string;
  timestamp: string;
  taskId?: string;
  approvalId?: string;
  prompt?: string;
  model?: string;
  costUsd?: number;
  outcome?: string;
  metadata?: Record<string, unknown>;
};

function ensureAuditPath(pathname: string): void {
  const dir = path.dirname(pathname);
  mkdirSync(dir, { recursive: true, mode: CONTROL_LAYER_AUDIT_DIR_MODE });
  chmodSync(dir, CONTROL_LAYER_AUDIT_DIR_MODE);
  if (!existsSync(pathname)) {
    writeFileSync(pathname, "", { mode: CONTROL_LAYER_AUDIT_FILE_MODE });
  }
  chmodSync(pathname, CONTROL_LAYER_AUDIT_FILE_MODE);
}

export async function appendControlAuditLog(
  entry: Omit<ControlAuditEntry, "timestamp"> & { timestamp?: string },
): Promise<void> {
  const pathname = resolveControlLayerAuditPath(process.env);
  ensureAuditPath(pathname);
  const payload: ControlAuditEntry = {
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  };
  await appendFile(pathname, `${JSON.stringify(payload)}\n`, "utf8");
  ensureAuditPath(pathname);
}
