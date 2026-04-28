import { Type } from "typebox";
import { loadConfig } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveDefaultAgentId, resolveAgentWorkspaceDir } from "../agent-scope-config.js";
import { stringEnum } from "../schema/typebox.js";
import { installSkillFromClawHub, searchSkillsFromClawHub } from "../skills-clawhub.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

const SKILL_ACTIONS = ["search", "install"] as const;

const SkillToolSchema = Type.Object({
  action: stringEnum(SKILL_ACTIONS),
  // search
  query: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
  // install
  slug: Type.Optional(Type.String()),
  version: Type.Optional(Type.String()),
  force: Type.Optional(Type.Boolean()),
});

export function createSkillTool(opts?: { config?: OpenClawConfig }): AnyAgentTool {
  return {
    label: "Skill",
    name: "skill",
    ownerOnly: true,
    description:
      "Search for and install skills from ClaWHub (https://clawhub.ai). Use action=search to find skills by keyword, then action=install with the exact slug to install one. Skills extend your capabilities with new slash commands and behaviors. Requires owner permission.",
    parameters: SkillToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const cfg = opts?.config ?? loadConfig();

      if (action === "search") {
        const query = readStringParam(params, "query");
        const limit =
          typeof params.limit === "number" && Number.isFinite(params.limit)
            ? Math.max(1, Math.min(20, Math.floor(params.limit)))
            : 10;
        const results = await searchSkillsFromClawHub({ query: query ?? undefined, limit });
        return jsonResult({
          ok: true,
          count: results.length,
          results: results.map((r) => ({
            slug: r.slug,
            displayName: r.displayName,
            summary: r.summary,
            version: r.version,
          })),
          hint:
            results.length > 0
              ? `Use action=install with slug to install a skill. Example: { "action": "install", "slug": "${results[0]?.slug}" }`
              : "No results found. Try a different query.",
        });
      }

      if (action === "install") {
        const slug = readStringParam(params, "slug", { required: true, label: "slug" });
        const version = readStringParam(params, "version") ?? undefined;
        const force = Boolean(params.force);
        const agentId = resolveDefaultAgentId(cfg);
        const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
        const result = await installSkillFromClawHub({
          workspaceDir,
          slug,
          version,
          force,
        });
        if (!result.ok) {
          return jsonResult({ ok: false, error: result.error });
        }
        return jsonResult({
          ok: true,
          slug: result.slug,
          version: result.version,
          targetDir: result.targetDir,
          message: `Installed ${result.slug}@${result.version}. The skill is now available. You may need to reload for slash commands to appear.`,
        });
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
