import { describe, expect, it } from "vitest";
import {
  buildControllerDebrief,
  buildCriticReview,
  buildRevisionSteer,
  buildWorkerStepResult,
  createPlannerOutput,
  decideCriticControllerAction,
  inferCriticTaskKind,
  parseCriticReviewCandidate,
  shouldRunCriticLoop,
} from "./critic-loop.js";

function createEvidence(
  overrides?: Partial<Parameters<typeof buildWorkerStepResult>[0]["evidence"]>,
) {
  return {
    assistantTextChars: 180,
    payloadCount: 1,
    toolCalls: 1,
    toolNames: ["exec:pnpm test"],
    filesChanged: ["src/file.ts"],
    fileDiffs: ["diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ a/src/file.ts"],
    commandOutputs: [
      {
        command: "pnpm test src/file.test.ts",
        stdout: "PASS src/file.test.ts",
        exitCode: 0,
      },
    ],
    validationResults: [
      {
        name: "tests",
        command: "pnpm test src/file.test.ts",
        passed: true,
        stdout: "PASS src/file.test.ts",
      },
    ],
    toolErrors: 0,
    aborted: false,
    timedOut: false,
    promptError: false,
    promptErrorSource: null,
    incompleteTurn: false,
    ...overrides,
  };
}

describe("critic-loop", () => {
  it("passes with evidence and complete validations", () => {
    const planner = createPlannerOutput({ task: "Patch failing test", taskKind: "code_changes" });
    const worker = buildWorkerStepResult({
      task: planner.task_under_review,
      workerClaim: "Patched and validated the fix.",
      summary: "Applied patch and collected output.",
      evidence: createEvidence({ toolNames: ["exec:pnpm test src/file.test.ts"] }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({ toolNames: ["exec:pnpm test src/file.test.ts"] }),
    });

    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    expect(review.verdict).toBe("pass");
    expect(decision.action).toBe("complete");
    expect(decision.decision).toBe("complete");
    expect(decision.approved_completion).toBe(true);
    expect(planner.steps.length).toBeGreaterThan(1);
    expect(planner.goal).toBe("Patch failing test");
    expect(worker.commands_run.length).toBeGreaterThan(0);
  });

  it("requests revision when evidence is missing", () => {
    const worker = buildWorkerStepResult({
      task: "Update docs",
      workerClaim: "Done.",
      summary: "Claimed completion.",
      evidence: createEvidence({
        assistantTextChars: 8,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({
        assistantTextChars: 8,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });

    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: false,
    });

    expect(review.verdict).toBe("revise");
    expect(review.problems_found.some((problem) => problem.code === "missing_evidence")).toBe(true);
    expect(review.missing_evidence.length).toBeGreaterThan(0);
    expect(decision.action).toBe("retry");
    expect(decision.decision).toBe("retry");
    expect(buildRevisionSteer(review)).toContain("Controller revision required");
  });

  it("blocks completion when worker claims success without sufficient evidence", () => {
    const worker = buildWorkerStepResult({
      task: "Ship patch",
      workerClaim: "Successfully completed and verified.",
      summary: "No concrete evidence attached.",
      evidence: createEvidence({
        assistantTextChars: 12,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({ assistantTextChars: 12, payloadCount: 0, toolCalls: 0 }),
    });
    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    expect(review.verdict).toBe("revise");
    expect(decision.decision).toBe("retry");
    expect(decision.approved_completion).toBe(false);
  });

  it("supports revise then pass flow across retries", () => {
    const firstWorker = buildWorkerStepResult({
      task: "Draft update copy",
      taskKind: "content_generation",
      workerClaim: "Done.",
      summary: "No evidence yet.",
      evidence: createEvidence({
        assistantTextChars: 9,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const firstReview = buildCriticReview({
      worker: firstWorker,
      evidence: createEvidence({
        assistantTextChars: 9,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const firstDecision = decideCriticControllerAction({
      review: firstReview,
      worker: firstWorker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: false,
    });

    const secondWorker = buildWorkerStepResult({
      task: "Draft update copy",
      taskKind: "content_generation",
      workerClaim: "Patched and ran checks.",
      summary: "Evidence collected.",
      evidence: createEvidence({
        assistantTextChars: 180,
        payloadCount: 1,
        toolCalls: 1,
        toolNames: ["exec:pnpm test src/feature.test.ts"],
        filesChanged: ["src/feature.ts"],
        fileDiffs: ["diff --git a/src/feature.ts b/src/feature.ts"],
        commandOutputs: [
          {
            command: "pnpm test src/feature.test.ts",
            stdout: "PASS src/feature.test.ts",
            exitCode: 0,
          },
        ],
        validationResults: [
          {
            name: "tests",
            command: "pnpm test src/feature.test.ts",
            passed: true,
            stdout: "PASS src/feature.test.ts",
          },
        ],
      }),
    });
    const secondReview = buildCriticReview({
      worker: secondWorker,
      evidence: createEvidence({
        assistantTextChars: 180,
        payloadCount: 1,
        toolCalls: 1,
        toolNames: ["exec:pnpm test src/feature.test.ts"],
        filesChanged: ["src/feature.ts"],
        fileDiffs: ["diff --git a/src/feature.ts b/src/feature.ts"],
        commandOutputs: [
          {
            command: "pnpm test src/feature.test.ts",
            stdout: "PASS src/feature.test.ts",
            exitCode: 0,
          },
        ],
        validationResults: [
          {
            name: "tests",
            command: "pnpm test src/feature.test.ts",
            passed: true,
            stdout: "PASS src/feature.test.ts",
          },
        ],
      }),
    });
    const secondDecision = decideCriticControllerAction({
      review: secondReview,
      worker: secondWorker,
      retryCount: 1,
      maxRetries: 2,
      finalCandidate: true,
    });

    expect(firstDecision.decision).toBe("retry");
    expect(secondReview.verdict).toBe("pass");
    expect(secondDecision.decision).toBe("complete");
    expect(secondDecision.approved_completion).toBe(true);
  });

  it("stops and escalates on high-risk failure", () => {
    const worker = buildWorkerStepResult({
      task: "Run migration",
      workerClaim: "Migration succeeded.",
      summary: "Run timed out.",
      evidence: createEvidence({
        timedOut: true,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({
        timedOut: true,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });

    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    expect(review.verdict).toBe("stop");
    expect(decision.action).toBe("escalate");
    expect(decision.decision).toBe("stop");
  });

  it("treats missing required validation commands as high risk for code tasks", () => {
    const worker = buildWorkerStepResult({
      task: "Implement TypeScript fix",
      taskKind: "code_changes",
      requireValidation: true,
      workerClaim: "Fix complete.",
      summary: "No validation command executed.",
      evidence: createEvidence({
        toolNames: ["exec:git apply"],
        toolCalls: 1,
        filesChanged: ["src/app.ts"],
        fileDiffs: ["diff --git a/src/app.ts b/src/app.ts"],
        commandOutputs: [
          {
            command: "git apply patch.diff",
            stdout: "Applied patch",
            exitCode: 0,
          },
        ],
        validationResults: [],
      }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({
        toolNames: ["exec:git apply"],
        toolCalls: 1,
        filesChanged: ["src/app.ts"],
        fileDiffs: ["diff --git a/src/app.ts b/src/app.ts"],
        commandOutputs: [
          {
            command: "git apply patch.diff",
            stdout: "Applied patch",
            exitCode: 0,
          },
        ],
        validationResults: [],
      }),
    });
    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    expect(review.problems_found.some((entry) => entry.code === "missing_validations")).toBe(true);
    expect(review.risk_level).toBe("high");
    expect(review.verdict).toBe("stop");
    expect(decision.decision).toBe("stop");
    expect(decision.approved_completion).toBe(false);
  });

  it("fails when a worker claims tests passed but provides no validation output", () => {
    const worker = buildWorkerStepResult({
      task: "Implement TypeScript fix",
      taskKind: "code_changes",
      requireValidation: true,
      workerClaim: "Tests passed.",
      summary: "Claim without captured validation output.",
      evidence: createEvidence({
        toolNames: ["exec:pnpm test"],
        toolCalls: 1,
        filesChanged: ["src/index.ts"],
        fileDiffs: ["diff --git a/src/index.ts b/src/index.ts"],
        commandOutputs: [
          {
            command: "pnpm test",
            stdout: "PASS src/index.test.ts",
            exitCode: 0,
          },
        ],
        validationResults: [],
      }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({
        toolNames: ["exec:pnpm test"],
        toolCalls: 1,
        filesChanged: ["src/index.ts"],
        fileDiffs: ["diff --git a/src/index.ts b/src/index.ts"],
        commandOutputs: [
          {
            command: "pnpm test",
            stdout: "PASS src/index.test.ts",
            exitCode: 0,
          },
        ],
        validationResults: [],
      }),
    });
    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    expect(review.verdict).toBe("stop");
    expect(review.risk_level).toBe("high");
    expect(review.problems_found.some((entry) => entry.code === "missing_validations")).toBe(true);
    expect(decision.decision).toBe("stop");
    expect(decision.approved_completion).toBe(false);
  });

  it("enforces retry cap on revise verdict", () => {
    const worker = buildWorkerStepResult({
      task: "Draft update copy",
      taskKind: "content_generation",
      workerClaim: "Refactor done.",
      summary: "No evidence.",
      evidence: createEvidence({
        assistantTextChars: 10,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({
        assistantTextChars: 10,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });

    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 2,
      maxRetries: 2,
      finalCandidate: false,
    });

    expect(review.verdict).toBe("revise");
    expect(decision.action).toBe("escalate");
    expect(decision.decision).toBe("stop");
    expect(decision.reason).toContain("Retry cap reached");
  });

  it("handles malformed critic output safely", () => {
    const worker = buildWorkerStepResult({
      task: "Validate fallback",
      workerClaim: "Done",
      summary: "summary",
      evidence: createEvidence(),
    });
    const parsed = parseCriticReviewCandidate({ verdict: "pass" });
    expect(parsed).toBeNull();

    const decision = decideCriticControllerAction({
      review: parsed,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });
    expect(decision.action).toBe("escalate");
    expect(decision.decision).toBe("stop");
    expect(decision.reason).toContain("malformed");
  });

  it("never self-approves completion when final candidate is false", () => {
    const worker = buildWorkerStepResult({
      task: "Patch failing test",
      workerClaim: "Patched and validated.",
      summary: "All checks green.",
      evidence: createEvidence({ toolNames: ["exec:pnpm test src/file.test.ts"] }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({ toolNames: ["exec:pnpm test src/file.test.ts"] }),
    });
    const decision = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: false,
    });

    expect(review.verdict).toBe("pass");
    expect(decision.decision).toBe("continue");
    expect(decision.approved_completion).toBe(false);
  });

  it("builds concrete controller debrief text", () => {
    const planner = createPlannerOutput({ task: "Patch failing test", taskKind: "code_changes" });
    const worker = buildWorkerStepResult({
      task: planner.task_under_review,
      taskKind: "code_changes",
      workerClaim: "Applied patch but skipped checks.",
      summary: "Need validation.",
      evidence: createEvidence({
        toolNames: ["exec:git apply"],
        filesChanged: ["src/file.ts"],
        fileDiffs: ["diff --git a/src/file.ts b/src/file.ts"],
        commandOutputs: [
          {
            command: "git apply patch.diff",
            stdout: "Applied patch",
            exitCode: 0,
          },
        ],
        validationResults: [],
      }),
    });
    const review = buildCriticReview({
      worker,
      evidence: createEvidence({
        toolNames: ["exec:git apply"],
        filesChanged: ["src/file.ts"],
        fileDiffs: ["diff --git a/src/file.ts b/src/file.ts"],
        commandOutputs: [
          {
            command: "git apply patch.diff",
            stdout: "Applied patch",
            exitCode: 0,
          },
        ],
        validationResults: [],
      }),
    });
    const controller = decideCriticControllerAction({
      review,
      worker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    const debrief = buildControllerDebrief({ planner, worker, review, controller });
    expect(debrief).toContain("Goal: Patch failing test");
    expect(debrief).toContain("Step: step-1");
    expect(debrief).toContain("Commands/tools: git apply patch.diff");
    expect(debrief).toContain("Missing validations:");
    expect(debrief).toContain("Controller decision:");
    expect(debrief).toContain("Next action:");
  });

  it("surfaces structured debrief for every controller outcome", () => {
    const planner = createPlannerOutput({ task: "Patch failing test", taskKind: "code_changes" });

    const passingWorker = buildWorkerStepResult({
      task: planner.task_under_review,
      taskKind: "code_changes",
      workerClaim: "Patched and validated.",
      summary: "Validation captured.",
      evidence: createEvidence({ toolNames: ["exec:pnpm test src/file.test.ts"] }),
    });
    const passingReview = buildCriticReview({
      worker: passingWorker,
      evidence: createEvidence({ toolNames: ["exec:pnpm test src/file.test.ts"] }),
    });

    const continueController = decideCriticControllerAction({
      review: passingReview,
      worker: passingWorker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: false,
    });
    const completeController = decideCriticControllerAction({
      review: passingReview,
      worker: passingWorker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    const reviseWorker = buildWorkerStepResult({
      task: "Draft update copy",
      taskKind: "content_generation",
      workerClaim: "Need another pass.",
      summary: "Validation missing.",
      evidence: createEvidence({
        assistantTextChars: 0,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const reviseReview = buildCriticReview({
      worker: reviseWorker,
      evidence: createEvidence({
        assistantTextChars: 0,
        payloadCount: 0,
        toolCalls: 0,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const retryController = decideCriticControllerAction({
      review: reviseReview,
      worker: reviseWorker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: false,
    });

    const stopWorker = buildWorkerStepResult({
      task: planner.task_under_review,
      taskKind: "code_changes",
      workerClaim: "Timed out.",
      summary: "Run timed out.",
      evidence: createEvidence({
        timedOut: true,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const stopReview = buildCriticReview({
      worker: stopWorker,
      evidence: createEvidence({
        timedOut: true,
        filesChanged: [],
        fileDiffs: [],
        commandOutputs: [],
        validationResults: [],
      }),
    });
    const escalateController = decideCriticControllerAction({
      review: stopReview,
      worker: stopWorker,
      retryCount: 0,
      maxRetries: 2,
      finalCandidate: true,
    });

    const outcomes = [
      ["continue", continueController, passingWorker, passingReview],
      ["retry", retryController, reviseWorker, reviseReview],
      ["complete", completeController, passingWorker, passingReview],
      ["escalate", escalateController, stopWorker, stopReview],
    ] as const;

    for (const [label, controller, worker, review] of outcomes) {
      const debrief = buildControllerDebrief({ planner, worker, review, controller });
      expect(debrief).toContain("Controller outcome: " + label);
      expect(debrief).toContain("Controller decision:");
      expect(debrief).toContain("Reason:");
    }
  });

  it("supports safe fallback when critic loop is disabled", () => {
    expect(
      shouldRunCriticLoop({
        criticConfig: {
          enabled: false,
          maxRevisions: 2,
          requireValidation: true,
          diagnostics: "off",
        },
        trigger: "user",
      }),
    ).toBe(false);

    expect(
      shouldRunCriticLoop({
        criticConfig: {
          enabled: true,
          maxRevisions: 2,
          requireValidation: true,
          diagnostics: "off",
          runOnTriggers: ["user"],
        },
        trigger: "heartbeat",
      }),
    ).toBe(false);

    expect(
      shouldRunCriticLoop({
        criticConfig: {
          enabled: true,
          maxRevisions: 2,
          requireValidation: true,
          diagnostics: "off",
          runOnTriggers: ["user"],
        },
        trigger: "user",
      }),
    ).toBe(true);

    expect(
      shouldRunCriticLoop({
        criticConfig: {
          enabled: true,
          maxRevisions: 2,
          requireValidation: true,
          diagnostics: "off",
          runOnTriggers: ["user"],
          runOnTaskKinds: ["code_changes"],
        },
        trigger: "user",
        taskKind: "content_generation",
      }),
    ).toBe(false);
  });

  it("infers task kinds for gating", () => {
    expect(inferCriticTaskKind("Implement TypeScript retry logic and tests")).toBe("code_changes");
    expect(inferCriticTaskKind("Improve SEO meta descriptions for landing page")).toBe(
      "seo_changes",
    );
    expect(inferCriticTaskKind("Write a blog post for newsletter")).toBe("content_generation");
  });
});
