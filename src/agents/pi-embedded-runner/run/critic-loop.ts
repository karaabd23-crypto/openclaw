import type {
  EmbeddedPiCriticLoopTrigger,
  EmbeddedPiCriticTaskKind,
} from "../../../config/types.agent-defaults.js";
import type { ResolvedEmbeddedPiCriticLoopConfig } from "../../agent-scope.js";

export type CriticLoopProblem = {
  code: string;
  message: string;
  risk: "low" | "medium" | "high";
};

export type CriticPlannerOutput = {
  goal: string;
  task_under_review: string;
  steps: Array<{
    step_id: string;
    title: string;
    description: string;
    expected_evidence: string[];
    status: "pending" | "in_progress" | "done";
  }>;
  risks: string[];
  constraints: string[];
  acceptance_criteria: string[];
};

export type CriticWorkerStepResult = {
  task_under_review: string;
  step_id: string;
  actions_taken: string[];
  files_changed: string[];
  commands_run: string[];
  artifacts: string[];
  claims: string[];
  uncertainties: string[];
  suggested_next_step: string;
  worker_claim: string;
  summary: string;
  evidence_collected: string[];
  validations_run: string[];
  validations_passed: string[];
  had_errors: boolean;
};

export type CriticCommandOutput = {
  command: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};

export type CriticValidationResult = {
  name: string;
  command?: string;
  passed: boolean;
  stdout?: string;
  stderr?: string;
};

export type CriticAttemptEvidence = {
  assistantTextChars: number;
  payloadCount: number;
  toolCalls: number;
  toolNames?: string[];
  filesChanged?: string[];
  fileDiffs?: string[];
  commandOutputs?: CriticCommandOutput[];
  validationResults?: CriticValidationResult[];
  toolErrors: number;
  aborted: boolean;
  timedOut: boolean;
  promptError: boolean;
  promptErrorSource: "prompt" | "compaction" | "precheck" | null;
  incompleteTurn: boolean;
  stopReason?: string;
};

export type CriticReviewOutput = {
  task_under_review: string;
  step_id: string;
  worker_claim: string;
  evidence_checked: string[];
  problems_found: CriticLoopProblem[];
  missing_evidence: string[];
  risk_level: "low" | "medium" | "high";
  verdict: "pass" | "revise" | "stop";
  revision_instructions: string[];
  confidence: number;
};

export type CriticControllerDecision = {
  current_step_id: string;
  decision: "complete" | "continue" | "retry" | "stop";
  next_action: string;
  task_under_review: string;
  step_id: string;
  review_verdict: "pass" | "revise" | "stop";
  action: "complete" | "continue" | "retry" | "escalate";
  approved_completion: boolean;
  retry_count: number;
  max_retries: number;
  reason: string;
};

const DEFAULT_STEP_ID = "step-1";

type CriticValidationKey =
  | "attempt.executed"
  | "evidence.present"
  | "runtime.errors"
  | "validation.commands";

export function shouldRunCriticLoop(params: {
  criticConfig: ResolvedEmbeddedPiCriticLoopConfig;
  trigger?: EmbeddedPiCriticLoopTrigger;
  taskKind?: EmbeddedPiCriticTaskKind;
}): boolean {
  if (!params.criticConfig.enabled) {
    return false;
  }
  if (!params.criticConfig.runOnTriggers || params.criticConfig.runOnTriggers.length === 0) {
    return true;
  }
  if (!params.trigger) {
    return false;
  }
  if (!params.criticConfig.runOnTriggers.includes(params.trigger)) {
    return false;
  }
  if (!params.criticConfig.runOnTaskKinds || params.criticConfig.runOnTaskKinds.length === 0) {
    return true;
  }
  if (!params.taskKind) {
    return false;
  }
  return params.criticConfig.runOnTaskKinds.includes(params.taskKind);
}

export function inferCriticTaskKind(task: string): EmbeddedPiCriticTaskKind {
  const normalized = task.toLowerCase();
  if (
    /code|typescript|javascript|ts\b|fix|refactor|implement|test|lint|build|compile|function|class|module/.test(
      normalized,
    )
  ) {
    return "code_changes";
  }
  if (/seo|meta description|keyword|search ranking|serp/.test(normalized)) {
    return "seo_changes";
  }
  if (/website|web page|landing page|ui|frontend|css|html/.test(normalized)) {
    return "website_edits";
  }
  if (/workflow|automation|cron|pipeline|script|integration/.test(normalized)) {
    return "workflow_automation";
  }
  if (/content|blog|article|copy|newsletter|marketing/.test(normalized)) {
    return "content_generation";
  }
  return "general";
}

export function createPlannerOutput(params: {
  task: string;
  taskKind?: EmbeddedPiCriticTaskKind;
  stepTitle?: string;
}): CriticPlannerOutput {
  const normalizedTask = params.task.trim() || "Complete the requested task";
  const taskKind = params.taskKind ?? inferCriticTaskKind(normalizedTask);
  const steps = buildPlannerSteps({ taskKind, fallbackTitle: params.stepTitle?.trim() });
  return {
    goal: normalizedTask,
    task_under_review: normalizedTask,
    steps,
    risks: ["Unsupported completion claims", "Regression risk without validation evidence"],
    constraints: [
      "Worker cannot self-approve",
      "Completion requires evidence and controller approval",
      "Retry count is capped",
    ],
    acceptance_criteria: [
      "Evidence collected for the step",
      "Required validations executed",
      "Critic verdict is pass",
      "No unresolved high-risk issue",
    ],
  };
}

export function buildWorkerStepResult(params: {
  task: string;
  taskKind?: EmbeddedPiCriticTaskKind;
  requireValidation?: boolean;
  stepId?: string;
  workerClaim: string;
  summary: string;
  evidence: CriticAttemptEvidence;
}): CriticWorkerStepResult {
  const taskKind = params.taskKind ?? inferCriticTaskKind(params.task);
  const toolNames = params.evidence.toolNames ?? [];
  const filesChanged = normalizeEvidenceList(params.evidence.filesChanged);
  const fileDiffs = normalizeEvidenceList(params.evidence.fileDiffs);
  const commandOutputs = params.evidence.commandOutputs ?? [];
  const validationResults = params.evidence.validationResults ?? [];
  const validationSummaries = validationResults.map((entry) => formatValidationResult(entry));
  const commandSummaries = commandOutputs.map((entry) => formatCommandOutput(entry));
  const hasExplicitValidationOutput = validationResults.length > 0;
  const evidenceCollected = [
    "task_kind:" + taskKind,
    "assistant_payloads:" + params.evidence.payloadCount,
    "assistant_text_chars:" + params.evidence.assistantTextChars,
    ...(filesChanged.length > 0 ? ["files_changed:" + filesChanged.join(",")] : []),
    ...(fileDiffs.length > 0 ? ["file_diffs:" + fileDiffs.join(" || ")] : []),
    ...(commandSummaries.length > 0 ? ["command_outputs:" + commandSummaries.join(" || ")] : []),
    ...(validationSummaries.length > 0
      ? ["validation_results:" + validationSummaries.join(" || ")]
      : []),
    "tool_errors:" + params.evidence.toolErrors,
    "prompt_error:" + (params.evidence.promptError ? "yes" : "no"),
    "timed_out:" + (params.evidence.timedOut ? "yes" : "no"),
    "aborted:" + (params.evidence.aborted ? "yes" : "no"),
    ...(params.evidence.stopReason ? ["stop_reason:" + params.evidence.stopReason] : []),
  ];
  const validationsRun = resolveRequiredValidations(taskKind, params.requireValidation !== false);
  const validationsPassed = [
    ...(validationsRun.includes("attempt.executed") ? ["attempt.executed"] : []),
    ...(validationsRun.includes("evidence.present") && hasEvidence(params.evidence)
      ? ["evidence.present"]
      : []),
    ...(params.evidence.promptError || params.evidence.timedOut || params.evidence.aborted
      ? []
      : validationsRun.includes("runtime.errors")
        ? ["runtime.errors"]
        : []),
    ...(validationsRun.includes("validation.commands") &&
    hasExplicitValidationOutput &&
    validationResults.every((entry) => entry.passed)
      ? ["validation.commands"]
      : []),
  ];

  return {
    task_under_review: params.task,
    step_id: params.stepId ?? DEFAULT_STEP_ID,
    actions_taken: toolNames.length > 0 ? toolNames.map((name) => "invoked:" + name) : [],
    files_changed: filesChanged,
    commands_run: commandOutputs
      .map((entry) => entry.command)
      .filter((entry) => entry.trim().length > 0),
    artifacts: [...fileDiffs, ...commandSummaries, ...validationSummaries],
    claims: params.workerClaim.trim().length > 0 ? [params.workerClaim.trim()] : [],
    uncertainties: [
      ...(params.evidence.timedOut ? ["run_timed_out"] : []),
      ...(params.evidence.aborted ? ["run_aborted"] : []),
      ...(params.evidence.promptError ? ["prompt_error"] : []),
    ],
    suggested_next_step:
      validationsPassed.length < validationsRun.length
        ? "Run missing validations and provide concrete evidence for this step."
        : "Proceed to the next planned step with evidence capture.",
    worker_claim: params.workerClaim,
    summary: params.summary,
    evidence_collected: evidenceCollected,
    validations_run: validationsRun,
    validations_passed: validationsPassed,
    had_errors:
      params.evidence.promptError ||
      params.evidence.timedOut ||
      params.evidence.aborted ||
      params.evidence.toolErrors > 0 ||
      commandOutputs.some((entry) => typeof entry.exitCode === "number" && entry.exitCode !== 0) ||
      validationResults.some((entry) => !entry.passed),
  };
}

export function buildCriticReview(params: {
  worker: CriticWorkerStepResult;
  evidence: CriticAttemptEvidence;
}): CriticReviewOutput {
  const problems: CriticLoopProblem[] = [];
  const missingEvidence: string[] = [];

  if (params.evidence.aborted || params.evidence.timedOut) {
    problems.push({
      code: "runtime_aborted_or_timed_out",
      message: "Step did not complete because the run aborted or timed out.",
      risk: "high",
    });
  }

  if (params.evidence.promptError) {
    problems.push({
      code: "prompt_error",
      message:
        "Prompt attempt failed at " + (params.evidence.promptErrorSource ?? "unknown") + " stage.",
      risk: params.evidence.promptErrorSource === "precheck" ? "medium" : "high",
    });
  }

  if (params.evidence.toolErrors > 0) {
    problems.push({
      code: "tool_errors",
      message: "Worker encountered " + params.evidence.toolErrors + " tool error(s).",
      risk: "medium",
    });
  }

  if (!hasEvidence(params.evidence)) {
    missingEvidence.push("worker did not provide sufficient execution evidence");
    problems.push({
      code: "missing_evidence",
      message: "Worker did not produce sufficient evidence for this step.",
      risk: "medium",
    });
  }

  if (
    (params.worker.validations_run.includes("validation.commands") &&
      params.evidence.validationResults?.length === 0) ||
    (isCodeTask(params.worker) && params.evidence.validationResults?.length === 0)
  ) {
    missingEvidence.push("missing_validation_output");
    problems.push({
      code: "missing_validations",
      message: "Code tasks require real validation output before completion.",
      risk: "high",
    });
  }

  if (params.evidence.incompleteTurn) {
    problems.push({
      code: "incomplete_turn",
      message: "Run ended without a complete answer for the current step.",
      risk: "medium",
    });
  }

  const requiredValidations = params.worker.validations_run;
  const missingValidations = requiredValidations.filter(
    (entry) => !params.worker.validations_passed.includes(entry),
  );
  if (missingValidations.length > 0) {
    missingEvidence.push(...missingValidations.map((entry) => "missing_validation:" + entry));
    problems.push({
      code: "missing_validations",
      message: "Missing required validations: " + missingValidations.join(", ") + ".",
      risk:
        missingValidations.includes("validation.commands") && isCodeTask(params.worker)
          ? "high"
          : missingValidations.includes("validation.commands")
            ? "medium"
            : "medium",
    });
  }

  const riskLevel: CriticReviewOutput["risk_level"] = problems.some(
    (problem) => problem.risk === "high",
  )
    ? "high"
    : problems.length > 0
      ? "medium"
      : "low";

  const verdict: CriticReviewOutput["verdict"] =
    riskLevel === "high" ? "stop" : problems.length > 0 ? "revise" : "pass";

  return {
    task_under_review: params.worker.task_under_review,
    step_id: params.worker.step_id,
    worker_claim: params.worker.worker_claim,
    evidence_checked: [...params.worker.evidence_collected],
    problems_found: problems,
    missing_evidence: missingEvidence,
    risk_level: riskLevel,
    verdict,
    revision_instructions: buildRevisionInstructions(problems),
    confidence: resolveReviewConfidence({ verdict, problems }),
  };
}

export function parseCriticReviewCandidate(candidate: unknown): CriticReviewOutput | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const value = candidate as Record<string, unknown>;
  if (
    typeof value.task_under_review !== "string" ||
    typeof value.step_id !== "string" ||
    typeof value.worker_claim !== "string" ||
    !Array.isArray(value.evidence_checked) ||
    !Array.isArray(value.problems_found) ||
    !Array.isArray(value.missing_evidence) ||
    typeof value.risk_level !== "string" ||
    typeof value.verdict !== "string" ||
    !Array.isArray(value.revision_instructions) ||
    typeof value.confidence !== "number"
  ) {
    return null;
  }
  if (!isRiskLevel(value.risk_level) || !isVerdict(value.verdict)) {
    return null;
  }
  if (value.confidence < 0 || value.confidence > 1) {
    return null;
  }

  const problemsFound: CriticLoopProblem[] = [];
  for (const item of value.problems_found) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const problem = item as Record<string, unknown>;
    if (
      typeof problem.code !== "string" ||
      typeof problem.message !== "string" ||
      typeof problem.risk !== "string" ||
      !isRiskLevel(problem.risk)
    ) {
      return null;
    }
    problemsFound.push({
      code: problem.code,
      message: problem.message,
      risk: problem.risk,
    });
  }

  return {
    task_under_review: value.task_under_review,
    step_id: value.step_id,
    worker_claim: value.worker_claim,
    evidence_checked: value.evidence_checked.filter(
      (entry): entry is string => typeof entry === "string",
    ),
    problems_found: problemsFound,
    missing_evidence: value.missing_evidence.filter(
      (entry): entry is string => typeof entry === "string",
    ),
    risk_level: value.risk_level,
    verdict: value.verdict,
    revision_instructions: value.revision_instructions.filter(
      (entry): entry is string => typeof entry === "string",
    ),
    confidence: value.confidence,
  };
}

export function decideCriticControllerAction(params: {
  review: CriticReviewOutput | null;
  worker: CriticWorkerStepResult;
  retryCount: number;
  maxRetries: number;
  finalCandidate: boolean;
}): CriticControllerDecision {
  if (!params.review) {
    return {
      current_step_id: params.worker.step_id,
      decision: "stop",
      next_action: "Escalate to caller with malformed critic output.",
      task_under_review: params.worker.task_under_review,
      step_id: params.worker.step_id,
      review_verdict: "stop",
      action: "escalate",
      approved_completion: false,
      retry_count: params.retryCount,
      max_retries: params.maxRetries,
      reason: "Critic output malformed; escalating for safety.",
    };
  }

  const requiredValidations = params.worker.validations_run;
  const missingValidations = requiredValidations.filter(
    (entry) => !params.worker.validations_passed.includes(entry),
  );
  const hasHighRiskIssue = params.review.problems_found.some((problem) => problem.risk === "high");

  if (params.review.verdict === "pass" && missingValidations.length === 0 && !hasHighRiskIssue) {
    return {
      current_step_id: params.review.step_id,
      decision: params.finalCandidate ? "complete" : "continue",
      next_action: params.finalCandidate
        ? "Mark task complete with controller approval."
        : "Proceed to next step.",
      task_under_review: params.review.task_under_review,
      step_id: params.review.step_id,
      review_verdict: params.review.verdict,
      action: params.finalCandidate ? "complete" : "continue",
      approved_completion: params.finalCandidate,
      retry_count: params.retryCount,
      max_retries: params.maxRetries,
      reason: "Critic passed and hard gates satisfied.",
    };
  }

  if (params.review.verdict === "revise" && params.retryCount < params.maxRetries) {
    return {
      current_step_id: params.review.step_id,
      decision: "retry",
      next_action: "Re-run worker step with critic revision instructions.",
      task_under_review: params.review.task_under_review,
      step_id: params.review.step_id,
      review_verdict: params.review.verdict,
      action: "retry",
      approved_completion: false,
      retry_count: params.retryCount,
      max_retries: params.maxRetries,
      reason:
        missingValidations.length > 0
          ? `Missing required validations: ${missingValidations.join(", ")}.`
          : "Critic requested revision.",
    };
  }

  return {
    current_step_id: params.review.step_id,
    decision: "stop",
    next_action: "Escalate to caller and stop automatic retries.",
    task_under_review: params.review.task_under_review,
    step_id: params.review.step_id,
    review_verdict: params.review.verdict,
    action: "escalate",
    approved_completion: false,
    retry_count: params.retryCount,
    max_retries: params.maxRetries,
    reason:
      params.review.verdict === "stop"
        ? "Critic flagged high-risk issues."
        : "Retry cap reached without a passing critic verdict.",
  };
}

export function buildRevisionSteer(review: CriticReviewOutput): string | null {
  if (review.verdict !== "revise" || review.revision_instructions.length === 0) {
    return null;
  }
  return [
    "Controller revision required for the current step.",
    "Address every item below before claiming completion:",
    ...review.revision_instructions.map((item, index) => `${index + 1}. ${item}`),
    "Return concrete evidence for the revised step.",
  ].join("\n");
}

export function buildControllerDebrief(params: {
  planner?: CriticPlannerOutput;
  worker: CriticWorkerStepResult;
  review: CriticReviewOutput | null;
  controller: CriticControllerDecision;
}): string {
  const lines: string[] = [];
  const goal = params.planner?.goal || params.worker.task_under_review;
  lines.push("Goal: " + goal);
  lines.push("Step: " + params.worker.step_id);

  const claim = params.worker.claims[0] || params.worker.worker_claim;
  if (claim.trim().length > 0) {
    lines.push("Worker claim: " + claim);
  }

  const evidenceSlice = params.worker.evidence_collected.slice(0, 6);
  if (evidenceSlice.length > 0) {
    lines.push("Evidence: " + evidenceSlice.join("; "));
  }

  const commands = params.worker.commands_run.slice(0, 3);
  if (commands.length > 0) {
    lines.push("Commands/tools: " + commands.join(", "));
  }

  if (params.worker.files_changed.length > 0) {
    lines.push("Files changed: " + params.worker.files_changed.slice(0, 4).join(", "));
  }

  if (params.worker.artifacts.length > 0) {
    lines.push("Artifacts: " + params.worker.artifacts.slice(0, 3).join(" | "));
  }

  const missingValidations = params.worker.validations_run.filter(
    (value) => !params.worker.validations_passed.includes(value),
  );
  if (missingValidations.length > 0) {
    lines.push("Missing validations: " + missingValidations.join(", "));
  }

  if (params.review) {
    lines.push(
      "Critic verdict: " +
        params.review.verdict +
        " (risk=" +
        params.review.risk_level +
        ", confidence=" +
        params.review.confidence.toFixed(2) +
        ")",
    );
    if (params.review.problems_found.length > 0) {
      const topProblems = params.review.problems_found
        .slice(0, 3)
        .map((problem) => problem.code + ":" + problem.message);
      lines.push("Problems: " + topProblems.join(" | "));
    }
    if (params.review.missing_evidence.length > 0) {
      lines.push("Missing evidence: " + params.review.missing_evidence.slice(0, 3).join(", "));
    }
  } else {
    lines.push("Critic verdict: malformed output");
  }

  lines.push("Controller outcome: " + params.controller.action);
  lines.push("Controller decision: " + params.controller.decision);
  lines.push("Reason: " + params.controller.reason);
  lines.push("Next action: " + params.controller.next_action);

  return lines.join("\n");
}

function hasEvidence(evidence: CriticAttemptEvidence): boolean {
  return (
    (evidence.filesChanged?.length ?? 0) > 0 ||
    (evidence.fileDiffs?.length ?? 0) > 0 ||
    (evidence.commandOutputs?.length ?? 0) > 0 ||
    (evidence.validationResults?.length ?? 0) > 0
  );
}

function buildRevisionInstructions(problems: CriticLoopProblem[]): string[] {
  if (problems.length === 0) {
    return [];
  }
  const deduped = new Set<string>();
  for (const problem of problems) {
    if (problem.code === "missing_evidence") {
      deduped.add("Collect concrete evidence (tool output, patch summary, or validation output).");
      continue;
    }
    if (problem.code === "tool_errors") {
      deduped.add("Fix tool errors before marking the step complete.");
      continue;
    }
    if (problem.code === "missing_validations") {
      deduped.add("Run and capture required validations before claiming completion.");
      continue;
    }
    if (problem.code === "incomplete_turn") {
      deduped.add("Provide a complete step result with explicit completion evidence.");
      continue;
    }
    if (problem.code === "prompt_error") {
      deduped.add("Recover from prompt/runtime failure and rerun the step safely.");
      continue;
    }
    if (problem.code === "runtime_aborted_or_timed_out") {
      deduped.add(
        "Rerun with successful completion; aborted or timed-out runs are not acceptable evidence.",
      );
      continue;
    }
    deduped.add(problem.message);
  }
  return [...deduped].map((value) => value.trim());
}

function normalizeEvidenceList(values?: string[]): string[] {
  return (values ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function formatCommandOutput(entry: CriticCommandOutput): string {
  const parts = [entry.command.trim()];
  if (typeof entry.exitCode === "number") {
    parts.push("exit=" + entry.exitCode);
  }
  if (entry.stdout?.trim()) {
    parts.push("stdout=" + compactEvidenceText(entry.stdout));
  }
  if (entry.stderr?.trim()) {
    parts.push("stderr=" + compactEvidenceText(entry.stderr));
  }
  return parts.join("; ");
}

function formatValidationResult(entry: CriticValidationResult): string {
  const parts = [entry.name.trim() + ":" + (entry.passed ? "passed" : "failed")];
  if (entry.command?.trim()) {
    parts.push("command=" + entry.command.trim());
  }
  if (entry.stdout?.trim()) {
    parts.push("stdout=" + compactEvidenceText(entry.stdout));
  }
  if (entry.stderr?.trim()) {
    parts.push("stderr=" + compactEvidenceText(entry.stderr));
  }
  return parts.join("; ");
}

function compactEvidenceText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? normalized.slice(0, 117) + "..." : normalized;
}

function isCodeTask(worker: CriticWorkerStepResult): boolean {
  return /code|test|build|lint|compile|refactor|typescript|javascript|bug/i.test(
    worker.task_under_review,
  );
}

function resolveReviewConfidence(params: {
  verdict: CriticReviewOutput["verdict"];
  problems: CriticLoopProblem[];
}): number {
  if (params.verdict === "pass") {
    return 0.92;
  }
  if (params.problems.some((problem) => problem.risk === "high")) {
    return 0.88;
  }
  return 0.74;
}

function isRiskLevel(value: string): value is CriticReviewOutput["risk_level"] {
  return value === "low" || value === "medium" || value === "high";
}

function isVerdict(value: string): value is CriticReviewOutput["verdict"] {
  return value === "pass" || value === "revise" || value === "stop";
}

function resolveRequiredValidations(
  taskKind: EmbeddedPiCriticTaskKind,
  requireValidation: boolean,
): CriticValidationKey[] {
  const base: CriticValidationKey[] = ["attempt.executed", "evidence.present", "runtime.errors"];
  if (taskKind !== "code_changes" && !requireValidation) {
    return base;
  }
  if (taskKind === "code_changes") {
    return [...base, "validation.commands"];
  }
  if (taskKind === "website_edits" || taskKind === "seo_changes") {
    return [...base, "validation.commands"];
  }
  return base;
}

function buildPlannerSteps(params: {
  taskKind: EmbeddedPiCriticTaskKind;
  fallbackTitle?: string;
}): CriticPlannerOutput["steps"] {
  const stepTitles =
    params.taskKind === "code_changes"
      ? [
          "Implement the smallest safe code change",
          "Run validation commands relevant to touched scope",
          "Summarize evidence and risks",
        ]
      : params.taskKind === "website_edits" || params.taskKind === "seo_changes"
        ? [
            "Apply focused website/content changes",
            "Verify rendered output and check for regressions",
            "Summarize observable evidence",
          ]
        : params.taskKind === "workflow_automation"
          ? [
              "Implement the automation update",
              "Run a safe execution proof",
              "Summarize evidence and failure modes",
            ]
          : params.taskKind === "content_generation"
            ? [
                "Draft targeted content",
                "Verify constraints and acceptance criteria",
                "Summarize evidence-backed final copy",
              ]
            : [params.fallbackTitle || "Produce evidence-backed progress"];

  return stepTitles.map((title, index) => {
    const stepId = index === 0 ? DEFAULT_STEP_ID : `step-${index + 1}`;
    return {
      step_id: stepId,
      title,
      description: title,
      expected_evidence:
        index === 0
          ? ["tool output or concrete artifact", "step-focused summary"]
          : ["validation output", "explicit risk/acceptance check"],
      status: index === 0 ? "in_progress" : "pending",
    };
  });
}
