package app

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

func (a *App) listUsers(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var memberships []OrganizationMembership
	a.db.Where("organization_id = ?", actor.OrganizationID).Find(&memberships)
	userIDs := []string{}
	for _, m := range memberships {
		userIDs = append(userIDs, m.UserID)
	}
	var users []User
	if len(userIDs) > 0 {
		a.db.Where("id IN ? AND status = ?", userIDs, "active").Find(&users)
	}
	org := Organization{}
	a.db.First(&org, "id = ?", actor.OrganizationID)
	membershipByUser := map[string]OrganizationMembership{}
	for _, m := range memberships {
		membershipByUser[m.UserID] = m
	}
	out := []any{}
	for _, user := range users {
		out = append(out, map[string]any{"user": publicUser(user), "memberships": []OrganizationMembership{membershipByUser[user.ID]}, "organizations": []Organization{org}})
	}
	a.writeAudit(r, "GET /api/users", actor, "ok", nil, nil)
	writeJSON(w, 200, out)
}

func (a *App) getCurrentUser(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var user User
	a.db.First(&user, "id = ?", actor.UserID)
	writeJSON(w, 200, map[string]any{"user": publicUser(user), "memberships": a.membershipsForUser(user.ID), "organizations": a.organizationsForUser(user.ID)})
}

func (a *App) updateCurrentUser(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		Email *string `json:"email"`
		Name  *string `json:"name"`
	}
	if !decode(w, r, &input) {
		return
	}
	updates := map[string]any{"updated_at": time.Now().UTC()}
	if input.Email != nil {
		email := normalizeEmail(*input.Email)
		if email == "" {
			httpError(w, 400, "ValidationError")
			return
		}
		var existing User
		if err := a.db.Where("lower(email) = ? AND id <> ? AND status = ?", email, actor.UserID, "active").First(&existing).Error; err == nil {
			httpError(w, 409, "Email ja cadastrado")
			return
		}
		updates["email"] = email
	}
	if input.Name != nil {
		updates["name"] = nullableString(*input.Name)
	}
	var user User
	if err := a.db.Model(&User{}).Where("id = ? AND status = ?", actor.UserID, "active").Updates(updates).First(&user, "id = ?", actor.UserID).Error; err != nil {
		httpError(w, 404, "Usuário não encontrado")
		return
	}
	writeJSON(w, 200, map[string]any{"user": publicUser(user)})
}

func (a *App) listOrganizations(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	writeJSON(w, 200, a.organizationsForUser(actor.UserID))
}

func (a *App) createOrganization(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &input) {
		return
	}
	now := time.Now().UTC()
	org := Organization{ID: uuid.NewString(), Name: input.Name, Slug: slugify(input.Name), Status: "active", CreatedAt: now, UpdatedAt: now}
	err := a.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&org).Error; err != nil {
			org.Slug += "-" + shortID()
			if err2 := tx.Create(&org).Error; err2 != nil {
				return err
			}
		}
		return tx.Create(&OrganizationMembership{ID: uuid.NewString(), UserID: actor.UserID, OrganizationID: org.ID, Role: "admin", CreatedAt: now, UpdatedAt: now}).Error
	})
	if err != nil {
		httpError(w, 409, "Slug de organizacao ja cadastrado")
		return
	}
	writeJSON(w, 201, org)
}

func (a *App) listCurrentMembers(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var memberships []OrganizationMembership
	a.db.Where("organization_id = ?", actor.OrganizationID).Find(&memberships)
	out := []any{}
	for _, m := range memberships {
		var u User
		a.db.First(&u, "id = ?", m.UserID)
		out = append(out, map[string]any{"user": publicUser(u), "membership": m})
	}
	writeJSON(w, 200, out)
}

func (a *App) createCurrentMember(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		Email             string  `json:"email"`
		Name              *string `json:"name"`
		Role              string  `json:"role"`
		TemporaryPassword *string `json:"temporaryPassword"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Role == "" {
		input.Role = "viewer"
	}
	if !isRole(input.Role) || normalizeEmail(input.Email) == "" {
		httpError(w, 400, "ValidationError")
		return
	}
	email := normalizeEmail(input.Email)
	var existing User
	if err := a.db.Where("lower(email) = ?", email).First(&existing).Error; err == nil {
		httpError(w, 409, "Usuário já existe; troca de organização ainda não suportada")
		return
	}
	password := ""
	if input.TemporaryPassword != nil {
		password = *input.TemporaryPassword
	} else {
		password = randomHex(8)
	}
	hash, _ := hashPassword(password)
	now := time.Now().UTC()
	user := User{ID: uuid.NewString(), Email: email, Name: input.Name, PasswordHash: hash, Status: "active", CreatedAt: now, UpdatedAt: now}
	m := OrganizationMembership{ID: uuid.NewString(), UserID: user.ID, OrganizationID: actor.OrganizationID, Role: input.Role, CreatedAt: now, UpdatedAt: now}
	a.db.Transaction(func(tx *gorm.DB) error { tx.Create(&user); tx.Create(&m); return nil })
	resp := map[string]any{"user": publicUser(user), "membership": m}
	if input.TemporaryPassword == nil {
		resp["temporaryPassword"] = password
	}
	writeJSON(w, 201, resp)
}

func (a *App) updateUserMemberships(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	userID := chi.URLParam(r, "id")
	var input struct {
		Memberships []struct{ OrganizationID, Role string } `json:"memberships"`
	}
	if !decode(w, r, &input) {
		return
	}
	var user User
	if err := a.db.Where("id = ? AND status = ?", userID, "active").First(&user).Error; err != nil {
		httpError(w, 404, "Usuário não encontrado")
		return
	}
	var current OrganizationMembership
	if err := a.db.Where("user_id = ? AND organization_id = ?", userID, actor.OrganizationID).First(&current).Error; err != nil {
		httpError(w, 404, "Usuário não encontrado")
		return
	}
	desiredRole := ""
	for _, m := range input.Memberships {
		if m.OrganizationID != actor.OrganizationID {
			httpError(w, 403, "Organização não permitida")
			return
		}
		if !isRole(m.Role) {
			httpError(w, 400, "ValidationError")
			return
		}
		desiredRole = m.Role
	}
	if desiredRole == "" {
		httpError(w, 400, "Membership da organização atual obrigatório")
		return
	}
	now := time.Now().UTC()
	a.db.Model(&OrganizationMembership{}).Where("id = ?", current.ID).Updates(map[string]any{"role": desiredRole, "updated_at": now})
	a.db.First(&current, "id = ?", current.ID)
	var org Organization
	a.db.First(&org, "id = ?", actor.OrganizationID)
	writeJSON(w, 200, map[string]any{"user": publicUser(user), "memberships": []OrganizationMembership{current}, "organizations": []Organization{org}})
}

func (a *App) listPersonalTokens(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var tokens []PersonalAccessToken
	a.db.Where("user_id = ? AND status = ?", actor.UserID, "active").Find(&tokens)
	out := []map[string]any{}
	for _, t := range tokens {
		out = append(out, publicPAT(t))
	}
	writeJSON(w, 200, out)
}

func (a *App) createPersonalToken(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		Name                  string   `json:"name"`
		OrganizationIDs       []string `json:"organizationIds"`
		DefaultOrganizationID string   `json:"defaultOrganizationId"`
	}
	if !decode(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Name) == "" {
		httpError(w, 400, "ValidationError")
		return
	}
	memberships := a.membershipsForUser(actor.UserID)
	allowed := map[string]bool{}
	for _, m := range memberships {
		allowed[m.OrganizationID] = true
	}
	if len(input.OrganizationIDs) == 0 {
		for _, m := range memberships {
			input.OrganizationIDs = append(input.OrganizationIDs, m.OrganizationID)
		}
	}
	for _, id := range input.OrganizationIDs {
		if !allowed[id] {
			httpError(w, 403, "Organização não permitida")
			return
		}
	}
	if input.DefaultOrganizationID == "" {
		input.DefaultOrganizationID = actor.OrganizationID
	}
	if !contains(input.OrganizationIDs, input.DefaultOrganizationID) {
		httpError(w, 403, "Organização padrão não permitida")
		return
	}
	token := createPAT()
	enc, _ := encryptSecret(token)
	now := time.Now().UTC()
	orgJSON := datatypes.JSON(nil)
	if len(input.OrganizationIDs) > 0 {
		orgJSON = mustJSON(input.OrganizationIDs)
	}
	pat := PersonalAccessToken{ID: uuid.NewString(), UserID: actor.UserID, Name: input.Name, TokenHash: hashToken(token), Token: enc, TokenPreview: tokenPreview(token), OrganizationIDs: orgJSON, DefaultOrganizationID: input.DefaultOrganizationID, Status: "active", CreatedAt: now, UpdatedAt: now}
	a.db.Create(&pat)
	resp := publicPAT(pat)
	resp["token"] = token
	writeJSON(w, 201, resp)
}

func (a *App) revokePersonalToken(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	a.db.Model(&PersonalAccessToken{}).Where("id = ? AND user_id = ?", chi.URLParam(r, "id"), actor.UserID).Updates(map[string]any{"status": "inactive", "updated_at": time.Now().UTC()})
	w.WriteHeader(204)
}
