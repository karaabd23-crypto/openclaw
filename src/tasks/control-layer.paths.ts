import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export function resolveControlLayerDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_CONTROL_LAYER_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveStateDir(env), "control-layer");
}

export function resolveControlLayerSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_CONTROL_LAYER_SQLITE_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveControlLayerDir(env), "control.sqlite");
}

export function resolveControlLayerAuditPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_CONTROL_LAYER_AUDIT_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveControlLayerDir(env), "audit", "control-audit.jsonl");
}
