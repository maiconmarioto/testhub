package app

import (
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (a *App) listRuns(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	q := a.db.Where("status <> ?", "deleted")
	if projectID := r.URL.Query().Get("projectId"); projectID != "" {
		if _, ok := a.projectByIDInOrg(projectID, actor.OrganizationID); !ok {
			httpError(w, 404, "Projeto não encontrado")
			return
		}
		q = q.Where("project_id = ?", projectID)
	} else {
		q = q.Where("project_id IN (?)", a.db.Model(&Project{}).Select("id").Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive"))
	}
	var runs []RunRecord
	q.Order("created_at desc").Find(&runs)
	writeJSON(w, 200, runs)
}

func (a *App) createRun(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct{ ProjectID, EnvironmentID, SuiteID string }
	if !decode(w, r, &input) {
		return
	}
	project, ok := a.projectByIDInOrg(input.ProjectID, actor.OrganizationID)
	if !ok {
		httpError(w, 404, "Projeto não encontrado")
		return
	}
	envr, ok1 := a.environmentByID(input.EnvironmentID, project.ID)
	suite, ok2 := a.suiteByID(input.SuiteID, project.ID)
	if !ok1 || !ok2 {
		httpError(w, 400, "Environment ou suite invalido")
		return
	}
	if !isHostAllowed(envr.BaseURL) {
		httpError(w, 403, "Host fora da allowlist: "+hostOf(envr.BaseURL))
		return
	}
	now := time.Now().UTC()
	run := RunRecord{ID: uuid.NewString(), ProjectID: input.ProjectID, EnvironmentID: input.EnvironmentID, SuiteID: suite.ID, Status: "queued", CreatedAt: now}
	if ok, msg := environmentReachable(envr.BaseURL); !ok {
		errMsg := fmt.Sprintf("Environment health check falhou para %s: %s", envr.BaseURL, msg)
		run.Status, run.Error, run.FinishedAt, run.HeartbeatAt = "error", &errMsg, &now, &now
		run.Summary = mustJSON(map[string]int{"total": 0, "passed": 0, "failed": 0, "skipped": 0, "error": 1})
		run.Progress = mustJSON(map[string]any{"phase": "error", "totalTests": 0, "completedTests": 0, "passed": 0, "failed": 0, "error": 1, "updatedAt": now.Format(time.RFC3339Nano)})
		a.db.Create(&run)
		writeJSON(w, 202, run)
		return
	}
	job := RunJob{ID: uuid.NewString(), RunID: run.ID, Type: "run", Status: "queued", MaxAttempts: 3, AvailableAt: now, CreatedAt: now, UpdatedAt: now}
	a.db.Transaction(func(tx *gorm.DB) error { tx.Create(&run); tx.Create(&job); return nil })
	writeJSON(w, 202, run)
}

func (a *App) getRun(w http.ResponseWriter, r *http.Request) {
	if run, ok := a.runInOrg(w, r, chi.URLParam(r, "id")); ok {
		writeJSON(w, 200, run)
	}
}

func (a *App) cancelRun(w http.ResponseWriter, r *http.Request) {
	run, ok := a.runInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if run.Status != "queued" && run.Status != "running" {
		writeJSON(w, 200, run)
		return
	}
	now := time.Now().UTC()
	a.db.Transaction(func(tx *gorm.DB) error {
		tx.Model(&RunRecord{}).Where("id = ?", run.ID).Updates(map[string]any{"status": "canceled", "finished_at": now})
		tx.Model(&RunJob{}).Where("run_id = ? AND status IN ?", run.ID, []string{"queued", "claimed", "running"}).Update("status", "canceled")
		return nil
	})
	a.db.First(&run, "id = ?", run.ID)
	writeJSON(w, 200, run)
}

func (a *App) deleteRun(w http.ResponseWriter, r *http.Request) {
	run, ok := a.runInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	now := time.Now().UTC()
	a.db.Transaction(func(tx *gorm.DB) error {
		tx.Model(&RunRecord{}).Where("id = ?", run.ID).Updates(map[string]any{"status": "deleted", "finished_at": coalesceTime(run.FinishedAt, now)})
		tx.Model(&RunJob{}).Where("run_id = ?", run.ID).Update("status", "deleted")
		return nil
	})
	w.WriteHeader(204)
}

func (a *App) runReport(w http.ResponseWriter, r *http.Request) {
	run, ok := a.runInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if run.ReportPath == nil {
		httpError(w, 404, "Report não encontrado")
		return
	}
	b, err := os.ReadFile(*run.ReportPath)
	if err != nil {
		httpError(w, 404, "Report não encontrado")
		return
	}
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Write(b)
}

func (a *App) cleanup(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		ProjectID        *string `json:"projectId"`
		Days             *int    `json:"days"`
		CleanupArtifacts *bool   `json:"cleanupArtifacts"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.ProjectID == nil || *input.ProjectID == "" {
		httpError(w, 400, "projectId obrigatório para cleanup via API")
		return
	}
	project, ok := a.projectByIDInOrg(*input.ProjectID, actor.OrganizationID)
	if !ok {
		httpError(w, 404, "Projeto não encontrado")
		return
	}
	days := retentionDays()
	if project.RetentionDays != nil {
		days = *project.RetentionDays
	}
	if input.Days != nil {
		days = *input.Days
	}
	if days < 1 || days > 3650 {
		httpError(w, 400, "days deve estar entre 1 e 3650")
		return
	}
	cutoff := time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour)
	res := a.db.Model(&RunRecord{}).Where("project_id = ? AND created_at < ? AND status <> ?", project.ID, cutoff, "deleted").Updates(map[string]any{"status": "deleted", "finished_at": time.Now().UTC()})
	writeJSON(w, 200, map[string]any{"projectId": project.ID, "days": days, "cutoffIso": cutoff.Format(time.RFC3339Nano), "archivedRuns": res.RowsAffected, "retainedArtifacts": true})
}

func (a *App) artifact(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	rawPath := r.URL.Query().Get("path")
	requested, err := realPath(rawPath)
	if err != nil {
		httpError(w, 404, "Artifact não encontrado")
		return
	}
	var runs []RunRecord
	a.db.Where("status <> ? AND project_id IN (?)", "deleted", a.db.Model(&Project{}).Select("id").Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive")).Find(&runs)
	allowed := false
	for _, run := range runs {
		for _, p := range []*string{run.ReportPath, run.ReportHTMLPath} {
			if p == nil {
				continue
			}
			reportPath, err := realPath(*p)
			if err != nil {
				continue
			}
			base := filepath.Dir(reportPath)
			if requested == reportPath || isPathInside(base, requested) {
				allowed = true
			}
		}
	}
	if !allowed {
		httpError(w, 403, "Artifact fora de area permitida")
		return
	}
	b, err := os.ReadFile(requested)
	if err != nil {
		httpError(w, 404, "Artifact não encontrado")
		return
	}
	if ct := contentTypeFor(requested); ct != "" {
		w.Header().Set("content-type", ct)
	} else if ext := filepath.Ext(requested); ext != "" {
		w.Header().Set("content-type", mime.TypeByExtension(ext))
	}
	w.Write(b)
}
