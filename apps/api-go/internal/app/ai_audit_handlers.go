package app

import (
	"bytes"
	"encoding/csv"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (a *App) listAudit(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	limit := clampInt(intQuery(r, "limit", 50), 1, 1000)
	var entries []AuditEntry
	a.db.Where("organization_id = ?", actor.OrganizationID).Order("created_at desc").Limit(limit).Find(&entries)
	writeJSON(w, 200, entries)
}

func (a *App) exportAudit(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var entries []AuditEntry
	a.db.Where("organization_id = ?", actor.OrganizationID).Order("created_at desc").Limit(1000).Find(&entries)
	buf := &bytes.Buffer{}
	cw := csv.NewWriter(buf)
	_ = cw.Write([]string{"createdAt", "actor", "actorRole", "action", "status", "target", "detail"})
	for _, e := range entries {
		_ = cw.Write([]string{e.CreatedAt.Format(time.RFC3339Nano), e.Actor, deref(e.ActorRole), e.Action, e.Status, deref(e.Target), string(e.Detail)})
	}
	cw.Flush()
	w.Header().Set("content-type", "text/csv; charset=utf-8")
	w.Write(buf.Bytes())
}

func (a *App) listAIConnections(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var rows []AIConnection
	a.db.Where("organization_id = ?", actor.OrganizationID).Find(&rows)
	out := []AIConnection{}
	for _, row := range rows {
		out = append(out, safeAI(row))
	}
	writeJSON(w, 200, out)
}

func (a *App) upsertAIConnection(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		ID       *string `json:"id"`
		Name     string  `json:"name"`
		Provider string  `json:"provider"`
		APIKey   *string `json:"apiKey"`
		Model    string  `json:"model"`
		BaseURL  *string `json:"baseUrl"`
		Enabled  bool    `json:"enabled"`
	}
	if !decode(w, r, &input) {
		return
	}
	if os.Getenv("NODE_ENV") == "production" && isDefaultSecretKey() && input.APIKey != nil {
		httpError(w, 400, "TESTHUB_SECRET_KEY default bloqueia gravação de API key em produção.")
		return
	}
	if input.Provider != "openai" && input.Provider != "openrouter" && input.Provider != "anthropic" {
		httpError(w, 400, "Provider inválido")
		return
	}
	if input.Name == "" || input.Model == "" {
		httpError(w, 400, "ValidationError")
		return
	}
	if input.BaseURL != nil && !isAIBaseURLAllowed(*input.BaseURL, input.Provider) {
		httpError(w, 400, "AI baseUrl não permitida")
		return
	}
	now := time.Now().UTC()
	conn := AIConnection{}
	exists := false
	if input.ID != nil {
		exists = a.db.Where("id = ? AND organization_id = ?", *input.ID, actor.OrganizationID).First(&conn).Error == nil
		if !exists {
			httpError(w, 404, "AI connection não encontrada")
			return
		}
	} else {
		conn = AIConnection{ID: uuid.NewString(), OrganizationID: actor.OrganizationID, CreatedAt: now}
	}
	conn.Name, conn.Provider, conn.Model, conn.BaseURL, conn.Enabled, conn.UpdatedAt = input.Name, input.Provider, input.Model, input.BaseURL, strconv.FormatBool(input.Enabled), now
	if input.APIKey != nil && *input.APIKey != "" {
		enc, _ := encryptSecret(*input.APIKey)
		conn.APIKey = &enc
	}
	if exists {
		a.db.Save(&conn)
	} else {
		a.db.Create(&conn)
	}
	writeJSON(w, 201, safeAI(conn))
}

func (a *App) callAI(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	kind := chi.URLParam(r, "kind")
	if kind != "explain-failure" && kind != "suggest-test-fix" && kind != "suggest-test-cases" {
		httpError(w, 404, "Not found")
		return
	}
	var input struct {
		ConnectionID *string `json:"connectionId"`
		Context      any     `json:"context"`
	}
	if !decode(w, r, &input) {
		return
	}
	conn, ok := a.enabledAI(actor.OrganizationID, input.ConnectionID)
	if !ok {
		httpError(w, 400, "Nenhuma AI connection habilitada")
		return
	}
	output, err := callAIProvider(conn, promptFor(kind, input.Context))
	if err != nil {
		httpError(w, 502, "AI provider falhou")
		return
	}
	writeJSON(w, 200, map[string]any{"provider": conn.Provider, "model": conn.Model, "output": output})
}

func (a *App) applyTestFix(w http.ResponseWriter, r *http.Request) {
	var input struct {
		SuiteID     string  `json:"suiteId"`
		Name        string  `json:"name"`
		Type        string  `json:"type"`
		SpecContent string  `json:"specContent"`
		Approved    bool    `json:"approved"`
		Reason      *string `json:"reason"`
	}
	if !decode(w, r, &input) {
		return
	}
	if !input.Approved {
		httpError(w, 400, "Aprovacao humana obrigatória.")
		return
	}
	s, ok := a.suiteInOrg(w, r, input.SuiteID)
	if !ok {
		return
	}
	a.db.Model(&s).Updates(map[string]any{"name": input.Name, "type": input.Type, "spec_content": input.SpecContent, "updated_at": time.Now().UTC()})
	a.db.First(&s, "id = ?", s.ID)
	writeJSON(w, 200, s)
}

// helpers below
