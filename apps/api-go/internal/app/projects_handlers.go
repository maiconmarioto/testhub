package app

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (a *App) listProjects(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var projects []Project
	a.db.Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive").Order("created_at desc").Find(&projects)
	writeJSON(w, 200, projects)
}

func (a *App) createProject(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		Name             string  `json:"name"`
		Description      *string `json:"description"`
		RetentionDays    *int    `json:"retentionDays"`
		CleanupArtifacts *bool   `json:"cleanupArtifacts"`
	}
	if !decode(w, r, &input) || input.Name == "" {
		return
	}
	now := time.Now().UTC()
	p := Project{ID: uuid.NewString(), OrganizationID: actor.OrganizationID, Name: input.Name, Description: input.Description, RetentionDays: input.RetentionDays, CleanupArtifacts: input.CleanupArtifacts, Status: "active", CreatedAt: now, UpdatedAt: now}
	a.db.Create(&p)
	writeJSON(w, 201, p)
}

func (a *App) getProject(w http.ResponseWriter, r *http.Request) {
	if p, ok := a.projectInOrg(w, r, chi.URLParam(r, "id")); ok {
		writeJSON(w, 200, p)
	}
}

func (a *App) updateProject(w http.ResponseWriter, r *http.Request) {
	p, ok := a.projectInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var input struct {
		Name             string  `json:"name"`
		Description      *string `json:"description"`
		RetentionDays    *int    `json:"retentionDays"`
		CleanupArtifacts *bool   `json:"cleanupArtifacts"`
	}
	if !decode(w, r, &input) {
		return
	}
	a.db.Model(&p).Updates(Project{Name: input.Name, Description: input.Description, RetentionDays: input.RetentionDays, CleanupArtifacts: input.CleanupArtifacts, UpdatedAt: time.Now().UTC()})
	a.db.First(&p, "id = ?", p.ID)
	writeJSON(w, 200, p)
}

func (a *App) deleteProject(w http.ResponseWriter, r *http.Request) {
	p, ok := a.projectInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	now := time.Now().UTC()
	a.db.Transaction(func(tx *gorm.DB) error {
		tx.Model(&Project{}).Where("id = ?", p.ID).Updates(map[string]any{"status": "inactive", "updated_at": now})
		tx.Model(&Environment{}).Where("project_id = ?", p.ID).Updates(map[string]any{"status": "inactive", "updated_at": now})
		tx.Model(&Suite{}).Where("project_id = ?", p.ID).Updates(map[string]any{"status": "inactive", "updated_at": now})
		tx.Model(&RunRecord{}).Where("project_id = ?", p.ID).Updates(map[string]any{"status": "deleted", "finished_at": now})
		tx.Model(&RunJob{}).Where("run_id IN (?)", tx.Model(&RunRecord{}).Select("id").Where("project_id = ?", p.ID)).Update("status", "deleted")
		return nil
	})
	w.WriteHeader(204)
}

func (a *App) listEnvironments(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	q := a.db.Model(&Environment{}).Where("status <> ?", "inactive")
	if projectID := r.URL.Query().Get("projectId"); projectID != "" {
		if _, ok := a.projectByIDInOrg(projectID, actor.OrganizationID); !ok {
			httpError(w, 404, "Projeto não encontrado")
			return
		}
		q = q.Where("project_id = ?", projectID)
	} else {
		q = q.Where("project_id IN (?)", a.db.Model(&Project{}).Select("id").Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive"))
	}
	var envs []Environment
	q.Find(&envs)
	writeJSON(w, 200, maskEnvironments(envs))
}

func (a *App) createEnvironment(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		ProjectID string            `json:"projectId"`
		Name      string            `json:"name"`
		BaseURL   string            `json:"baseUrl"`
		Variables map[string]string `json:"variables"`
	}
	if !decode(w, r, &input) {
		return
	}
	if _, ok := a.projectByIDInOrg(input.ProjectID, actor.OrganizationID); !ok {
		httpError(w, 404, "Projeto não encontrado")
		return
	}
	vars, _ := encryptVariables(input.Variables)
	now := time.Now().UTC()
	envr := Environment{ID: uuid.NewString(), ProjectID: input.ProjectID, Name: input.Name, BaseURL: input.BaseURL, Variables: vars, Status: "active", CreatedAt: now, UpdatedAt: now}
	a.db.Create(&envr)
	writeJSON(w, 201, maskEnvironment(envr))
}

func (a *App) getEnvironment(w http.ResponseWriter, r *http.Request) {
	if envr, ok := a.environmentInOrg(w, r, chi.URLParam(r, "id")); ok {
		writeJSON(w, 200, maskEnvironment(envr))
	}
}

func (a *App) updateEnvironment(w http.ResponseWriter, r *http.Request) {
	envr, ok := a.environmentInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var input struct {
		Name      string            `json:"name"`
		BaseURL   string            `json:"baseUrl"`
		Variables map[string]string `json:"variables"`
	}
	if !decode(w, r, &input) {
		return
	}
	vars, _ := encryptVariables(input.Variables)
	a.db.Model(&envr).Updates(map[string]any{"name": input.Name, "base_url": input.BaseURL, "variables": vars, "updated_at": time.Now().UTC()})
	a.db.First(&envr, "id = ?", envr.ID)
	writeJSON(w, 200, maskEnvironment(envr))
}

func (a *App) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	envr, ok := a.environmentInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	now := time.Now().UTC()
	a.db.Transaction(func(tx *gorm.DB) error {
		tx.Model(&Environment{}).Where("id = ?", envr.ID).Updates(map[string]any{"status": "inactive", "updated_at": now})
		tx.Model(&RunRecord{}).Where("environment_id = ?", envr.ID).Updates(map[string]any{"status": "deleted", "finished_at": now})
		return nil
	})
	w.WriteHeader(204)
}
