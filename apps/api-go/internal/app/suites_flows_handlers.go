package app

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

func (a *App) listSuites(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	q := a.db.Model(&Suite{}).Where("status <> ?", "inactive")
	if projectID := r.URL.Query().Get("projectId"); projectID != "" {
		if _, ok := a.projectByIDInOrg(projectID, actor.OrganizationID); !ok {
			httpError(w, 404, "Projeto não encontrado")
			return
		}
		q = q.Where("project_id = ?", projectID)
	} else {
		q = q.Where("project_id IN (?)", a.db.Model(&Project{}).Select("id").Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive"))
	}
	var suites []Suite
	q.Find(&suites)
	writeJSON(w, 200, suites)
}

func (a *App) createSuite(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		ProjectID   string `json:"projectId"`
		Name        string `json:"name"`
		Type        string `json:"type"`
		SpecContent string `json:"specContent"`
	}
	if !decode(w, r, &input) {
		return
	}
	if _, ok := a.projectByIDInOrg(input.ProjectID, actor.OrganizationID); !ok {
		httpError(w, 404, "Projeto não encontrado")
		return
	}
	if err := a.validateSpecContent(input.SpecContent, actor.OrganizationID, input.ProjectID); err != nil {
		httpError(w, 400, err.Error())
		return
	}
	now := time.Now().UTC()
	specPath := filepath.Join(a.suitesDir(), sanitizeFile(input.Name)+"-"+strconv.FormatInt(now.UnixMilli(), 10)+".yaml")
	_ = os.WriteFile(specPath, []byte(input.SpecContent), 0o600)
	s := Suite{ID: uuid.NewString(), ProjectID: input.ProjectID, Name: input.Name, Type: input.Type, SpecPath: specPath, Status: "active", CreatedAt: now, UpdatedAt: now}
	a.db.Create(&s)
	writeJSON(w, 201, s)
}

func (a *App) getSuite(w http.ResponseWriter, r *http.Request) {
	s, ok := a.suiteInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	content, _ := os.ReadFile(s.SpecPath)
	writeJSON(w, 200, mapWith(s, "specContent", string(content)))
}

func (a *App) updateSuite(w http.ResponseWriter, r *http.Request) {
	s, ok := a.suiteInOrg(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	actor := actorFromCtx(r)
	var input struct {
		Name        string `json:"name"`
		Type        string `json:"type"`
		SpecContent string `json:"specContent"`
	}
	if !decode(w, r, &input) {
		return
	}
	if err := a.validateSpecContent(input.SpecContent, actor.OrganizationID, s.ProjectID); err != nil {
		httpError(w, 400, err.Error())
		return
	}
	_ = os.WriteFile(s.SpecPath, []byte(input.SpecContent), 0o600)
	a.db.Model(&s).Updates(map[string]any{"name": input.Name, "type": input.Type, "updated_at": time.Now().UTC()})
	a.db.First(&s, "id = ?", s.ID)
	writeJSON(w, 200, s)
}

func (a *App) validateSpec(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		SpecContent string  `json:"specContent"`
		ProjectID   *string `json:"projectId"`
	}
	if !decode(w, r, &input) {
		return
	}
	if err := a.validateSpecContent(input.SpecContent, actor.OrganizationID, deref(input.ProjectID)); err != nil {
		writeJSON(w, 400, map[string]any{"valid": false, "error": err.Error()})
		return
	}
	meta := parseSpecMeta(input.SpecContent)
	writeJSON(w, 200, map[string]any{"valid": true, "type": meta.Type, "name": meta.Name, "tests": len(meta.Tests)})
}

func (a *App) importOpenAPI(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		ProjectID   string         `json:"projectId"`
		Name        string         `json:"name"`
		Spec        map[string]any `json:"spec"`
		Content     map[string]any `json:"content"`
		SpecContent string         `json:"specContent"`
		BaseURL     *string        `json:"baseUrl"`
	}
	if !decode(w, r, &input) {
		return
	}
	if _, ok := a.projectByIDInOrg(input.ProjectID, actor.OrganizationID); !ok {
		httpError(w, 404, "Projeto não encontrado")
		return
	}
	raw := input.Content
	if raw == nil {
		raw = input.Spec
	}
	if raw == nil && input.SpecContent != "" {
		_ = yaml.Unmarshal([]byte(input.SpecContent), &raw)
	}
	spec, err := openAPIToSuite(raw, input.Name, input.BaseURL)
	if err != nil {
		httpError(w, 400, err.Error())
		return
	}
	now := time.Now().UTC()
	specPath := filepath.Join(a.suitesDir(), sanitizeFile(input.Name)+"-"+strconv.FormatInt(now.UnixMilli(), 10)+".yaml")
	_ = os.WriteFile(specPath, []byte(spec), 0o600)
	s := Suite{ID: uuid.NewString(), ProjectID: input.ProjectID, Name: input.Name, Type: "api", SpecPath: specPath, Status: "active", CreatedAt: now, UpdatedAt: now}
	a.db.Create(&s)
	writeJSON(w, 201, s)
}

func (a *App) listFlows(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	q := a.db.Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive")
	if ns := r.URL.Query().Get("namespace"); ns != "" {
		q = q.Where("namespace = ?", ns)
	}
	var flows []FlowLibraryItem
	q.Order("namespace asc, name asc").Find(&flows)
	if projectID := r.URL.Query().Get("projectId"); projectID != "" {
		if _, ok := a.projectByIDInOrg(projectID, actor.OrganizationID); !ok {
			httpError(w, 404, "Projeto não encontrado")
			return
		}
		filtered := []FlowLibraryItem{}
		for _, flow := range flows {
			ids := jsonStringSlice(flow.ProjectIDs)
			if len(ids) == 0 || contains(ids, projectID) {
				filtered = append(filtered, flow)
			}
		}
		flows = filtered
	}
	writeJSON(w, 200, flows)
}

func (a *App) getFlow(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var flow FlowLibraryItem
	if err := a.db.Where("id = ? AND organization_id = ? AND status <> ?", chi.URLParam(r, "id"), actor.OrganizationID, "inactive").First(&flow).Error; err != nil {
		httpError(w, 404, "Flow não encontrado")
		return
	}
	writeJSON(w, 200, flow)
}

func (a *App) upsertFlow(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		ID          *string          `json:"id"`
		Namespace   string           `json:"namespace"`
		Name        string           `json:"name"`
		DisplayName *string          `json:"displayName"`
		Description *string          `json:"description"`
		ProjectIDs  []string         `json:"projectIds"`
		Params      map[string]any   `json:"params"`
		Steps       []map[string]any `json:"steps"`
	}
	if !decode(w, r, &input) {
		return
	}
	if id := chi.URLParam(r, "id"); id != "" {
		input.ID = &id
	}
	if len(input.ProjectIDs) > 0 {
		for _, id := range input.ProjectIDs {
			if _, ok := a.projectByIDInOrg(id, actor.OrganizationID); !ok {
				httpError(w, 400, "Projeto inválido para flow")
				return
			}
		}
	}
	if err := a.validateFlow(input.Namespace, input.Name, input.Steps, actor.OrganizationID, input.ProjectIDs); err != nil {
		httpError(w, 400, err.Error())
		return
	}
	now := time.Now().UTC()
	flow := FlowLibraryItem{}
	existing := a.db.Where("organization_id = ? AND namespace = ? AND name = ? AND status <> ?", actor.OrganizationID, input.Namespace, input.Name, "inactive").First(&flow).Error == nil
	if input.ID != nil {
		existing = a.db.Where("id = ? AND organization_id = ? AND status <> ?", *input.ID, actor.OrganizationID, "inactive").First(&flow).Error == nil
	}
	if !existing {
		flow = FlowLibraryItem{ID: uuid.NewString(), OrganizationID: actor.OrganizationID, CreatedAt: now}
	}
	flow.Namespace, flow.Name, flow.DisplayName, flow.Description = input.Namespace, input.Name, input.DisplayName, input.Description
	flow.ProjectIDs, flow.Params, flow.Steps = mustJSON(input.ProjectIDs), mustJSON(input.Params), mustJSON(input.Steps)
	flow.Status, flow.UpdatedAt = "active", now
	if existing {
		a.db.Save(&flow)
	} else {
		a.db.Create(&flow)
	}
	writeJSON(w, 201, flow)
}

func (a *App) deleteFlow(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	res := a.db.Model(&FlowLibraryItem{}).Where("id = ? AND organization_id = ? AND status <> ?", chi.URLParam(r, "id"), actor.OrganizationID, "inactive").Updates(map[string]any{"status": "inactive", "updated_at": time.Now().UTC()})
	if res.RowsAffected == 0 {
		httpError(w, 404, "Flow não encontrado")
		return
	}
	w.WriteHeader(204)
}
