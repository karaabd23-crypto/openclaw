import type { RuntimeEnv } from "../runtime.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import {
  checkControlBudgetForModel,
  createControlApprovalRequest,
  createControlTask,
  decideControlApproval,
  getControlApprovalById,
  getControlBudgetSnapshot,
  getControlTaskById,
  listControlApprovals,
  listControlTasks,
  recordControlBudgetSpend,
  setControlBudgetLimits,
  updateControlTaskStatus,
} from "../tasks/control-layer.store.sqlite.js";

function parsePositiveNumber(raw: string | undefined, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function parseNonNegativeNumber(raw: string | undefined, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

function splitModelRef(
  modelRef: string | undefined,
  required = false,
): { provider?: string; model?: string } {
  const normalized = normalizeOptionalString(modelRef);
  if (!normalized) {
    if (required) {
      throw new Error("model is required");
    }
    return {};
  }
  const slash = normalized.indexOf("/");
  if (slash <= 0 || slash >= normalized.length - 1) {
    return { provider: "openai", model: normalized };
  }
  return {
    provider: normalized.slice(0, slash),
    model: normalized.slice(slash + 1),
  };
}

function parsePayloadJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("payload JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}

export async function tasksControlCreateCommand(
  opts: {
    json?: boolean;
    type?: string;
    prompt?: string;
    model?: string;
    estimatedCost?: string;
    maxSteps?: string;
    approvalRequired?: boolean;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const task = await createControlTask({
      taskType: normalizeOptionalString(opts.type) ?? "general",
      prompt: normalizeOptionalString(opts.prompt),
      modelRef: normalizeOptionalString(opts.model),
      estimatedCostUsd:
        opts.estimatedCost !== undefined
          ? parseNonNegativeNumber(opts.estimatedCost, "estimated-cost")
          : undefined,
      maxSteps:
        opts.maxSteps !== undefined ? parsePositiveNumber(opts.maxSteps, "max-steps") : undefined,
      approvalRequired: Boolean(opts.approvalRequired),
    });
    if (opts.json) {
      runtime.log(JSON.stringify(task, null, 2));
      return;
    }
    runtime.log(`Created control task ${task.taskId} (${task.status}).`);
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
  }
}

export async function tasksControlStatusCommand(
  opts: {
    json?: boolean;
    taskId: string;
    status: string;
    outcome?: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  const updated = await updateControlTaskStatus({
    taskId: opts.taskId,
    status: opts.status,
    outcome: normalizeOptionalString(opts.outcome),
  }).catch((error) => {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
    return null;
  });
  if (!updated) {
    runtime.error(`Control task not found: ${opts.taskId}`);
    runtime.exit(1);
    return;
  }
  if (opts.json) {
    runtime.log(JSON.stringify(updated, null, 2));
    return;
  }
  runtime.log(`Updated ${updated.taskId} to ${updated.status}.`);
}

export async function tasksControlShowCommand(
  opts: {
    json?: boolean;
    taskId: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  const task = getControlTaskById(opts.taskId);
  if (!task) {
    runtime.error(`Control task not found: ${opts.taskId}`);
    runtime.exit(1);
    return;
  }
  if (opts.json) {
    runtime.log(JSON.stringify(task, null, 2));
    return;
  }
  runtime.log(`Task ${task.taskId}`);
  runtime.log(`type: ${task.taskType}`);
  runtime.log(`status: ${task.status}`);
  runtime.log(`maxSteps: ${task.maxSteps}`);
  runtime.log(`approvalRequired: ${task.approvalRequired}`);
  runtime.log(`createdAt: ${new Date(task.createdAt).toISOString()}`);
  runtime.log(`updatedAt: ${new Date(task.updatedAt).toISOString()}`);
}

export async function tasksControlListCommand(
  opts: {
    json?: boolean;
    limit?: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const limit = opts.limit ? parsePositiveNumber(opts.limit, "limit") : 50;
    const tasks = listControlTasks(limit);
    if (opts.json) {
      runtime.log(JSON.stringify({ count: tasks.length, tasks }, null, 2));
      return;
    }
    runtime.log(`Control tasks: ${tasks.length}`);
    for (const task of tasks) {
      runtime.log(`${task.taskId}  ${task.status}  ${task.taskType}`);
    }
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
  }
}

export async function tasksControlApprovalRequestCommand(
  opts: {
    json?: boolean;
    taskId: string;
    actionType: string;
    actionTarget?: string;
    payloadJson?: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const approval = await createControlApprovalRequest({
      taskId: opts.taskId,
      actionType: opts.actionType,
      actionTarget: normalizeOptionalString(opts.actionTarget),
      payload: parsePayloadJson(opts.payloadJson),
    });
    if (opts.json) {
      runtime.log(JSON.stringify(approval, null, 2));
      return;
    }
    runtime.log(`Created approval request ${approval.approvalId} for task ${approval.taskId}.`);
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
  }
}

export async function tasksControlApprovalDecideCommand(
  opts: {
    json?: boolean;
    approvalId: string;
    decision: "approve" | "reject";
    actor?: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  const approval = await decideControlApproval({
    approvalId: opts.approvalId,
    decision: opts.decision,
    actor: normalizeOptionalString(opts.actor),
  });
  if (!approval) {
    runtime.error(`Approval request not found: ${opts.approvalId}`);
    runtime.exit(1);
    return;
  }
  if (opts.json) {
    runtime.log(JSON.stringify(approval, null, 2));
    return;
  }
  runtime.log(`Approval ${approval.approvalId} is ${approval.status}.`);
}

export async function tasksControlApprovalShowCommand(
  opts: {
    json?: boolean;
    approvalId: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  const approval = getControlApprovalById(opts.approvalId);
  if (!approval) {
    runtime.error(`Approval request not found: ${opts.approvalId}`);
    runtime.exit(1);
    return;
  }
  if (opts.json) {
    runtime.log(JSON.stringify(approval, null, 2));
    return;
  }
  runtime.log(`Approval ${approval.approvalId}`);
  runtime.log(`taskId: ${approval.taskId}`);
  runtime.log(`status: ${approval.status}`);
  runtime.log(`actionType: ${approval.actionType}`);
  runtime.log(`actionTarget: ${approval.actionTarget ?? "n/a"}`);
}

export async function tasksControlApprovalListCommand(
  opts: {
    json?: boolean;
    limit?: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const limit = opts.limit ? parsePositiveNumber(opts.limit, "limit") : 50;
    const approvals = listControlApprovals(limit);
    if (opts.json) {
      runtime.log(JSON.stringify({ count: approvals.length, approvals }, null, 2));
      return;
    }
    runtime.log(`Control approvals: ${approvals.length}`);
    for (const approval of approvals) {
      runtime.log(`${approval.approvalId}  ${approval.status}  ${approval.actionType}`);
    }
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
  }
}

export async function tasksControlBudgetSetCommand(
  opts: {
    json?: boolean;
    daily: string;
    monthly: string;
    cheapestModel: string;
    cheapestModelPaid?: boolean;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const snapshot = await setControlBudgetLimits({
      dailyLimitUsd: parsePositiveNumber(opts.daily, "daily"),
      monthlyLimitUsd: parsePositiveNumber(opts.monthly, "monthly"),
      cheapestModelRef:
        normalizeOptionalString(opts.cheapestModel) ?? "openrouter/qwen/qwen3-30b-a3b:free",
      cheapestModelIsPaid: Boolean(opts.cheapestModelPaid),
    });
    if (opts.json) {
      runtime.log(JSON.stringify(snapshot, null, 2));
      return;
    }
    runtime.log(
      `Updated budget limits: daily=$${snapshot.dailyLimitUsd}, monthly=$${snapshot.monthlyLimitUsd}.`,
    );
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
  }
}

export async function tasksControlBudgetCheckCommand(
  opts: {
    json?: boolean;
    model: string;
    paid?: boolean;
    estimatedCost?: string;
    prompt?: string;
    taskId?: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const model = splitModelRef(opts.model, true);
    const estimatedCostUsd =
      opts.estimatedCost !== undefined
        ? parseNonNegativeNumber(opts.estimatedCost, "estimated-cost")
        : undefined;
    const decision = await checkControlBudgetForModel({
      provider: model.provider ?? "openai",
      model: model.model ?? "unknown-model",
      isPaid: Boolean(opts.paid),
      estimatedCostUsd,
      prompt: normalizeOptionalString(opts.prompt),
      taskId: normalizeOptionalString(opts.taskId),
    });
    if (opts.json) {
      runtime.log(JSON.stringify(decision, null, 2));
      return;
    }
    if (!decision.allowed) {
      runtime.log(`Budget blocked paid model calls (${decision.blockedReason}).`);
      runtime.log(`Reject new tasks: ${decision.rejectNewTasks}`);
      return;
    }
    if (decision.downgradeToModelRef) {
      runtime.log(`Budget requires downgrade to ${decision.downgradeToModelRef}.`);
      return;
    }
    runtime.log("Budget check passed.");
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
  }
}

export async function tasksControlBudgetSpendCommand(
  opts: {
    json?: boolean;
    cost: string;
    taskId?: string;
    prompt?: string;
    model?: string;
    outcome?: string;
  },
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const costUsd = parseNonNegativeNumber(opts.cost, "cost");
    const parts = splitModelRef(opts.model);
    const snapshot = await recordControlBudgetSpend({
      costUsd,
      taskId: normalizeOptionalString(opts.taskId),
      prompt: normalizeOptionalString(opts.prompt),
      provider: parts.provider,
      model: parts.model,
      outcome: normalizeOptionalString(opts.outcome),
    });
    if (opts.json) {
      runtime.log(JSON.stringify(snapshot, null, 2));
      return;
    }
    runtime.log(
      `Recorded spend $${costUsd.toFixed(4)} (daily: $${snapshot.dailySpentUsd.toFixed(4)}, monthly: $${snapshot.monthlySpentUsd.toFixed(4)}).`,
    );
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : String(error));
    runtime.exit(1);
  }
}

export async function tasksControlBudgetShowCommand(
  opts: { json?: boolean },
  runtime: RuntimeEnv,
): Promise<void> {
  const snapshot = getControlBudgetSnapshot();
  if (opts.json) {
    runtime.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  runtime.log(
    `Daily: $${snapshot.dailySpentUsd.toFixed(4)} / $${snapshot.dailyLimitUsd.toFixed(4)}`,
  );
  runtime.log(
    `Monthly: $${snapshot.monthlySpentUsd.toFixed(4)} / $${snapshot.monthlyLimitUsd.toFixed(4)}`,
  );
  runtime.log(`Cheapest model: ${snapshot.cheapestModelRef}`);
  runtime.log(`Cheapest model is paid: ${snapshot.cheapestModelIsPaid}`);
}
