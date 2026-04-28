import fs from "node:fs/promises";
import path from "node:path";

export type Project = {
  id: string;
  name: string;
  description?: string;
  sessionKey?: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectsFile = {
  version: 1;
  projects: Project[];
};

const PROJECTS_FILENAME = "projects.json";

function resolveProjectsFilePath(workspaceDir: string): string {
  return path.join(workspaceDir, PROJECTS_FILENAME);
}

export async function readProjectsFile(workspaceDir: string): Promise<ProjectsFile> {
  const filePath = resolveProjectsFilePath(workspaceDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProjectsFile>;
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.filter(
          (p): p is Project =>
            p !== null &&
            typeof p === "object" &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            typeof p.createdAt === "number",
        )
      : [];
    return { version: 1, projects };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { version: 1, projects: [] };
    }
    throw err;
  }
}

export async function writeProjectsFile(workspaceDir: string, data: ProjectsFile): Promise<void> {
  const filePath = resolveProjectsFilePath(workspaceDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function generateProjectId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
