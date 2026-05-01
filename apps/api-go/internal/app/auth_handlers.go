package app

import (
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (a *App) register(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email            string   `json:"email"`
		Name             *string  `json:"name"`
		Password         string   `json:"password"`
		OrganizationName string   `json:"organizationName"`
		OrganizationIDs  []string `json:"organizationIds"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Email = normalizeEmail(input.Email)
	if len(input.Password) < 8 || input.Email == "" {
		httpError(w, 400, "ValidationError")
		return
	}
	if len(input.OrganizationIDs) > 0 {
		httpError(w, 403, "Convite de organização obrigatório")
		return
	}
	var activeUsers int64
	a.db.Model(&User{}).Where("status = ?", "active").Count(&activeUsers)
	if activeUsers > 0 && os.Getenv("TESTHUB_ALLOW_PUBLIC_SIGNUP") != "true" {
		httpError(w, 403, "Cadastro público desabilitado")
		return
	}
	var existing User
	if err := a.db.Where("lower(email) = ? AND status = ?", input.Email, "active").First(&existing).Error; err == nil {
		if activeUsers > 0 && os.Getenv("TESTHUB_ALLOW_PUBLIC_SIGNUP") != "true" {
			httpError(w, 403, "Cadastro público desabilitado")
		} else {
			httpError(w, 409, "Email ja cadastrado")
		}
		return
	}
	passwordHash, err := hashPassword(input.Password)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	now := time.Now().UTC()
	user := User{ID: uuid.NewString(), Email: input.Email, Name: input.Name, PasswordHash: passwordHash, Status: "active", CreatedAt: now, UpdatedAt: now}
	name := input.OrganizationName
	if name == "" {
		name = "Team"
	}
	orgs := []Organization{{ID: uuid.NewString(), Name: name, Slug: slugify(name), Status: "active", CreatedAt: now, UpdatedAt: now}}
	role := "admin"
	err = a.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		for i := range orgs {
			if orgs[i].CreatedAt.IsZero() {
				continue
			}
			if err := tx.Create(&orgs[i]).Error; err != nil {
				orgs[i].Slug = orgs[i].Slug + "-" + shortID()
				if err2 := tx.Create(&orgs[i]).Error; err2 != nil {
					return err
				}
			}
		}
		for _, org := range orgs {
			if err := tx.Create(&OrganizationMembership{ID: uuid.NewString(), UserID: user.ID, OrganizationID: org.ID, Role: role, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpError(w, 409, "Email ja cadastrado")
		return
	}
	a.issueSessionResponse(w, user, orgs[0], role, 201)
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email          string  `json:"email"`
		Password       string  `json:"password"`
		OrganizationID *string `json:"organizationId"`
	}
	if !decode(w, r, &input) {
		return
	}
	var user User
	if err := a.db.Where("lower(email) = ? AND status = ?", normalizeEmail(input.Email), "active").First(&user).Error; err != nil {
		httpError(w, 401, "Unauthorized")
		return
	}
	ok, _ := verifyPassword(input.Password, user.PasswordHash)
	if !ok {
		httpError(w, 401, "Unauthorized")
		return
	}
	org, membership, err := a.resolveLoginOrganization(user.ID, input.OrganizationID)
	if err != nil {
		httpError(w, 401, "Unauthorized")
		return
	}
	a.issueSessionResponse(w, user, org, membership.Role, 200)
}

func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token != "" {
		a.db.Where("token_hash = ?", hashToken(token)).Delete(&AuthSession{})
	}
	clearSessionCookie(w)
	w.WriteHeader(204)
}

func (a *App) me(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	if actor == nil {
		httpError(w, 401, "Unauthorized")
		return
	}
	var user User
	var org Organization
	var membership OrganizationMembership
	a.db.First(&user, "id = ?", actor.UserID)
	a.db.First(&org, "id = ?", actor.OrganizationID)
	a.db.First(&membership, "user_id = ? AND organization_id = ?", actor.UserID, actor.OrganizationID)
	writeJSON(w, 200, map[string]any{"user": publicUser(user), "organization": org, "membership": membership, "organizations": a.organizationsForUser(actor.UserID)})
}

func (a *App) switchOrganization(w http.ResponseWriter, r *http.Request) {
	actor := actorFromCtx(r)
	var input struct {
		OrganizationID string `json:"organizationId"`
	}
	if actor == nil || !decode(w, r, &input) {
		return
	}
	var user User
	var org Organization
	var membership OrganizationMembership
	if err := a.db.First(&user, "id = ?", actor.UserID).Error; err != nil {
		httpError(w, 401, "Unauthorized")
		return
	}
	if err := a.db.First(&membership, "user_id = ? AND organization_id = ?", actor.UserID, input.OrganizationID).Error; err != nil {
		httpError(w, 403, "Organização não permitida")
		return
	}
	a.db.First(&org, "id = ?", input.OrganizationID)
	a.issueSessionResponse(w, user, org, membership.Role, 200)
}

func (a *App) passwordResetRequest(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &input) {
		return
	}
	var user User
	if err := a.db.Where("lower(email) = ? AND status = ?", normalizeEmail(input.Email), "active").First(&user).Error; err != nil {
		writeJSON(w, 202, map[string]any{})
		return
	}
	token := createResetToken()
	reset := PasswordResetToken{ID: uuid.NewString(), UserID: user.ID, TokenHash: hashToken(token), ExpiresAt: time.Now().UTC().Add(15 * time.Minute), CreatedAt: time.Now().UTC()}
	a.db.Create(&reset)
	if os.Getenv("NODE_ENV") == "test" || os.Getenv("TESTHUB_ALLOW_DISPLAY_RESET") == "true" {
		writeJSON(w, 202, map[string]any{"resetToken": token})
		return
	}
	writeJSON(w, 202, map[string]any{})
}

func (a *App) passwordResetConfirm(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ResetToken string `json:"resetToken"`
		Password   string `json:"password"`
	}
	if !decode(w, r, &input) {
		return
	}
	if len(input.Password) < 8 {
		httpError(w, 400, "ValidationError")
		return
	}
	var reset PasswordResetToken
	if err := a.db.Where("token_hash = ? AND expires_at > ? AND used_at IS NULL", hashToken(input.ResetToken), time.Now().UTC()).First(&reset).Error; err != nil {
		httpError(w, 400, "Token inválido")
		return
	}
	hash, _ := hashPassword(input.Password)
	now := time.Now().UTC()
	a.db.Transaction(func(tx *gorm.DB) error {
		tx.Model(&User{}).Where("id = ?", reset.UserID).Updates(map[string]any{"password_hash": hash, "updated_at": now})
		tx.Model(&PasswordResetToken{}).Where("id = ? AND used_at IS NULL", reset.ID).Update("used_at", now)
		tx.Where("user_id = ?", reset.UserID).Delete(&AuthSession{})
		return nil
	})
	w.WriteHeader(204)
}

func (a *App) listPublicOrganizations(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("TESTHUB_ALLOW_ORG_DISCOVERY") != "true" {
		writeJSON(w, 200, []Organization{})
		return
	}
	var orgs []Organization
	a.db.Where("status = ?", "active").Order("name asc").Find(&orgs)
	writeJSON(w, 200, orgs)
}
