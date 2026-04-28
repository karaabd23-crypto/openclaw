import type { GatewayBrowserClient } from "../gateway.ts";

export type Project = {
  id: string;
  name: string;
  description?: string;
  sessionKey?: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  projectsLoading: boolean;
  projectsList: Project[];
  projectsError: string | null;
  projectsCreating: boolean;
  projectsCreateError: string | null;
  projectsDraftName: string;
  projectsDraftDescription: string;
  projectsCreateOpen: boolean;
};

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function loadProjects(state: ProjectsState): Promise<void> {
  if (!state.client || !state.connected || state.projectsLoading) {
    return;
  }
  state.projectsLoading = true;
  state.projectsError = null;
  try {
    const res = await state.client.request<{ projects: Project[] }>("projects.list", {});
    state.projectsList = Array.isArray(res?.projects) ? res.projects : [];
  } catch (err) {
    state.projectsError = getErrorMessage(err);
  } finally {
    state.projectsLoading = false;
  }
}

export async function createProject(
  state: ProjectsState,
  name: string,
  description?: string,
  sessionKey?: string,
): Promise<Project | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  state.projectsCreating = true;
  state.projectsCreateError = null;
  try {
    const res = await state.client.request<{ project: Project }>("projects.set", {
      name: name.trim(),
      description: description?.trim() || undefined,
      sessionKey: sessionKey?.trim() || undefined,
    });
    const project = res?.project;
    if (project) {
      state.projectsList = [...state.projectsList, project];
    }
    return project ?? null;
  } catch (err) {
    state.projectsCreateError = getErrorMessage(err);
    return null;
  } finally {
    state.projectsCreating = false;
  }
}

export async function updateProject(
  state: ProjectsState,
  id: string,
  patch: Partial<Pick<Project, "name" | "description" | "sessionKey">>,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  const existing = state.projectsList.find((p) => p.id === id);
  if (!existing) {
    return;
  }
  try {
    const res = await state.client.request<{ project: Project }>("projects.set", {
      id,
      name: patch.name ?? existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      sessionKey: patch.sessionKey !== undefined ? patch.sessionKey : existing.sessionKey,
    });
    const updated = res?.project;
    if (updated) {
      state.projectsList = state.projectsList.map((p) => (p.id === id ? updated : p));
    }
  } catch (err) {
    state.projectsError = getErrorMessage(err);
  }
}

export async function deleteProject(state: ProjectsState, id: string): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("projects.delete", { id });
    state.projectsList = state.projectsList.filter((p) => p.id !== id);
  } catch (err) {
    state.projectsError = getErrorMessage(err);
  }
}
