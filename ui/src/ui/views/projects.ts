import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type { Project } from "../controllers/projects.ts";

type ProjectsViewProps = {
  loading: boolean;
  error: string | null;
  projects: Project[];
  creating: boolean;
  createError: string | null;
  draftName: string;
  draftDescription: string;
  createOpen: boolean;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onDraftNameChange: (v: string) => void;
  onDraftDescriptionChange: (v: string) => void;
  onCreate: () => void;
  onResume: (project: Project) => void;
  onDelete: (project: Project) => void;
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function renderProjects(props: ProjectsViewProps) {
  const {
    loading,
    error,
    projects,
    creating,
    createError,
    draftName,
    draftDescription,
    createOpen,
    onRefresh,
    onOpenCreate,
    onCloseCreate,
    onDraftNameChange,
    onDraftDescriptionChange,
    onCreate,
    onResume,
    onDelete,
  } = props;

  return html`
    <div class="projects-view">
      <div class="projects-toolbar">
        <button class="btn btn--subtle btn--sm" @click=${onRefresh} ?disabled=${loading}>
          ${loading ? t("common.refreshing") : t("common.refresh")}
        </button>
        <button class="btn btn--primary btn--sm" @click=${onOpenCreate} ?disabled=${creating}>
          New project
        </button>
      </div>

      ${createOpen
        ? html`
            <div class="projects-create-form callout">
              <div class="projects-create-form__row">
                <label class="projects-create-form__label">Name</label>
                <input
                  class="input"
                  type="text"
                  placeholder="Project name"
                  .value=${draftName}
                  @input=${(e: Event) => onDraftNameChange((e.target as HTMLInputElement).value)}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter" && draftName.trim()) {
                      onCreate();
                    }
                    if (e.key === "Escape") {
                      onCloseCreate();
                    }
                  }}
                  autofocus
                />
              </div>
              <div class="projects-create-form__row">
                <label class="projects-create-form__label">Description</label>
                <input
                  class="input"
                  type="text"
                  placeholder="Optional description"
                  .value=${draftDescription}
                  @input=${(e: Event) =>
                    onDraftDescriptionChange((e.target as HTMLInputElement).value)}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter" && draftName.trim()) {
                      onCreate();
                    }
                    if (e.key === "Escape") {
                      onCloseCreate();
                    }
                  }}
                />
              </div>
              ${createError
                ? html`<div class="projects-create-form__error error-text">${createError}</div>`
                : nothing}
              <div class="projects-create-form__actions">
                <button
                  class="btn btn--primary btn--sm"
                  @click=${onCreate}
                  ?disabled=${creating || !draftName.trim()}
                >
                  ${creating ? "Creating…" : "Create"}
                </button>
                <button
                  class="btn btn--subtle btn--sm"
                  @click=${onCloseCreate}
                  ?disabled=${creating}
                >
                  Cancel
                </button>
              </div>
            </div>
          `
        : nothing}
      ${error ? html`<div class="projects-error error-text">${error}</div>` : nothing}
      ${loading && !projects.length
        ? html`<div class="projects-loading">${t("common.loading")}</div>`
        : nothing}
      ${!loading && !error && !projects.length
        ? html`<div class="projects-empty">
            <p>No projects yet. Create one to save a named context you can return to.</p>
          </div>`
        : nothing}

      <ul class="projects-list">
        ${projects.map(
          (p) => html`
            <li class="projects-card">
              <div class="projects-card__body">
                <div class="projects-card__name">${p.name}</div>
                ${p.description
                  ? html`<div class="projects-card__desc">${p.description}</div>`
                  : nothing}
                <div class="projects-card__meta">Updated ${formatDate(p.updatedAt)}</div>
              </div>
              <div class="projects-card__actions">
                <button
                  class="btn btn--primary btn--sm"
                  @click=${() => onResume(p)}
                  title="Resume this project in chat"
                >
                  Resume
                </button>
                <button
                  class="btn btn--subtle btn--sm btn--danger"
                  @click=${() => {
                    if (confirm(`Delete project "${p.name}"?`)) {
                      onDelete(p);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          `,
        )}
      </ul>
    </div>
  `;
}
