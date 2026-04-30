import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import {
  generateProjectId,
  readProjectsFile,
  writeProjectsFile,
  type Project,
} from "../../config/projects.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function resolveWorkspaceFromConfig(
  cfg: import("../../config/types.openclaw.js").OpenClawConfig,
): string {
  const agentId = resolveDefaultAgentId(cfg);
  return resolveAgentWorkspaceDir(cfg, agentId);
}

export const projectsMethods: GatewayRequestHandlers = {
  "projects.list": async ({ respond, context }) => {
    const workspaceDir = resolveWorkspaceFromConfig(context.getRuntimeConfig());
    const data = await readProjectsFile(workspaceDir);
    respond(true, { projects: data.projects }, undefined);
  },

  "projects.set": async ({ params, respond, context }) => {
    const p = params;
    const workspaceDir = resolveWorkspaceFromConfig(context.getRuntimeConfig());
    const data = await readProjectsFile(workspaceDir);
    const id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : null;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projects.set: name is required"),
      );
      return;
    }
    const now = Date.now();
    if (id) {
      const idx = data.projects.findIndex((proj) => proj.id === id);
      if (idx >= 0) {
        const existing = data.projects[idx];
        const updated: Project = {
          ...existing,
          name,
          description:
            typeof p.description === "string"
              ? p.description.trim() || undefined
              : existing.description,
          sessionKey:
            typeof p.sessionKey === "string"
              ? p.sessionKey.trim() || undefined
              : existing.sessionKey,
          updatedAt: now,
        };
        data.projects[idx] = updated;
        await writeProjectsFile(workspaceDir, data);
        respond(true, { project: updated }, undefined);
        return;
      }
    }
    // Create new
    const newProject: Project = {
      id: id ?? generateProjectId(),
      name,
      description:
        typeof p.description === "string" ? p.description.trim() || undefined : undefined,
      sessionKey: typeof p.sessionKey === "string" ? p.sessionKey.trim() || undefined : undefined,
      createdAt: now,
      updatedAt: now,
    };
    data.projects.push(newProject);
    await writeProjectsFile(workspaceDir, data);
    respond(true, { project: newProject }, undefined);
  },

  "projects.delete": async ({ params, respond, context }) => {
    const p = params;
    const id = typeof p.id === "string" ? p.id.trim() : "";
    if (!id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projects.delete: id is required"),
      );
      return;
    }
    const workspaceDir = resolveWorkspaceFromConfig(context.getRuntimeConfig());
    const data = await readProjectsFile(workspaceDir);
    const before = data.projects.length;
    data.projects = data.projects.filter((proj) => proj.id !== id);
    await writeProjectsFile(workspaceDir, data);
    respond(true, { deleted: before !== data.projects.length }, undefined);
  },
};
