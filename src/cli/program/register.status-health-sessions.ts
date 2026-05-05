import type { Command } from "commander";
import { flowsCancelCommand, flowsListCommand, flowsShowCommand } from "../../commands/flows.js";
import { healthCommand } from "../../commands/health.js";
import { sessionsCleanupCommand } from "../../commands/sessions-cleanup.js";
import { sessionsCommand } from "../../commands/sessions.js";
import { statusCommand } from "../../commands/status.js";
import {
  tasksControlApprovalDecideCommand,
  tasksControlApprovalListCommand,
  tasksControlApprovalRequestCommand,
  tasksControlApprovalShowCommand,
  tasksControlBudgetCheckCommand,
  tasksControlBudgetSetCommand,
  tasksControlBudgetShowCommand,
  tasksControlBudgetSpendCommand,
  tasksControlCreateCommand,
  tasksControlListCommand,
  tasksControlShowCommand,
  tasksControlStatusCommand,
} from "../../commands/tasks-control.js";
import {
  tasksAuditCommand,
  tasksCancelCommand,
  tasksListCommand,
  tasksMaintenanceCommand,
  tasksNotifyCommand,
  tasksShowCommand,
} from "../../commands/tasks.js";
import { setVerbose } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";
import { parsePositiveIntOrUndefined } from "./helpers.js";

function resolveVerbose(opts: { verbose?: boolean; debug?: boolean }): boolean {
  return Boolean(opts.verbose || opts.debug);
}

function parseTimeoutMs(timeout: unknown): number | null | undefined {
  const parsed = parsePositiveIntOrUndefined(timeout);
  if (timeout !== undefined && parsed === undefined) {
    defaultRuntime.error("--timeout must be a positive integer (milliseconds)");
    defaultRuntime.exit(1);
    return null;
  }
  return parsed;
}

async function runWithVerboseAndTimeout(
  opts: { verbose?: boolean; debug?: boolean; timeout?: unknown },
  action: (params: { verbose: boolean; timeoutMs: number | undefined }) => Promise<void>,
): Promise<void> {
  const verbose = resolveVerbose(opts);
  setVerbose(verbose);
  const timeoutMs = parseTimeoutMs(opts.timeout);
  if (timeoutMs === null) {
    return;
  }
  await runCommandWithRuntime(defaultRuntime, async () => {
    await action({ verbose, timeoutMs });
  });
}

export function registerStatusHealthSessionsCommands(program: Command) {
  program
    .command("status")
    .description("Show channel health and recent session recipients")
    .option("--json", "Output JSON instead of text", false)
    .option("--all", "Full diagnosis (read-only, pasteable)", false)
    .option("--usage", "Show model provider usage/quota snapshots", false)
    .option("--deep", "Probe channels (WhatsApp Web + Telegram + Discord + Slack + Signal)", false)
    .option("--timeout <ms>", "Probe timeout in milliseconds", "10000")
    .option("--verbose", "Verbose logging", false)
    .option("--debug", "Alias for --verbose", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw status", "Show channel health + session summary."],
          ["openclaw status --all", "Full diagnosis (read-only)."],
          ["openclaw status --json", "Machine-readable output."],
          ["openclaw status --usage", "Show model provider usage/quota snapshots."],
          [
            "openclaw status --deep",
            "Run channel probes (WA + Telegram + Discord + Slack + Signal).",
          ],
          ["openclaw status --deep --timeout 5000", "Tighten probe timeout."],
        ])}`,
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/status", "docs.openclaw.ai/cli/status")}\n`,
    )
    .action(async (opts) => {
      await runWithVerboseAndTimeout(opts, async ({ verbose, timeoutMs }) => {
        await statusCommand(
          {
            json: Boolean(opts.json),
            all: Boolean(opts.all),
            deep: Boolean(opts.deep),
            usage: Boolean(opts.usage),
            timeoutMs,
            verbose,
          },
          defaultRuntime,
        );
      });
    });

  program
    .command("health")
    .description("Fetch health from the running gateway")
    .option("--json", "Output JSON instead of text", false)
    .option("--timeout <ms>", "Connection timeout in milliseconds", "10000")
    .option("--verbose", "Verbose logging", false)
    .option("--debug", "Alias for --verbose", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/health", "docs.openclaw.ai/cli/health")}\n`,
    )
    .action(async (opts) => {
      await runWithVerboseAndTimeout(opts, async ({ verbose, timeoutMs }) => {
        await healthCommand(
          {
            json: Boolean(opts.json),
            timeoutMs,
            verbose,
          },
          defaultRuntime,
        );
      });
    });

  const sessionsCmd = program
    .command("sessions")
    .description("List stored conversation sessions")
    .option("--json", "Output as JSON", false)
    .option("--verbose", "Verbose logging", false)
    .option("--store <path>", "Path to session store (default: resolved from config)")
    .option("--agent <id>", "Agent id to inspect (default: configured default agent)")
    .option("--all-agents", "Aggregate sessions across all configured agents", false)
    .option("--active <minutes>", "Only show sessions updated within the past N minutes")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw sessions", "List all sessions."],
          ["openclaw sessions --agent work", "List sessions for one agent."],
          ["openclaw sessions --all-agents", "Aggregate sessions across agents."],
          ["openclaw sessions --active 120", "Only last 2 hours."],
          ["openclaw sessions --json", "Machine-readable output."],
          ["openclaw sessions --store ./tmp/sessions.json", "Use a specific session store."],
        ])}\n\n${theme.muted(
          "Shows token usage per session when the agent reports it; set agents.defaults.contextTokens to cap the window and show %.",
        )}`,
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/sessions", "docs.openclaw.ai/cli/sessions")}\n`,
    )
    .action(async (opts) => {
      setVerbose(Boolean(opts.verbose));
      await sessionsCommand(
        {
          json: Boolean(opts.json),
          store: opts.store as string | undefined,
          agent: opts.agent as string | undefined,
          allAgents: Boolean(opts.allAgents),
          active: opts.active as string | undefined,
        },
        defaultRuntime,
      );
    });
  sessionsCmd.enablePositionalOptions();

  sessionsCmd
    .command("cleanup")
    .description("Run session-store maintenance now")
    .option("--store <path>", "Path to session store (default: resolved from config)")
    .option("--agent <id>", "Agent id to maintain (default: configured default agent)")
    .option("--all-agents", "Run maintenance across all configured agents", false)
    .option("--dry-run", "Preview maintenance actions without writing", false)
    .option("--enforce", "Apply maintenance even when configured mode is warn", false)
    .option(
      "--fix-missing",
      "Remove store entries whose transcript files are missing (bypasses age/count retention)",
      false,
    )
    .option("--active-key <key>", "Protect this session key from budget-eviction")
    .option("--json", "Output JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw sessions cleanup --dry-run", "Preview stale/cap cleanup."],
          [
            "openclaw sessions cleanup --dry-run --fix-missing",
            "Also preview pruning entries with missing transcript files.",
          ],
          ["openclaw sessions cleanup --enforce", "Apply maintenance now."],
          ["openclaw sessions cleanup --agent work --dry-run", "Preview one agent store."],
          ["openclaw sessions cleanup --all-agents --dry-run", "Preview all agent stores."],
          [
            "openclaw sessions cleanup --enforce --store ./tmp/sessions.json",
            "Use a specific store.",
          ],
        ])}`,
    )
    .action(async (opts, command) => {
      const parentOpts = command.parent?.opts() as
        | {
            store?: string;
            agent?: string;
            allAgents?: boolean;
            json?: boolean;
          }
        | undefined;
      await runCommandWithRuntime(defaultRuntime, async () => {
        await sessionsCleanupCommand(
          {
            store: (opts.store as string | undefined) ?? parentOpts?.store,
            agent: (opts.agent as string | undefined) ?? parentOpts?.agent,
            allAgents: Boolean(opts.allAgents || parentOpts?.allAgents),
            dryRun: Boolean(opts.dryRun),
            enforce: Boolean(opts.enforce),
            fixMissing: Boolean(opts.fixMissing),
            activeKey: opts.activeKey as string | undefined,
            json: Boolean(opts.json || parentOpts?.json),
          },
          defaultRuntime,
        );
      });
    });

  const tasksCmd = program
    .command("tasks")
    .description("Inspect durable background tasks and TaskFlow state")
    .option("--json", "Output as JSON", false)
    .option("--runtime <name>", "Filter by kind (subagent, acp, cron, cli)")
    .option(
      "--status <name>",
      "Filter by status (queued, running, succeeded, failed, timed_out, cancelled, lost)",
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksListCommand(
          {
            json: Boolean(opts.json),
            runtime: opts.runtime as string | undefined,
            status: opts.status as string | undefined,
          },
          defaultRuntime,
        );
      });
    });
  tasksCmd.enablePositionalOptions();

  tasksCmd
    .command("list")
    .description("List tracked background tasks")
    .option("--json", "Output as JSON", false)
    .option("--runtime <name>", "Filter by kind (subagent, acp, cron, cli)")
    .option(
      "--status <name>",
      "Filter by status (queued, running, succeeded, failed, timed_out, cancelled, lost)",
    )
    .action(async (opts, command) => {
      const parentOpts = command.parent?.opts() as
        | {
            json?: boolean;
            runtime?: string;
            status?: string;
          }
        | undefined;
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksListCommand(
          {
            json: Boolean(opts.json || parentOpts?.json),
            runtime: (opts.runtime as string | undefined) ?? parentOpts?.runtime,
            status: (opts.status as string | undefined) ?? parentOpts?.status,
          },
          defaultRuntime,
        );
      });
    });

  tasksCmd
    .command("audit")
    .description("Show stale or broken background tasks and TaskFlows")
    .option("--json", "Output as JSON", false)
    .option("--severity <level>", "Filter by severity (warn, error)")
    .option(
      "--code <name>",
      "Filter by finding code (stale_queued, stale_running, lost, delivery_failed, missing_cleanup, inconsistent_timestamps, restore_failed, stale_waiting, stale_blocked, cancel_stuck, missing_linked_tasks, blocked_task_missing)",
    )
    .option("--limit <n>", "Limit displayed findings")
    .action(async (opts, command) => {
      const parentOpts = command.parent?.opts() as { json?: boolean } | undefined;
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksAuditCommand(
          {
            json: Boolean(opts.json || parentOpts?.json),
            severity: opts.severity as "warn" | "error" | undefined,
            code: opts.code as
              | "stale_queued"
              | "stale_running"
              | "lost"
              | "delivery_failed"
              | "missing_cleanup"
              | "inconsistent_timestamps"
              | "restore_failed"
              | "stale_waiting"
              | "stale_blocked"
              | "cancel_stuck"
              | "missing_linked_tasks"
              | "blocked_task_missing"
              | undefined,
            limit: parsePositiveIntOrUndefined(opts.limit),
          },
          defaultRuntime,
        );
      });
    });

  tasksCmd
    .command("maintenance")
    .description("Preview or apply tasks and TaskFlow maintenance")
    .option("--json", "Output as JSON", false)
    .option("--apply", "Apply reconciliation, cleanup stamping, and pruning", false)
    .action(async (opts, command) => {
      const parentOpts = command.parent?.opts() as { json?: boolean } | undefined;
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksMaintenanceCommand(
          {
            json: Boolean(opts.json || parentOpts?.json),
            apply: Boolean(opts.apply),
          },
          defaultRuntime,
        );
      });
    });

  tasksCmd
    .command("show")
    .description("Show one background task by task id, run id, or session key")
    .argument("<lookup>", "Task id, run id, or session key")
    .option("--json", "Output as JSON", false)
    .action(async (lookup, opts, command) => {
      const parentOpts = command.parent?.opts() as { json?: boolean } | undefined;
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksShowCommand(
          {
            lookup,
            json: Boolean(opts.json || parentOpts?.json),
          },
          defaultRuntime,
        );
      });
    });

  tasksCmd
    .command("notify")
    .description("Set task notify policy")
    .argument("<lookup>", "Task id, run id, or session key")
    .argument("<notify>", "Notify policy (done_only, state_changes, silent)")
    .action(async (lookup, notify) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksNotifyCommand(
          {
            lookup,
            notify: notify as "done_only" | "state_changes" | "silent",
          },
          defaultRuntime,
        );
      });
    });

  tasksCmd
    .command("cancel")
    .description("Cancel a running background task")
    .argument("<lookup>", "Task id, run id, or session key")
    .action(async (lookup) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksCancelCommand(
          {
            lookup,
          },
          defaultRuntime,
        );
      });
    });

  const tasksControlCmd = tasksCmd
    .command("control")
    .description("Minimal control layer (task lifecycle, approvals, budget, and auditability)");

  tasksControlCmd
    .command("create")
    .description("Create a minimal control task")
    .option("--json", "Output JSON", false)
    .option("--type <name>", "Task type", "general")
    .option("--prompt <text>", "Prompt text to record")
    .option("--model <ref>", "Model ref (provider/model)")
    .option("--estimated-cost <usd>", "Estimated cost in USD")
    .option("--max-steps <n>", "Maximum allowed steps", "1")
    .option("--approval-required", "Mark task as requiring approval", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlCreateCommand(
          {
            json: Boolean(opts.json),
            type: opts.type as string | undefined,
            prompt: opts.prompt as string | undefined,
            model: opts.model as string | undefined,
            estimatedCost: opts.estimatedCost as string | undefined,
            maxSteps: opts.maxSteps as string | undefined,
            approvalRequired: Boolean(opts.approvalRequired),
          },
          defaultRuntime,
        );
      });
    });

  tasksControlCmd
    .command("show")
    .description("Show one control task")
    .argument("<taskId>", "Control task id")
    .option("--json", "Output JSON", false)
    .action(async (taskId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlShowCommand(
          {
            json: Boolean(opts.json),
            taskId: taskId as string,
          },
          defaultRuntime,
        );
      });
    });

  tasksControlCmd
    .command("list")
    .description("List control tasks")
    .option("--json", "Output JSON", false)
    .option("--limit <n>", "Maximum rows", "50")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlListCommand(
          {
            json: Boolean(opts.json),
            limit: opts.limit as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  tasksControlCmd
    .command("status")
    .description("Update control task status")
    .argument("<taskId>", "Control task id")
    .argument(
      "<status>",
      "Status (queued, running, paused, awaiting_approval, approved, blocked, rejected, succeeded, failed, cancelled)",
    )
    .option("--json", "Output JSON", false)
    .option("--outcome <text>", "Outcome note")
    .action(async (taskId, status, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlStatusCommand(
          {
            json: Boolean(opts.json),
            taskId: taskId as string,
            status: status as string,
            outcome: opts.outcome as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  const tasksControlApprovalCmd = tasksControlCmd
    .command("approval")
    .description("Manage explicit approval requests");

  tasksControlApprovalCmd
    .command("request")
    .description("Generate an approval request and pause task execution")
    .argument("<taskId>", "Control task id")
    .argument("<actionType>", "Action type (e.g. tools.invoke, email.send)")
    .option("--json", "Output JSON", false)
    .option("--target <value>", "Action target (e.g. tool name)")
    .option("--payload-json <json>", "JSON object payload")
    .action(async (taskId, actionType, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlApprovalRequestCommand(
          {
            json: Boolean(opts.json),
            taskId: taskId as string,
            actionType: actionType as string,
            actionTarget: opts.target as string | undefined,
            payloadJson: opts.payloadJson as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  tasksControlApprovalCmd
    .command("decide")
    .description("Approve or reject a pending request")
    .argument("<approvalId>", "Approval request id")
    .argument("<decision>", "approve | reject")
    .option("--json", "Output JSON", false)
    .option("--actor <name>", "Actor label")
    .action(async (approvalId, decision, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlApprovalDecideCommand(
          {
            json: Boolean(opts.json),
            approvalId: approvalId as string,
            decision: decision as "approve" | "reject",
            actor: opts.actor as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  tasksControlApprovalCmd
    .command("show")
    .description("Show one approval request")
    .argument("<approvalId>", "Approval request id")
    .option("--json", "Output JSON", false)
    .action(async (approvalId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlApprovalShowCommand(
          {
            json: Boolean(opts.json),
            approvalId: approvalId as string,
          },
          defaultRuntime,
        );
      });
    });

  tasksControlApprovalCmd
    .command("list")
    .description("List recent approval requests")
    .option("--json", "Output JSON", false)
    .option("--limit <n>", "Maximum rows", "50")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlApprovalListCommand(
          {
            json: Boolean(opts.json),
            limit: opts.limit as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  const tasksControlBudgetCmd = tasksControlCmd
    .command("budget")
    .description("Hard budget guard controls for model usage");

  tasksControlBudgetCmd
    .command("show")
    .description("Show current budget state")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlBudgetShowCommand(
          {
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  tasksControlBudgetCmd
    .command("set")
    .description("Set daily/monthly budget limits and cheapest fallback model")
    .argument("<daily>", "Daily limit in USD")
    .argument("<monthly>", "Monthly limit in USD")
    .option("--json", "Output JSON", false)
    .option(
      "--cheapest-model <ref>",
      "Fallback model ref used when paid calls are blocked",
      "openrouter/qwen/qwen3-30b-a3b:free",
    )
    .option("--cheapest-model-paid", "Mark fallback model as paid", false)
    .action(async (daily, monthly, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlBudgetSetCommand(
          {
            json: Boolean(opts.json),
            daily: daily as string,
            monthly: monthly as string,
            cheapestModel: opts.cheapestModel as string,
            cheapestModelPaid: Boolean(opts.cheapestModelPaid),
          },
          defaultRuntime,
        );
      });
    });

  tasksControlBudgetCmd
    .command("check")
    .description("Check if a model call is allowed under the current budget")
    .argument("<model>", "Model ref (provider/model or model id)")
    .option("--json", "Output JSON", false)
    .option("--paid", "Treat this model as paid", false)
    .option("--estimated-cost <usd>", "Estimated call cost in USD")
    .option("--prompt <text>", "Prompt text to record in audit log")
    .option("--task-id <id>", "Related control task id")
    .action(async (model, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlBudgetCheckCommand(
          {
            json: Boolean(opts.json),
            model: model as string,
            paid: Boolean(opts.paid),
            estimatedCost: opts.estimatedCost as string | undefined,
            prompt: opts.prompt as string | undefined,
            taskId: opts.taskId as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  tasksControlBudgetCmd
    .command("spend")
    .description("Record spend so hard limits can block further paid calls")
    .argument("<cost>", "Cost in USD")
    .option("--json", "Output JSON", false)
    .option("--task-id <id>", "Related control task id")
    .option("--prompt <text>", "Prompt text to record in audit log")
    .option("--model <ref>", "Model ref (provider/model)")
    .option("--outcome <text>", "Outcome text")
    .action(async (cost, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await tasksControlBudgetSpendCommand(
          {
            json: Boolean(opts.json),
            cost: cost as string,
            taskId: opts.taskId as string | undefined,
            prompt: opts.prompt as string | undefined,
            model: opts.model as string | undefined,
            outcome: opts.outcome as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  const tasksFlowCmd = tasksCmd
    .command("flow")
    .description("Inspect durable TaskFlow state under tasks");

  tasksFlowCmd
    .command("list")
    .description("List tracked TaskFlows")
    .option("--json", "Output as JSON", false)
    .option(
      "--status <name>",
      "Filter by status (queued, running, waiting, blocked, succeeded, failed, cancelled, lost)",
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await flowsListCommand(
          {
            json: Boolean(opts.json),
            status: opts.status as string | undefined,
          },
          defaultRuntime,
        );
      });
    });

  tasksFlowCmd
    .command("show")
    .description("Show one TaskFlow by flow id or owner key")
    .argument("<lookup>", "Flow id or owner key")
    .option("--json", "Output as JSON", false)
    .action(async (lookup, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await flowsShowCommand(
          {
            lookup,
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });

  tasksFlowCmd
    .command("cancel")
    .description("Cancel a running TaskFlow")
    .argument("<lookup>", "Flow id or owner key")
    .action(async (lookup) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await flowsCancelCommand(
          {
            lookup,
          },
          defaultRuntime,
        );
      });
    });
}
