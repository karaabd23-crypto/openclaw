import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { resolveControlLayerAuditPath } from "./control-layer.paths.js";
import {
  checkControlBudgetForModel,
  closeControlLayerSqliteStore,
  consumeControlApprovalForInvoke,
  createControlApprovalRequest,
  createControlTask,
  decideControlApproval,
  getControlBudgetSnapshot,
  getControlTaskById,
  recordControlBudgetSpend,
  setControlBudgetLimits,
  updateControlTaskStatus,
} from "./control-layer.store.sqlite.js";

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;

afterEach(() => {
  closeControlLayerSqliteStore();
  if (ORIGINAL_STATE_DIR === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
  }
});

describe("control layer sqlite store", () => {
  it("creates tasks and updates task status", async () => {
    await withTempDir({ prefix: "openclaw-control-layer-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      const task = await createControlTask({
        taskType: "job_search",
        prompt: "Find remote DevOps roles",
        modelRef: "openai/gpt-5.4-mini",
        estimatedCostUsd: 0.02,
        maxSteps: 5,
      });

      expect(task.status).toBe("queued");
      expect(task.maxSteps).toBe(5);

      const running = await updateControlTaskStatus({
        taskId: task.taskId,
        status: "running",
      });
      expect(running?.status).toBe("running");

      const done = await updateControlTaskStatus({
        taskId: task.taskId,
        status: "succeeded",
        outcome: "completed",
      });
      expect(done?.status).toBe("succeeded");
      expect(done?.lastOutcome).toBe("completed");
    });
  });

  it("pauses and resumes tools.invoke via approval request + decision", async () => {
    await withTempDir({ prefix: "openclaw-control-approval-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      const task = await createControlTask({
        taskType: "tools.invoke",
        prompt: "Invoke agents_list",
        modelRef: "gateway/agents_list",
        maxSteps: 1,
      });

      const approval = await createControlApprovalRequest({
        taskId: task.taskId,
        actionType: "tools.invoke",
        actionTarget: "agents_list",
        payload: { tool: "agents_list" },
      });

      expect(getControlTaskById(task.taskId)?.status).toBe("awaiting_approval");

      const decided = await decideControlApproval({
        approvalId: approval.approvalId,
        decision: "approve",
        actor: "tests",
      });
      expect(decided?.status).toBe("approved");
      expect(getControlTaskById(task.taskId)?.status).toBe("queued");

      const consumed = await consumeControlApprovalForInvoke({
        approvalId: approval.approvalId,
        toolName: "agents_list",
      });
      expect(consumed).toEqual({ ok: true, taskId: task.taskId });
      expect(getControlTaskById(task.taskId)?.status).toBe("running");

      const replay = await consumeControlApprovalForInvoke({
        approvalId: approval.approvalId,
        toolName: "agents_list",
      });
      expect(replay).toEqual({ ok: false, reason: "approval_already_consumed" });
    });
  });

  it("blocks paid model calls when budget is exhausted and keeps audit fields", async () => {
    await withTempDir({ prefix: "openclaw-control-budget-" }, async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      await setControlBudgetLimits({
        dailyLimitUsd: 1,
        monthlyLimitUsd: 1,
        cheapestModelRef: "openrouter/qwen/qwen3-30b-a3b:free",
        cheapestModelIsPaid: false,
      });

      await recordControlBudgetSpend({
        costUsd: 1,
        taskId: "task-budget-test",
        prompt: "Initial spend",
        provider: "openai",
        model: "gpt-5.4",
        outcome: "charged",
      });

      const snapshot = getControlBudgetSnapshot();
      expect(snapshot.dailySpentUsd).toBeGreaterThanOrEqual(1);

      const decision = await checkControlBudgetForModel({
        provider: "openai",
        model: "gpt-5.4",
        isPaid: true,
        estimatedCostUsd: 0.01,
        prompt: "Generate cover letter",
        taskId: "task-budget-test",
      });

      expect(decision.allowed).toBe(true);
      expect(decision.downgradeToModelRef).toBe("openrouter/qwen/qwen3-30b-a3b:free");

      const auditPath = resolveControlLayerAuditPath(process.env);
      const auditLines = readFileSync(auditPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const budgetCheck = auditLines.find(
        (entry) => entry.event === "budget.check" && entry.outcome === "downgrade_to_cheapest",
      );
      expect(budgetCheck).toMatchObject({
        prompt: "Generate cover letter",
        model: "openai/gpt-5.4",
        costUsd: 0.01,
        outcome: "downgrade_to_cheapest",
      });
    });
  });
});
