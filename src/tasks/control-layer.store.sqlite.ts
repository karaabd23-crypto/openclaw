import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { configureSqliteWalMaintenance, type SqliteWalMaintenance } from "../infra/sqlite-wal.js";
import { parseBooleanValue } from "../utils/boolean.js";
import { appendControlAuditLog } from "./control-layer.audit.js";
import { resolveControlLayerDir, resolveControlLayerSqlitePath } from "./control-layer.paths.js";

const CONTROL_LAYER_DIR_MODE = 0o700;
const CONTROL_LAYER_FILE_MODE = 0o600;
const CONTROL_LAYER_SIDECAR_SUFFIXES = ["", "-shm", "-wal"] as const;

const CONTROL_TASK_STATUSES = [
  "queued",
  "running",
  "paused",
  "awaiting_approval",
  "approved",
  "blocked",
  "rejected",
  "succeeded",
  "failed",
  "cancelled",
] as const;

type ControlTaskStatus = (typeof CONTROL_TASK_STATUSES)[number];

type ControlApprovalStatus = "pending" | "approved" | "rejected";

type ControlTaskRecord = {
  taskId: string;
  taskType: string;
  status: ControlTaskStatus;
  prompt?: string;
  modelProvider?: string;
  modelName?: string;
  estimatedCostUsd?: number;
  maxSteps: number;
  approvalRequired: boolean;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  endedAt?: number;
  lastOutcome?: string;
};

type ControlApprovalRecord = {
  approvalId: string;
  taskId: string;
  actionType: string;
  actionTarget?: string;
  actionPayloadJson?: string;
  status: ControlApprovalStatus;
  requestedAt: number;
  decidedAt?: number;
  decidedBy?: string;
  consumedAt?: number;
};

export type ControlBudgetSnapshot = {
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  dailySpentUsd: number;
  monthlySpentUsd: number;
  dayKey: string;
  monthKey: string;
  cheapestModelRef: string;
  cheapestModelIsPaid: boolean;
};

export type ControlBudgetDecision = {
  allowed: boolean;
  blockedReason?: "budget_exhausted";
  rejectNewTasks: boolean;
  downgradeToModelRef?: string;
};

type ControlTaskRow = {
  task_id: string;
  task_type: string;
  status: ControlTaskStatus;
  prompt: string | null;
  model_provider: string | null;
  model_name: string | null;
  estimated_cost_usd: number | null;
  max_steps: number;
  approval_required: number;
  created_at: number | bigint;
  updated_at: number | bigint;
  started_at: number | bigint | null;
  ended_at: number | bigint | null;
  last_outcome: string | null;
};

type ControlApprovalRow = {
  approval_id: string;
  task_id: string;
  action_type: string;
  action_target: string | null;
  action_payload_json: string | null;
  status: ControlApprovalStatus;
  requested_at: number | bigint;
  decided_at: number | bigint | null;
  decided_by: string | null;
  consumed_at: number | bigint | null;
};

type ControlBudgetRow = {
  singleton_id: number;
  daily_limit_usd: number;
  monthly_limit_usd: number;
  daily_spent_usd: number;
  monthly_spent_usd: number;
  day_key: string;
  month_key: string;
  cheapest_model_ref: string;
  cheapest_model_is_paid: number;
};

type ControlLayerStatements = {
  insertTask: StatementSync;
  updateTaskStatus: StatementSync;
  updateTaskStatusWithTimes: StatementSync;
  selectTaskById: StatementSync;
  listTasks: StatementSync;

  insertApproval: StatementSync;
  selectApprovalById: StatementSync;
  listApprovals: StatementSync;
  updateApprovalDecision: StatementSync;
  consumeApproval: StatementSync;

  selectBudget: StatementSync;
  insertBudget: StatementSync;
  updateBudgetWindows: StatementSync;
  updateBudgetLimits: StatementSync;
  addBudgetSpend: StatementSync;
};

type ControlLayerDatabase = {
  db: DatabaseSync;
  path: string;
  statements: ControlLayerStatements;
  walMaintenance: SqliteWalMaintenance;
};

let cachedDatabase: ControlLayerDatabase | null = null;

function normalizeNumber(value: number | bigint | null | undefined): number | undefined {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return typeof value === "number" ? value : undefined;
}

function splitModelRef(raw: string | undefined): { provider?: string; model?: string } {
  const ref = raw?.trim();
  if (!ref) {
    return {};
  }
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash >= ref.length - 1) {
    return { model: ref };
  }
  return {
    provider: ref.slice(0, slash),
    model: ref.slice(slash + 1),
  };
}

function formatModelRef(provider?: string, model?: string): string | undefined {
  if (!provider && !model) {
    return undefined;
  }
  if (!provider) {
    return model;
  }
  if (!model) {
    return provider;
  }
  return `${provider}/${model}`;
}

function normalizeTaskStatus(value: string): ControlTaskStatus {
  const normalized = value.trim().toLowerCase();
  if (CONTROL_TASK_STATUSES.includes(normalized as ControlTaskStatus)) {
    return normalized as ControlTaskStatus;
  }
  throw new Error(`Unsupported control task status: ${value}`);
}

function isTerminalTaskStatus(status: ControlTaskStatus): boolean {
  return ["succeeded", "failed", "blocked", "rejected", "cancelled"].includes(status);
}

function rowToTask(row: ControlTaskRow): ControlTaskRecord {
  return {
    taskId: row.task_id,
    taskType: row.task_type,
    status: row.status,
    ...(row.prompt ? { prompt: row.prompt } : {}),
    ...(row.model_provider ? { modelProvider: row.model_provider } : {}),
    ...(row.model_name ? { modelName: row.model_name } : {}),
    ...(typeof row.estimated_cost_usd === "number"
      ? { estimatedCostUsd: row.estimated_cost_usd }
      : {}),
    maxSteps: row.max_steps,
    approvalRequired: row.approval_required === 1,
    createdAt: normalizeNumber(row.created_at) ?? 0,
    updatedAt: normalizeNumber(row.updated_at) ?? 0,
    ...(normalizeNumber(row.started_at) !== undefined
      ? { startedAt: normalizeNumber(row.started_at) }
      : {}),
    ...(normalizeNumber(row.ended_at) !== undefined
      ? { endedAt: normalizeNumber(row.ended_at) }
      : {}),
    ...(row.last_outcome ? { lastOutcome: row.last_outcome } : {}),
  };
}

function rowToApproval(row: ControlApprovalRow): ControlApprovalRecord {
  return {
    approvalId: row.approval_id,
    taskId: row.task_id,
    actionType: row.action_type,
    ...(row.action_target ? { actionTarget: row.action_target } : {}),
    ...(row.action_payload_json ? { actionPayloadJson: row.action_payload_json } : {}),
    status: row.status,
    requestedAt: normalizeNumber(row.requested_at) ?? 0,
    ...(normalizeNumber(row.decided_at) !== undefined
      ? { decidedAt: normalizeNumber(row.decided_at) }
      : {}),
    ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
    ...(normalizeNumber(row.consumed_at) !== undefined
      ? { consumedAt: normalizeNumber(row.consumed_at) }
      : {}),
  };
}

function rowToBudgetSnapshot(row: ControlBudgetRow): ControlBudgetSnapshot {
  return {
    dailyLimitUsd: row.daily_limit_usd,
    monthlyLimitUsd: row.monthly_limit_usd,
    dailySpentUsd: row.daily_spent_usd,
    monthlySpentUsd: row.monthly_spent_usd,
    dayKey: row.day_key,
    monthKey: row.month_key,
    cheapestModelRef: row.cheapest_model_ref,
    cheapestModelIsPaid: row.cheapest_model_is_paid === 1,
  };
}

function resolveDefaultDailyLimitUsd(): number {
  const raw = Number(process.env.OPENCLAW_CONTROL_DAILY_LIMIT_USD);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 5;
}

function resolveDefaultMonthlyLimitUsd(): number {
  const raw = Number(process.env.OPENCLAW_CONTROL_MONTHLY_LIMIT_USD);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 50;
}

function resolveDefaultCheapestModelRef(): string {
  const raw = process.env.OPENCLAW_CONTROL_CHEAPEST_MODEL?.trim();
  if (raw) {
    return raw;
  }
  return "openrouter/qwen/qwen3-30b-a3b:free";
}

function resolveDefaultCheapestModelIsPaid(): boolean {
  return parseBooleanValue(process.env.OPENCLAW_CONTROL_CHEAPEST_MODEL_IS_PAID) ?? false;
}

function buildDayKey(nowMs: number): string {
  const date = new Date(nowMs);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildMonthKey(nowMs: number): string {
  const date = new Date(nowMs);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function createStatements(db: DatabaseSync): ControlLayerStatements {
  return {
    insertTask: db.prepare(`
      INSERT INTO control_tasks (
        task_id,
        task_type,
        status,
        prompt,
        model_provider,
        model_name,
        estimated_cost_usd,
        max_steps,
        approval_required,
        created_at,
        updated_at,
        started_at,
        ended_at,
        last_outcome
      ) VALUES (
        @task_id,
        @task_type,
        @status,
        @prompt,
        @model_provider,
        @model_name,
        @estimated_cost_usd,
        @max_steps,
        @approval_required,
        @created_at,
        @updated_at,
        @started_at,
        @ended_at,
        @last_outcome
      )
    `),
    updateTaskStatus: db.prepare(`
      UPDATE control_tasks
      SET status = @status,
          updated_at = @updated_at,
          last_outcome = COALESCE(@last_outcome, last_outcome)
      WHERE task_id = @task_id
    `),
    updateTaskStatusWithTimes: db.prepare(`
      UPDATE control_tasks
      SET status = @status,
          updated_at = @updated_at,
          started_at = COALESCE(@started_at, started_at),
          ended_at = COALESCE(@ended_at, ended_at),
          last_outcome = COALESCE(@last_outcome, last_outcome)
      WHERE task_id = @task_id
    `),
    selectTaskById: db.prepare(`
      SELECT
        task_id,
        task_type,
        status,
        prompt,
        model_provider,
        model_name,
        estimated_cost_usd,
        max_steps,
        approval_required,
        created_at,
        updated_at,
        started_at,
        ended_at,
        last_outcome
      FROM control_tasks
      WHERE task_id = ?
    `),
    listTasks: db.prepare(`
      SELECT
        task_id,
        task_type,
        status,
        prompt,
        model_provider,
        model_name,
        estimated_cost_usd,
        max_steps,
        approval_required,
        created_at,
        updated_at,
        started_at,
        ended_at,
        last_outcome
      FROM control_tasks
      ORDER BY created_at DESC, task_id DESC
      LIMIT ?
    `),
    insertApproval: db.prepare(`
      INSERT INTO control_approvals (
        approval_id,
        task_id,
        action_type,
        action_target,
        action_payload_json,
        status,
        requested_at,
        decided_at,
        decided_by,
        consumed_at
      ) VALUES (
        @approval_id,
        @task_id,
        @action_type,
        @action_target,
        @action_payload_json,
        @status,
        @requested_at,
        @decided_at,
        @decided_by,
        @consumed_at
      )
    `),
    selectApprovalById: db.prepare(`
      SELECT
        approval_id,
        task_id,
        action_type,
        action_target,
        action_payload_json,
        status,
        requested_at,
        decided_at,
        decided_by,
        consumed_at
      FROM control_approvals
      WHERE approval_id = ?
    `),
    listApprovals: db.prepare(`
      SELECT
        approval_id,
        task_id,
        action_type,
        action_target,
        action_payload_json,
        status,
        requested_at,
        decided_at,
        decided_by,
        consumed_at
      FROM control_approvals
      ORDER BY requested_at DESC, approval_id DESC
      LIMIT ?
    `),
    updateApprovalDecision: db.prepare(`
      UPDATE control_approvals
      SET status = @status,
          decided_at = @decided_at,
          decided_by = @decided_by
      WHERE approval_id = @approval_id
    `),
    consumeApproval: db.prepare(`
      UPDATE control_approvals
      SET consumed_at = @consumed_at
      WHERE approval_id = @approval_id
        AND status = 'approved'
        AND consumed_at IS NULL
    `),
    selectBudget: db.prepare(`
      SELECT
        singleton_id,
        daily_limit_usd,
        monthly_limit_usd,
        daily_spent_usd,
        monthly_spent_usd,
        day_key,
        month_key,
        cheapest_model_ref,
        cheapest_model_is_paid
      FROM control_budget
      WHERE singleton_id = 1
    `),
    insertBudget: db.prepare(`
      INSERT INTO control_budget (
        singleton_id,
        daily_limit_usd,
        monthly_limit_usd,
        daily_spent_usd,
        monthly_spent_usd,
        day_key,
        month_key,
        cheapest_model_ref,
        cheapest_model_is_paid,
        updated_at
      ) VALUES (
        1,
        @daily_limit_usd,
        @monthly_limit_usd,
        @daily_spent_usd,
        @monthly_spent_usd,
        @day_key,
        @month_key,
        @cheapest_model_ref,
        @cheapest_model_is_paid,
        @updated_at
      )
    `),
    updateBudgetWindows: db.prepare(`
      UPDATE control_budget
      SET daily_spent_usd = @daily_spent_usd,
          monthly_spent_usd = @monthly_spent_usd,
          day_key = @day_key,
          month_key = @month_key,
          updated_at = @updated_at
      WHERE singleton_id = 1
    `),
    updateBudgetLimits: db.prepare(`
      UPDATE control_budget
      SET daily_limit_usd = @daily_limit_usd,
          monthly_limit_usd = @monthly_limit_usd,
          cheapest_model_ref = @cheapest_model_ref,
          cheapest_model_is_paid = @cheapest_model_is_paid,
          updated_at = @updated_at
      WHERE singleton_id = 1
    `),
    addBudgetSpend: db.prepare(`
      UPDATE control_budget
      SET daily_spent_usd = daily_spent_usd + @delta,
          monthly_spent_usd = monthly_spent_usd + @delta,
          updated_at = @updated_at
      WHERE singleton_id = 1
    `),
  };
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS control_tasks (
      task_id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT,
      model_provider TEXT,
      model_name TEXT,
      estimated_cost_usd REAL,
      max_steps INTEGER NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      last_outcome TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_control_tasks_status ON control_tasks(status);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS control_approvals (
      approval_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_target TEXT,
      action_payload_json TEXT,
      status TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      decided_at INTEGER,
      decided_by TEXT,
      consumed_at INTEGER
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_control_approvals_task_id ON control_approvals(task_id);`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_control_approvals_status ON control_approvals(status);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS control_budget (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      daily_limit_usd REAL NOT NULL,
      monthly_limit_usd REAL NOT NULL,
      daily_spent_usd REAL NOT NULL,
      monthly_spent_usd REAL NOT NULL,
      day_key TEXT NOT NULL,
      month_key TEXT NOT NULL,
      cheapest_model_ref TEXT NOT NULL,
      cheapest_model_is_paid INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function ensureControlLayerPermissions(pathname: string): void {
  const dir = resolveControlLayerDir(process.env);
  mkdirSync(dir, { recursive: true, mode: CONTROL_LAYER_DIR_MODE });
  chmodSync(dir, CONTROL_LAYER_DIR_MODE);
  for (const suffix of CONTROL_LAYER_SIDECAR_SUFFIXES) {
    const candidate = `${pathname}${suffix}`;
    if (!existsSync(candidate)) {
      continue;
    }
    chmodSync(candidate, CONTROL_LAYER_FILE_MODE);
  }
}

function openControlLayerDatabase(): ControlLayerDatabase {
  const pathname = resolveControlLayerSqlitePath(process.env);
  if (cachedDatabase && cachedDatabase.path === pathname) {
    return cachedDatabase;
  }
  if (cachedDatabase) {
    cachedDatabase.walMaintenance.close();
    cachedDatabase.db.close();
    cachedDatabase = null;
  }
  ensureControlLayerPermissions(pathname);
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(pathname);
  const walMaintenance = configureSqliteWalMaintenance(db);
  db.exec(`PRAGMA synchronous = NORMAL;`);
  db.exec(`PRAGMA busy_timeout = 5000;`);
  ensureSchema(db);
  ensureControlLayerPermissions(pathname);
  cachedDatabase = {
    db,
    path: pathname,
    statements: createStatements(db),
    walMaintenance,
  };
  return cachedDatabase;
}

function ensureBudgetRow(nowMs: number): ControlBudgetSnapshot {
  const store = openControlLayerDatabase();
  let row = store.statements.selectBudget.get() as ControlBudgetRow | undefined;
  const dayKey = buildDayKey(nowMs);
  const monthKey = buildMonthKey(nowMs);
  if (!row) {
    store.statements.insertBudget.run({
      daily_limit_usd: resolveDefaultDailyLimitUsd(),
      monthly_limit_usd: resolveDefaultMonthlyLimitUsd(),
      daily_spent_usd: 0,
      monthly_spent_usd: 0,
      day_key: dayKey,
      month_key: monthKey,
      cheapest_model_ref: resolveDefaultCheapestModelRef(),
      cheapest_model_is_paid: resolveDefaultCheapestModelIsPaid() ? 1 : 0,
      updated_at: nowMs,
    });
    row = store.statements.selectBudget.get() as ControlBudgetRow | undefined;
  }
  if (!row) {
    throw new Error("Failed to initialize control budget row.");
  }

  let nextDailySpent = row.daily_spent_usd;
  let nextMonthlySpent = row.monthly_spent_usd;
  let needsWindowUpdate = false;

  if (row.day_key !== dayKey) {
    nextDailySpent = 0;
    needsWindowUpdate = true;
  }
  if (row.month_key !== monthKey) {
    nextMonthlySpent = 0;
    needsWindowUpdate = true;
  }
  if (needsWindowUpdate) {
    store.statements.updateBudgetWindows.run({
      daily_spent_usd: nextDailySpent,
      monthly_spent_usd: nextMonthlySpent,
      day_key: dayKey,
      month_key: monthKey,
      updated_at: nowMs,
    });
    row = store.statements.selectBudget.get() as ControlBudgetRow | undefined;
    if (!row) {
      throw new Error("Failed to refresh control budget row after window reset.");
    }
  }

  return rowToBudgetSnapshot(row);
}

export function getControlBudgetSnapshot(nowMs = Date.now()): ControlBudgetSnapshot {
  return ensureBudgetRow(nowMs);
}

export async function setControlBudgetLimits(params: {
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  cheapestModelRef: string;
  cheapestModelIsPaid: boolean;
}): Promise<ControlBudgetSnapshot> {
  const nowMs = Date.now();
  ensureBudgetRow(nowMs);
  const store = openControlLayerDatabase();
  store.statements.updateBudgetLimits.run({
    daily_limit_usd: params.dailyLimitUsd,
    monthly_limit_usd: params.monthlyLimitUsd,
    cheapest_model_ref: params.cheapestModelRef,
    cheapest_model_is_paid: params.cheapestModelIsPaid ? 1 : 0,
    updated_at: nowMs,
  });
  await appendControlAuditLog({
    event: "budget.set_limits",
    outcome: "updated",
    metadata: {
      dailyLimitUsd: params.dailyLimitUsd,
      monthlyLimitUsd: params.monthlyLimitUsd,
      cheapestModelRef: params.cheapestModelRef,
      cheapestModelIsPaid: params.cheapestModelIsPaid,
    },
  });
  return ensureBudgetRow(nowMs);
}

export async function recordControlBudgetSpend(params: {
  costUsd: number;
  taskId?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  outcome?: string;
}): Promise<ControlBudgetSnapshot> {
  const nowMs = Date.now();
  const normalizedCost = Number.isFinite(params.costUsd) ? Math.max(0, params.costUsd) : 0;
  ensureBudgetRow(nowMs);
  const store = openControlLayerDatabase();
  store.statements.addBudgetSpend.run({
    delta: normalizedCost,
    updated_at: nowMs,
  });
  const snapshot = ensureBudgetRow(nowMs);
  await appendControlAuditLog({
    event: "budget.record_spend",
    taskId: params.taskId,
    prompt: params.prompt,
    model: formatModelRef(params.provider, params.model),
    costUsd: normalizedCost,
    outcome: params.outcome ?? "recorded",
    metadata: {
      dailySpentUsd: snapshot.dailySpentUsd,
      monthlySpentUsd: snapshot.monthlySpentUsd,
    },
  });
  return snapshot;
}

export async function checkControlBudgetForModel(params: {
  provider: string;
  model: string;
  isPaid: boolean;
  prompt?: string;
  taskId?: string;
  estimatedCostUsd?: number;
}): Promise<ControlBudgetDecision> {
  const nowMs = Date.now();
  const snapshot = ensureBudgetRow(nowMs);
  const estimatedCost = Number.isFinite(params.estimatedCostUsd)
    ? Math.max(0, params.estimatedCostUsd ?? 0)
    : 0;
  const modelRef = formatModelRef(params.provider, params.model);

  if (!params.isPaid) {
    await appendControlAuditLog({
      event: "budget.check",
      taskId: params.taskId,
      prompt: params.prompt,
      model: modelRef,
      costUsd: estimatedCost,
      outcome: "allow_unpaid_model",
      metadata: {
        isPaid: false,
      },
    });
    return { allowed: true, rejectNewTasks: false };
  }

  const dailyExhausted = snapshot.dailySpentUsd + estimatedCost >= snapshot.dailyLimitUsd;
  const monthlyExhausted = snapshot.monthlySpentUsd + estimatedCost >= snapshot.monthlyLimitUsd;
  const exhausted = dailyExhausted || monthlyExhausted;

  if (!exhausted) {
    await appendControlAuditLog({
      event: "budget.check",
      taskId: params.taskId,
      prompt: params.prompt,
      model: modelRef,
      costUsd: estimatedCost,
      outcome: "allow_paid_model",
      metadata: {
        isPaid: true,
        dailySpentUsd: snapshot.dailySpentUsd,
        monthlySpentUsd: snapshot.monthlySpentUsd,
      },
    });
    return { allowed: true, rejectNewTasks: false };
  }

  if (
    !snapshot.cheapestModelIsPaid &&
    snapshot.cheapestModelRef.trim().length > 0 &&
    snapshot.cheapestModelRef !== modelRef
  ) {
    await appendControlAuditLog({
      event: "budget.check",
      taskId: params.taskId,
      prompt: params.prompt,
      model: modelRef,
      costUsd: estimatedCost,
      outcome: "downgrade_to_cheapest",
      metadata: {
        downgradeToModelRef: snapshot.cheapestModelRef,
      },
    });
    return {
      allowed: true,
      rejectNewTasks: false,
      downgradeToModelRef: snapshot.cheapestModelRef,
    };
  }

  await appendControlAuditLog({
    event: "budget.check",
    taskId: params.taskId,
    prompt: params.prompt,
    model: modelRef,
    costUsd: estimatedCost,
    outcome: "block_paid_model",
    metadata: {
      dailySpentUsd: snapshot.dailySpentUsd,
      monthlySpentUsd: snapshot.monthlySpentUsd,
      dailyLimitUsd: snapshot.dailyLimitUsd,
      monthlyLimitUsd: snapshot.monthlyLimitUsd,
    },
  });
  return {
    allowed: false,
    blockedReason: "budget_exhausted",
    rejectNewTasks: true,
  };
}

export async function createControlTask(params: {
  taskType: string;
  prompt?: string;
  modelRef?: string;
  estimatedCostUsd?: number;
  maxSteps?: number;
  approvalRequired?: boolean;
}): Promise<ControlTaskRecord> {
  const nowMs = Date.now();
  const taskId = `ctl-${randomUUID()}`;
  const modelParts = splitModelRef(params.modelRef);
  const maxSteps =
    typeof params.maxSteps === "number" && Number.isFinite(params.maxSteps) && params.maxSteps > 0
      ? Math.floor(params.maxSteps)
      : 1;

  const store = openControlLayerDatabase();
  store.statements.insertTask.run({
    task_id: taskId,
    task_type: params.taskType.trim() || "general",
    status: "queued",
    prompt: params.prompt ?? null,
    model_provider: modelParts.provider ?? null,
    model_name: modelParts.model ?? null,
    estimated_cost_usd:
      typeof params.estimatedCostUsd === "number" && Number.isFinite(params.estimatedCostUsd)
        ? params.estimatedCostUsd
        : null,
    max_steps: maxSteps,
    approval_required: params.approvalRequired ? 1 : 0,
    created_at: nowMs,
    updated_at: nowMs,
    started_at: null,
    ended_at: null,
    last_outcome: null,
  });

  const task = getControlTaskById(taskId);
  if (!task) {
    throw new Error("Failed to read control task after insert.");
  }

  await appendControlAuditLog({
    event: "task.create",
    taskId,
    prompt: task.prompt,
    model: formatModelRef(task.modelProvider, task.modelName),
    costUsd: task.estimatedCostUsd,
    outcome: task.status,
    metadata: {
      taskType: task.taskType,
      maxSteps: task.maxSteps,
      approvalRequired: task.approvalRequired,
    },
  });

  return task;
}

export function getControlTaskById(taskId: string): ControlTaskRecord | null {
  const store = openControlLayerDatabase();
  const row = store.statements.selectTaskById.get(taskId) as ControlTaskRow | undefined;
  return row ? rowToTask(row) : null;
}

export function listControlTasks(limit = 50): ControlTaskRecord[] {
  const bounded = Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 50;
  const store = openControlLayerDatabase();
  const rows = store.statements.listTasks.all(bounded) as ControlTaskRow[];
  return rows.map((row) => rowToTask(row));
}

export async function updateControlTaskStatus(params: {
  taskId: string;
  status: string;
  outcome?: string;
}): Promise<ControlTaskRecord | null> {
  const task = getControlTaskById(params.taskId);
  if (!task) {
    return null;
  }
  const status = normalizeTaskStatus(params.status);
  const nowMs = Date.now();
  const startedAt = status === "running" ? nowMs : null;
  const endedAt = isTerminalTaskStatus(status) ? nowMs : null;

  const store = openControlLayerDatabase();
  store.statements.updateTaskStatusWithTimes.run({
    task_id: params.taskId,
    status,
    updated_at: nowMs,
    started_at: startedAt,
    ended_at: endedAt,
    last_outcome: params.outcome ?? null,
  });

  const updated = getControlTaskById(params.taskId);
  if (updated) {
    await appendControlAuditLog({
      event: "task.status",
      taskId: updated.taskId,
      prompt: updated.prompt,
      model: formatModelRef(updated.modelProvider, updated.modelName),
      costUsd: updated.estimatedCostUsd,
      outcome: updated.status,
      metadata: {
        requestedStatus: params.status,
        outcome: params.outcome,
      },
    });
  }
  return updated;
}

export async function createControlApprovalRequest(params: {
  taskId: string;
  actionType: string;
  actionTarget?: string;
  payload?: Record<string, unknown>;
}): Promise<ControlApprovalRecord> {
  const task = getControlTaskById(params.taskId);
  if (!task) {
    throw new Error(`Control task not found: ${params.taskId}`);
  }
  const nowMs = Date.now();
  const approvalId = `apr-${randomUUID()}`;
  const store = openControlLayerDatabase();
  store.statements.insertApproval.run({
    approval_id: approvalId,
    task_id: params.taskId,
    action_type: params.actionType,
    action_target: params.actionTarget ?? null,
    action_payload_json: params.payload ? JSON.stringify(params.payload) : null,
    status: "pending",
    requested_at: nowMs,
    decided_at: null,
    decided_by: null,
    consumed_at: null,
  });
  store.statements.updateTaskStatus.run({
    task_id: params.taskId,
    status: "awaiting_approval",
    updated_at: nowMs,
    last_outcome: "awaiting_approval",
  });

  const approval = getControlApprovalById(approvalId);
  if (!approval) {
    throw new Error("Failed to read control approval after insert.");
  }

  await appendControlAuditLog({
    event: "approval.request",
    taskId: params.taskId,
    approvalId,
    prompt: task.prompt,
    model: formatModelRef(task.modelProvider, task.modelName),
    costUsd: task.estimatedCostUsd,
    outcome: "pending",
    metadata: {
      actionType: params.actionType,
      actionTarget: params.actionTarget,
    },
  });

  return approval;
}

export function getControlApprovalById(approvalId: string): ControlApprovalRecord | null {
  const store = openControlLayerDatabase();
  const row = store.statements.selectApprovalById.get(approvalId) as ControlApprovalRow | undefined;
  return row ? rowToApproval(row) : null;
}

export function listControlApprovals(limit = 50): ControlApprovalRecord[] {
  const bounded = Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 50;
  const store = openControlLayerDatabase();
  const rows = store.statements.listApprovals.all(bounded) as ControlApprovalRow[];
  return rows.map((row) => rowToApproval(row));
}

export async function decideControlApproval(params: {
  approvalId: string;
  decision: "approve" | "reject";
  actor?: string;
}): Promise<ControlApprovalRecord | null> {
  const existing = getControlApprovalById(params.approvalId);
  if (!existing) {
    return null;
  }
  if (existing.status !== "pending") {
    return existing;
  }
  const nowMs = Date.now();
  const status: ControlApprovalStatus = params.decision === "approve" ? "approved" : "rejected";
  const store = openControlLayerDatabase();
  store.statements.updateApprovalDecision.run({
    approval_id: params.approvalId,
    status,
    decided_at: nowMs,
    decided_by: params.actor ?? "operator",
  });
  store.statements.updateTaskStatus.run({
    task_id: existing.taskId,
    status: params.decision === "approve" ? "queued" : "rejected",
    updated_at: nowMs,
    last_outcome: params.decision === "approve" ? "approved" : "rejected",
  });

  const updated = getControlApprovalById(params.approvalId);
  if (updated) {
    await appendControlAuditLog({
      event: "approval.decide",
      approvalId: updated.approvalId,
      taskId: updated.taskId,
      outcome: updated.status,
      metadata: {
        actor: params.actor ?? "operator",
      },
    });
  }
  return updated;
}

export async function consumeControlApprovalForInvoke(params: {
  approvalId: string;
  toolName: string;
}): Promise<{ ok: true; taskId: string } | { ok: false; reason: string }> {
  const approval = getControlApprovalById(params.approvalId);
  if (!approval) {
    return { ok: false, reason: "approval_not_found" };
  }
  if (approval.status !== "approved") {
    return { ok: false, reason: "approval_not_approved" };
  }
  if (typeof approval.consumedAt === "number") {
    return { ok: false, reason: "approval_already_consumed" };
  }
  if (approval.actionType !== "tools.invoke") {
    return { ok: false, reason: "approval_action_type_mismatch" };
  }
  if (approval.actionTarget && approval.actionTarget !== params.toolName) {
    return { ok: false, reason: "approval_action_target_mismatch" };
  }
  const nowMs = Date.now();
  const store = openControlLayerDatabase();
  const consumeResult = store.statements.consumeApproval.run({
    approval_id: params.approvalId,
    consumed_at: nowMs,
  });
  const consumedRows =
    typeof consumeResult === "object" &&
    consumeResult !== null &&
    "changes" in consumeResult &&
    typeof consumeResult.changes === "number"
      ? consumeResult.changes
      : 0;
  if (consumedRows !== 1) {
    const latest = getControlApprovalById(params.approvalId);
    if (latest?.status !== "approved") {
      return { ok: false, reason: "approval_not_approved" };
    }
    if (typeof latest?.consumedAt === "number") {
      return { ok: false, reason: "approval_already_consumed" };
    }
    return { ok: false, reason: "approval_consume_failed" };
  }
  store.statements.updateTaskStatusWithTimes.run({
    task_id: approval.taskId,
    status: "running",
    updated_at: nowMs,
    started_at: nowMs,
    ended_at: null,
    last_outcome: "approved",
  });

  await appendControlAuditLog({
    event: "approval.consume",
    approvalId: approval.approvalId,
    taskId: approval.taskId,
    outcome: "approved",
    metadata: {
      toolName: params.toolName,
    },
  });

  return { ok: true, taskId: approval.taskId };
}

export function closeControlLayerSqliteStore(): void {
  if (!cachedDatabase) {
    return;
  }
  cachedDatabase.walMaintenance.close();
  cachedDatabase.db.close();
  cachedDatabase = null;
}
