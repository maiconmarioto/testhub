package app

import (
	"bytes"
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"golang.org/x/crypto/scrypt"
	"gopkg.in/yaml.v3"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const (
	sessionCookieName = "testhub_session"
	legacyOrgID       = "legacy-local"
	encPrefix         = "enc:v1:"
)

var oidcCache = struct {
	sync.Mutex
	jwks map[string]cachedJWKS
}{jwks: map[string]cachedJWKS{}}

type App struct {
	db      *gorm.DB
	rootDir string
}

type EntityStatus string
type RunStatus string
type Role string

type User struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"not null;index:idx_users_email" json:"email"`
	Name         *string   `json:"name,omitempty"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Status       string    `gorm:"not null;index" json:"status"`
	CreatedAt    time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"not null" json:"updatedAt"`
}

type Organization struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Slug      string    `gorm:"not null;uniqueIndex" json:"slug"`
	Status    string    `gorm:"not null;index" json:"status"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"not null" json:"updatedAt"`
}

type OrganizationMembership struct {
	ID             string    `gorm:"primaryKey" json:"id"`
	OrganizationID string    `gorm:"not null;uniqueIndex:idx_membership_org_user;index" json:"organizationId"`
	UserID         string    `gorm:"not null;uniqueIndex:idx_membership_org_user;index" json:"userId"`
	Role           string    `gorm:"not null" json:"role"`
	CreatedAt      time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt      time.Time `gorm:"not null" json:"updatedAt"`
}

type AuthSession struct {
	ID             string     `gorm:"primaryKey" json:"id"`
	UserID         string     `gorm:"not null;index" json:"userId"`
	OrganizationID string     `gorm:"not null;index" json:"organizationId"`
	TokenHash      string     `gorm:"not null;uniqueIndex" json:"tokenHash"`
	ExpiresAt      time.Time  `gorm:"not null;index" json:"expiresAt"`
	CreatedAt      time.Time  `gorm:"not null" json:"createdAt"`
	LastUsedAt     *time.Time `json:"lastUsedAt,omitempty"`
}

type PasswordResetToken struct {
	ID        string     `gorm:"primaryKey" json:"id"`
	UserID    string     `gorm:"not null;index" json:"userId"`
	TokenHash string     `gorm:"not null;uniqueIndex" json:"tokenHash"`
	ExpiresAt time.Time  `gorm:"not null;index" json:"expiresAt"`
	UsedAt    *time.Time `json:"usedAt,omitempty"`
	CreatedAt time.Time  `gorm:"not null" json:"createdAt"`
}

type PersonalAccessToken struct {
	ID                    string         `gorm:"primaryKey" json:"id"`
	UserID                string         `gorm:"not null;index" json:"userId"`
	Name                  string         `gorm:"not null" json:"name"`
	TokenHash             string         `gorm:"not null;uniqueIndex" json:"-"`
	Token                 string         `gorm:"not null" json:"token,omitempty"`
	TokenPreview          string         `gorm:"not null" json:"tokenPreview"`
	OrganizationIDs       datatypes.JSON `gorm:"type:jsonb" json:"organizationIds,omitempty"`
	DefaultOrganizationID string         `gorm:"not null" json:"defaultOrganizationId"`
	Status                string         `gorm:"not null;index" json:"status"`
	CreatedAt             time.Time      `gorm:"not null" json:"createdAt"`
	UpdatedAt             time.Time      `gorm:"not null" json:"updatedAt"`
	LastUsedAt            *time.Time     `json:"lastUsedAt,omitempty"`
}

type Project struct {
	ID               string    `gorm:"primaryKey" json:"id"`
	OrganizationID   string    `gorm:"not null;index" json:"organizationId"`
	Name             string    `gorm:"not null" json:"name"`
	Description      *string   `json:"description,omitempty"`
	RetentionDays    *int      `json:"retentionDays,omitempty"`
	CleanupArtifacts *bool     `json:"cleanupArtifacts,omitempty"`
	Status           string    `gorm:"not null;index" json:"status"`
	CreatedAt        time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt        time.Time `gorm:"not null" json:"updatedAt"`
}

type Environment struct {
	ID        string         `gorm:"primaryKey" json:"id"`
	ProjectID string         `gorm:"not null;index" json:"projectId"`
	Name      string         `gorm:"not null" json:"name"`
	BaseURL   string         `gorm:"not null" json:"baseUrl"`
	Status    string         `gorm:"not null;index" json:"status"`
	Variables datatypes.JSON `gorm:"type:jsonb" json:"variables,omitempty"`
	CreatedAt time.Time      `gorm:"not null" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"not null" json:"updatedAt"`
}

type Suite struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	ProjectID   string    `gorm:"not null;index" json:"projectId"`
	Name        string    `gorm:"not null" json:"name"`
	Type        string    `gorm:"not null" json:"type"`
	SpecPath    string    `gorm:"not null" json:"specPath"`
	SpecContent string    `gorm:"type:text" json:"-"`
	Status      string    `gorm:"not null;index" json:"status"`
	CreatedAt   time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"not null" json:"updatedAt"`
}

type RunRecord struct {
	ID             string         `gorm:"primaryKey" json:"id"`
	ProjectID      string         `gorm:"not null;index" json:"projectId"`
	EnvironmentID  string         `gorm:"not null;index" json:"environmentId"`
	SuiteID        string         `gorm:"not null;index" json:"suiteId"`
	Status         string         `gorm:"not null;index" json:"status"`
	ReportPath     *string        `json:"reportPath,omitempty"`
	ReportHTMLPath *string        `json:"reportHtmlPath,omitempty"`
	Error          *string        `json:"error,omitempty"`
	CreatedAt      time.Time      `gorm:"not null;index" json:"createdAt"`
	StartedAt      *time.Time     `json:"startedAt,omitempty"`
	FinishedAt     *time.Time     `json:"finishedAt,omitempty"`
	Summary        datatypes.JSON `gorm:"type:jsonb" json:"summary,omitempty"`
	Progress       datatypes.JSON `gorm:"type:jsonb" json:"progress,omitempty"`
	HeartbeatAt    *time.Time     `json:"heartbeatAt,omitempty"`
}

type AIConnection struct {
	ID             string    `gorm:"primaryKey" json:"id"`
	OrganizationID string    `gorm:"not null;index" json:"organizationId"`
	Name           string    `gorm:"not null" json:"name"`
	Provider       string    `gorm:"not null" json:"provider"`
	APIKey         *string   `json:"apiKey,omitempty"`
	Model          string    `gorm:"not null" json:"model"`
	BaseURL        *string   `json:"baseUrl,omitempty"`
	Enabled        string    `gorm:"not null" json:"enabled"`
	CreatedAt      time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt      time.Time `gorm:"not null" json:"updatedAt"`
}

type FlowLibraryItem struct {
	ID             string         `gorm:"primaryKey" json:"id"`
	OrganizationID string         `gorm:"not null;index" json:"organizationId"`
	Namespace      string         `gorm:"not null;index:idx_flow_lookup" json:"namespace"`
	Name           string         `gorm:"not null;index:idx_flow_lookup" json:"name"`
	DisplayName    *string        `json:"displayName,omitempty"`
	Description    *string        `json:"description,omitempty"`
	ProjectIDs     datatypes.JSON `gorm:"type:jsonb" json:"projectIds,omitempty"`
	Params         datatypes.JSON `gorm:"type:jsonb" json:"params,omitempty"`
	Steps          datatypes.JSON `gorm:"type:jsonb;not null" json:"steps"`
	Status         string         `gorm:"not null;index" json:"status"`
	CreatedAt      time.Time      `gorm:"not null" json:"createdAt"`
	UpdatedAt      time.Time      `gorm:"not null" json:"updatedAt"`
}

type RunJob struct {
	ID          string     `gorm:"primaryKey" json:"id"`
	RunID       string     `gorm:"not null;index" json:"runId"`
	Type        string     `gorm:"not null;index" json:"type"`
	Status      string     `gorm:"not null;index" json:"status"`
	Attempts    int        `gorm:"not null" json:"attempts"`
	MaxAttempts int        `gorm:"not null" json:"maxAttempts"`
	AvailableAt time.Time  `gorm:"not null;index" json:"availableAt"`
	LockedAt    *time.Time `json:"lockedAt,omitempty"`
	LockedBy    *string    `json:"lockedBy,omitempty"`
	LastError   *string    `json:"lastError,omitempty"`
	CreatedAt   time.Time  `gorm:"not null" json:"createdAt"`
	UpdatedAt   time.Time  `gorm:"not null" json:"updatedAt"`
}

type AuditEntry struct {
	ID             string         `gorm:"primaryKey" json:"id"`
	Action         string         `gorm:"not null;index" json:"action"`
	OrganizationID *string        `gorm:"index" json:"organizationId,omitempty"`
	Actor          string         `gorm:"not null;index" json:"actor"`
	ActorRole      *string        `json:"actorRole,omitempty"`
	Target         *string        `json:"target,omitempty"`
	Status         string         `gorm:"not null;index" json:"status"`
	Detail         datatypes.JSON `gorm:"type:jsonb" json:"detail,omitempty"`
	CreatedAt      time.Time      `gorm:"not null;index" json:"createdAt"`
}

func (RunRecord) TableName() string {
	return "runs"
}

func (FlowLibraryItem) TableName() string {
	return "flow_library"
}

type Actor struct {
	ID             string
	UserID         string
	OrganizationID string
	Email          string
	Name           string
	Role           string
	Source         string
}

func Run() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return errors.New("DATABASE_URL obrigatorio")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return err
	}
	app := &App{db: db, rootDir: abs(env("TESTHUB_DATA_DIR", ".testhub-data"))}
	if err := app.migrate(); err != nil {
		return err
	}
	app.ensureDirs()
	port := env("PORT", "4321")
	log.Printf("TestHub Go API: http://localhost:%s", port)
	return http.ListenAndServe("0.0.0.0:"+port, app.routes())
}

func (a *App) migrate() error {
	if err := a.db.AutoMigrate(
		&User{}, &Organization{}, &OrganizationMembership{}, &AuthSession{},
		&PasswordResetToken{}, &PersonalAccessToken{}, &Project{}, &Environment{},
		&Suite{}, &RunRecord{}, &AIConnection{}, &FlowLibraryItem{}, &AuditEntry{},
	); err != nil {
		return err
	}
	if !a.db.Migrator().HasTable(&RunJob{}) {
		return a.db.AutoMigrate(&RunJob{})
	}
	return a.migrateSuiteSpecContent()
}

func (a *App) migrateSuiteSpecContent() error {
	var rows []Suite
	if err := a.db.Where("(spec_content IS NULL OR spec_content = '') AND spec_path <> ''").Find(&rows).Error; err != nil {
		return err
	}
	for _, suite := range rows {
		content, err := os.ReadFile(suite.SpecPath)
		if err != nil || len(content) == 0 {
			continue
		}
		if err := a.db.Model(&Suite{}).Where("id = ? AND (spec_content IS NULL OR spec_content = '')", suite.ID).Update("spec_content", string(content)).Error; err != nil {
			return err
		}
	}
	return nil
}

func (a *App) ensureDirs() {
	_ = os.MkdirAll(a.runsDir(), 0o755)
}

func (a *App) routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(a.securityHeaders)
	r.Use(a.cors)
	r.Use(a.authMiddleware)

	a.registerSystemRoutes(r)
	a.registerAuthRoutes(r)
	a.registerIdentityRoutes(r)
	a.registerProjectRoutes(r)
	a.registerSuiteFlowRoutes(r)
	a.registerRunRoutes(r)
	a.registerAIAuditRoutes(r)
	return r
}

func (a *App) registerSystemRoutes(r chi.Router) {
	r.Get("/", a.root)
	r.Get("/openapi.json", a.openapi)
	r.Get("/api/health", a.health)
	r.Get("/api/system/security", a.securityStatus)
}

func (a *App) registerAuthRoutes(r chi.Router) {
	r.Get("/api/auth/organizations", a.listPublicOrganizations)
	r.Post("/api/auth/register", a.register)
	r.Post("/api/auth/login", a.login)
	r.Post("/api/auth/logout", a.logout)
	r.Get("/api/auth/me", a.me)
	r.Post("/api/auth/switch-organization", a.switchOrganization)
	r.Post("/api/auth/password-reset/request", a.passwordResetRequest)
	r.Post("/api/auth/password-reset/confirm", a.passwordResetConfirm)
}

func (a *App) registerIdentityRoutes(r chi.Router) {
	r.Get("/api/users", a.listUsers)
	r.Get("/api/users/me", a.getCurrentUser)
	r.Put("/api/users/me", a.updateCurrentUser)
	r.Get("/api/users/me/tokens", a.listPersonalTokens)
	r.Post("/api/users/me/tokens", a.createPersonalToken)
	r.Delete("/api/users/me/tokens/{id}", a.revokePersonalToken)
	r.Patch("/api/users/{id}/memberships", a.updateUserMemberships)

	r.Get("/api/organizations", a.listOrganizations)
	r.Post("/api/organizations", a.createOrganization)
	r.Get("/api/organizations/current/members", a.listCurrentMembers)
	r.Post("/api/organizations/current/members", a.createCurrentMember)
}

func (a *App) registerProjectRoutes(r chi.Router) {
	r.Get("/api/projects", a.listProjects)
	r.Post("/api/projects", a.createProject)
	r.Get("/api/projects/{id}", a.getProject)
	r.Put("/api/projects/{id}", a.updateProject)
	r.Delete("/api/projects/{id}", a.deleteProject)

	r.Get("/api/environments", a.listEnvironments)
	r.Post("/api/environments", a.createEnvironment)
	r.Get("/api/environments/{id}", a.getEnvironment)
	r.Put("/api/environments/{id}", a.updateEnvironment)
	r.Delete("/api/environments/{id}", a.deleteEnvironment)
}

func (a *App) registerSuiteFlowRoutes(r chi.Router) {
	r.Get("/api/suites", a.listSuites)
	r.Post("/api/suites", a.createSuite)
	r.Get("/api/suites/{id}", a.getSuite)
	r.Put("/api/suites/{id}", a.updateSuite)
	r.Post("/api/spec/validate", a.validateSpec)
	r.Post("/api/import/openapi", a.importOpenAPI)

	r.Get("/api/flows", a.listFlows)
	r.Post("/api/flows", a.upsertFlow)
	r.Get("/api/flows/{id}", a.getFlow)
	r.Put("/api/flows/{id}", a.upsertFlow)
	r.Delete("/api/flows/{id}", a.deleteFlow)
}

func (a *App) registerRunRoutes(r chi.Router) {
	r.Get("/api/runs", a.listRuns)
	r.Post("/api/runs", a.createRun)
	r.Get("/api/runs/{id}", a.getRun)
	r.Post("/api/runs/{id}/cancel", a.cancelRun)
	r.Delete("/api/runs/{id}", a.deleteRun)
	r.Get("/api/runs/{id}/report", a.runReport)

	r.Post("/api/cleanup", a.cleanup)
	r.Get("/artifacts", a.artifact)
}

func (a *App) registerAIAuditRoutes(r chi.Router) {
	r.Get("/api/audit", a.listAudit)
	r.Get("/api/audit/export", a.exportAudit)

	r.Get("/api/ai/connections", a.listAIConnections)
	r.Post("/api/ai/connections", a.upsertAIConnection)
	r.Post("/api/ai/apply-test-fix", a.applyTestFix)
	r.Post("/api/ai/{kind}", a.callAI)
}

func (a *App) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		if !isSafeMethod(r.Method) && !originAllowedForMutation(r) {
			httpError(w, 403, "Origin não permitida")
			return
		}
		if isPublicRoute(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		if authMode() == "local" {
			var count int64
			a.db.Model(&User{}).Where("status = ?", "active").Count(&count)
			if count == 0 {
				writeJSON(w, 401, map[string]any{"error": "SetupRequired", "setupRequired": true})
				return
			}
		}
		actor, err := a.actorFromRequest(r)
		if err != nil || actor == nil {
			httpError(w, 401, "Unauthorized")
			return
		}
		if p := permissionFor(r.Method, r.URL.Path); p != "" && !hasPermission(actor.Role, p) {
			a.writeAudit(r, "rbac.denied "+r.Method+" "+r.URL.Path, actor, "blocked", map[string]any{"permission": p}, nil)
			httpError(w, 403, "Papel "+actor.Role+" não permite "+p)
			return
		}
		next.ServeHTTP(w, r.WithContext(withActor(r.Context(), actor)))
	})
}

func (a *App) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func (a *App) actorFromRequest(r *http.Request) (*Actor, error) {
	mode := authMode()
	if mode == "off" {
		return &Actor{ID: "local-dev", Role: "admin", Source: "local", Name: "Local dev", OrganizationID: legacyOrgID}, nil
	}
	token := tokenFromRequest(r)
	if token == "" {
		return nil, errors.New("no token")
	}
	if mode == "token" {
		if os.Getenv("TESTHUB_TOKEN") == "" || token != os.Getenv("TESTHUB_TOKEN") {
			return nil, errors.New("bad token")
		}
		return &Actor{ID: "api-token", Role: fallbackRole(), Source: "token", Name: "API token", OrganizationID: legacyOrgID}, nil
	}
	if mode == "oidc" {
		return a.actorFromOIDC(token)
	}
	var session AuthSession
	if err := a.db.Where("token_hash = ? AND expires_at > ?", hashToken(token), time.Now().UTC()).First(&session).Error; err == nil {
		var user User
		var membership OrganizationMembership
		if a.db.First(&user, "id = ? AND status = ?", session.UserID, "active").Error != nil {
			return nil, errors.New("bad user")
		}
		if a.db.First(&membership, "user_id = ? AND organization_id = ?", user.ID, session.OrganizationID).Error != nil {
			return nil, errors.New("bad membership")
		}
		return &Actor{ID: user.ID, UserID: user.ID, OrganizationID: session.OrganizationID, Email: user.Email, Name: str(user.Name), Role: membership.Role, Source: "local"}, nil
	}
	return a.actorFromPAT(token, r.Header.Get("x-testhub-organization-id"))
}

func (a *App) actorFromPAT(token, requested string) (*Actor, error) {
	var pat PersonalAccessToken
	if err := a.db.Where("token_hash = ? AND status = ?", hashToken(token), "active").First(&pat).Error; err != nil {
		return nil, err
	}
	var user User
	if err := a.db.First(&user, "id = ? AND status = ?", pat.UserID, "active").Error; err != nil {
		return nil, err
	}
	memberships := a.membershipsForUser(user.ID)
	memberOrg := map[string]OrganizationMembership{}
	for _, m := range memberships {
		memberOrg[m.OrganizationID] = m
	}
	scoped := jsonStringSlice(pat.OrganizationIDs)
	if len(scoped) == 0 {
		for id := range memberOrg {
			scoped = append(scoped, id)
		}
	}
	orgID := ""
	if requested != "" && contains(scoped, requested) {
		orgID = requested
	} else if contains(scoped, pat.DefaultOrganizationID) {
		orgID = pat.DefaultOrganizationID
	} else if len(scoped) > 0 {
		orgID = scoped[0]
	}
	m, ok := memberOrg[orgID]
	if !ok {
		return nil, errors.New("bad org")
	}
	now := time.Now().UTC()
	a.db.Model(&PersonalAccessToken{}).Where("id = ?", pat.ID).Updates(map[string]any{"last_used_at": now, "updated_at": now})
	return &Actor{ID: pat.ID, UserID: user.ID, OrganizationID: orgID, Email: user.Email, Name: str(user.Name), Role: m.Role, Source: "token"}, nil
}

func (a *App) actorFromOIDC(token string) (*Actor, error) {
	claims, err := verifyOIDCJWT(token)
	if err != nil {
		return nil, err
	}
	id := firstClaimString(claims["sub"], claims["email"], "oidc-user")
	return &Actor{
		ID:             id,
		OrganizationID: legacyOrgID,
		Email:          firstClaimString(claims["email"]),
		Name:           firstClaimString(claims["name"]),
		Role:           roleFromClaims(claims),
		Source:         "oidc",
	}, nil
}

func (a *App) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && corsOrigins()[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "authorization,content-type,x-testhub-organization-id")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) issueSessionResponse(w http.ResponseWriter, user User, org Organization, role string, status int) {
	token := createSessionToken()
	now := time.Now().UTC()
	expires := now.Add(7 * 24 * time.Hour)
	a.db.Create(&AuthSession{ID: uuid.NewString(), UserID: user.ID, OrganizationID: org.ID, TokenHash: hashToken(token), ExpiresAt: expires, CreatedAt: now})
	setSessionCookie(w, token, expires)
	var membership OrganizationMembership
	a.db.First(&membership, "user_id = ? AND organization_id = ?", user.ID, org.ID)
	writeJSON(w, status, map[string]any{"user": publicUser(user), "organization": org, "membership": membership, "organizations": a.organizationsForUser(user.ID), "token": token})
}

func (a *App) resolveLoginOrganization(userID string, requested *string) (Organization, OrganizationMembership, error) {
	var memberships []OrganizationMembership
	a.db.Where("user_id = ?", userID).Find(&memberships)
	for _, m := range memberships {
		if requested == nil || *requested == m.OrganizationID {
			var org Organization
			if a.db.First(&org, "id = ? AND status = ?", m.OrganizationID, "active").Error == nil {
				return org, m, nil
			}
		}
	}
	return Organization{}, OrganizationMembership{}, errors.New("not found")
}

func (a *App) membershipsForUser(userID string) []OrganizationMembership {
	var rows []OrganizationMembership
	a.db.Where("user_id = ?", userID).Find(&rows)
	return rows
}

func (a *App) organizationsForUser(userID string) []Organization {
	var ms []OrganizationMembership
	a.db.Where("user_id = ?", userID).Find(&ms)
	ids := []string{}
	for _, m := range ms {
		ids = append(ids, m.OrganizationID)
	}
	var orgs []Organization
	if len(ids) > 0 {
		a.db.Where("id IN ? AND status = ?", ids, "active").Find(&orgs)
	}
	return orgs
}

func (a *App) projectByIDInOrg(id, orgID string) (Project, bool) {
	var p Project
	return p, a.db.Where("id = ? AND organization_id = ? AND status <> ?", id, orgID, "inactive").First(&p).Error == nil
}

func (a *App) projectInOrg(w http.ResponseWriter, r *http.Request, id string) (Project, bool) {
	actor := actorFromCtx(r)
	p, ok := a.projectByIDInOrg(id, actor.OrganizationID)
	if !ok {
		httpError(w, 404, "Projeto não encontrado")
	}
	return p, ok
}

func (a *App) environmentByID(id, projectID string) (Environment, bool) {
	var e Environment
	return e, a.db.Where("id = ? AND project_id = ? AND status <> ?", id, projectID, "inactive").First(&e).Error == nil
}

func (a *App) environmentInOrg(w http.ResponseWriter, r *http.Request, id string) (Environment, bool) {
	actor := actorFromCtx(r)
	var e Environment
	err := a.db.Where("id = ? AND status <> ? AND project_id IN (?)", id, "inactive", a.db.Model(&Project{}).Select("id").Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive")).First(&e).Error
	if err != nil {
		httpError(w, 404, "Environment não encontrado")
		return e, false
	}
	return e, true
}

func (a *App) suiteByID(id, projectID string) (Suite, bool) {
	var s Suite
	return s, a.db.Where("id = ? AND project_id = ? AND status <> ?", id, projectID, "inactive").First(&s).Error == nil
}

func (a *App) suiteInOrg(w http.ResponseWriter, r *http.Request, id string) (Suite, bool) {
	actor := actorFromCtx(r)
	var s Suite
	err := a.db.Where("id = ? AND status <> ? AND project_id IN (?)", id, "inactive", a.db.Model(&Project{}).Select("id").Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive")).First(&s).Error
	if err != nil {
		httpError(w, 404, "Suite não encontrada")
		return s, false
	}
	return s, true
}

func (a *App) runInOrg(w http.ResponseWriter, r *http.Request, id string) (RunRecord, bool) {
	actor := actorFromCtx(r)
	var run RunRecord
	err := a.db.Where("id = ? AND status <> ? AND project_id IN (?)", id, "deleted", a.db.Model(&Project{}).Select("id").Where("organization_id = ? AND status <> ?", actor.OrganizationID, "inactive")).First(&run).Error
	if err != nil {
		httpError(w, 404, "Run não encontrada")
		return run, false
	}
	return run, true
}

func (a *App) suiteSpecContent(s Suite) string {
	if s.SpecContent != "" {
		return s.SpecContent
	}
	if s.SpecPath == "" || strings.HasPrefix(s.SpecPath, "postgres:") {
		return ""
	}
	content, err := os.ReadFile(s.SpecPath)
	if err != nil {
		return ""
	}
	if len(content) > 0 {
		_ = a.db.Model(&Suite{}).Where("id = ? AND (spec_content IS NULL OR spec_content = '')", s.ID).Update("spec_content", string(content)).Error
	}
	return string(content)
}

func (a *App) writeAudit(r *http.Request, action string, actor *Actor, status string, detail map[string]any, target *string) {
	if actor == nil {
		return
	}
	role := actor.Role
	entry := AuditEntry{ID: uuid.NewString(), Action: action, OrganizationID: &actor.OrganizationID, Actor: actorLabel(actor), ActorRole: &role, Target: target, Status: status, Detail: mustJSON(detail), CreatedAt: time.Now().UTC()}
	a.db.Create(&entry)
}

func (a *App) suitesDir() string { return filepath.Join(a.rootDir, "suites") }
func (a *App) runsDir() string   { return filepath.Join(a.rootDir, "runs") }

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if r.Body == nil {
		return true
	}
	r.Body = http.MaxBytesReader(w, r.Body, int64(envInt("TESTHUB_MAX_BODY_BYTES", 2*1024*1024)))
	if err := json.NewDecoder(r.Body).Decode(v); err != nil && err != io.EOF {
		httpError(w, 400, "ValidationError")
		return false
	}
	return true
}

func publicUser(u User) map[string]any {
	out := map[string]any{"id": u.ID, "email": u.Email, "status": u.Status, "createdAt": u.CreatedAt, "updatedAt": u.UpdatedAt}
	if u.Name != nil {
		out["name"] = *u.Name
	}
	return out
}

func publicPAT(t PersonalAccessToken) map[string]any {
	out := map[string]any{"id": t.ID, "userId": t.UserID, "name": t.Name, "tokenPreview": t.TokenPreview, "tokenMasked": t.TokenPreview, "defaultOrganizationId": t.DefaultOrganizationID, "status": t.Status, "createdAt": t.CreatedAt, "updatedAt": t.UpdatedAt}
	if ids := jsonStringSlice(t.OrganizationIDs); len(ids) > 0 {
		out["organizationIds"] = ids
	}
	return out
}

func safeAI(c AIConnection) AIConnection {
	if c.APIKey != nil {
		v := "[REDACTED]"
		c.APIKey = &v
	}
	return c
}

func maskEnvironment(e Environment) map[string]any {
	out := map[string]any{"id": e.ID, "projectId": e.ProjectID, "name": e.Name, "baseUrl": e.BaseURL, "status": e.Status, "createdAt": e.CreatedAt, "updatedAt": e.UpdatedAt}
	if len(e.Variables) > 0 {
		var m map[string]string
		_ = json.Unmarshal(e.Variables, &m)
		masked := map[string]string{}
		for k := range m {
			masked[k] = "[REDACTED]"
		}
		out["variables"] = masked
	}
	return out
}

func maskEnvironments(envs []Environment) []map[string]any {
	out := []map[string]any{}
	for _, e := range envs {
		out = append(out, maskEnvironment(e))
	}
	return out
}

func hashPassword(password string) (string, error) {
	salt := randomHex(16)
	derived, err := scrypt.Key([]byte(password), []byte(salt), 16384, 8, 1, 64)
	if err != nil {
		return "", err
	}
	return "scrypt:" + salt + ":" + hex.EncodeToString(derived), nil
}

func verifyPassword(password, stored string) (bool, error) {
	parts := strings.Split(stored, ":")
	if len(parts) != 3 || parts[0] != "scrypt" {
		return false, nil
	}
	expected, err := hex.DecodeString(parts[2])
	if err != nil {
		return false, err
	}
	actual, err := scrypt.Key([]byte(password), []byte(parts[1]), 16384, 8, 1, 64)
	if err != nil {
		return false, err
	}
	return len(actual) == len(expected) && subtle.ConstantTimeCompare(actual, expected) == 1, nil
}

func encryptSecret(value string) (string, error) {
	key := sha256.Sum256([]byte(os.Getenv("TESTHUB_SECRET_KEY")))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := randBytes(12)
	ciphertext := gcm.Seal(nil, iv, []byte(value), nil)
	tagStart := len(ciphertext) - gcm.Overhead()
	payload := append(append(iv, ciphertext[tagStart:]...), ciphertext[:tagStart]...)
	return encPrefix + base64.StdEncoding.EncodeToString(payload), nil
}

func decryptSecret(value string) (string, error) {
	if !strings.HasPrefix(value, encPrefix) {
		return value, nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encPrefix))
	if err != nil {
		return "", err
	}
	if len(raw) < 28 {
		return "", errors.New("secret invalido")
	}
	key := sha256.Sum256([]byte(os.Getenv("TESTHUB_SECRET_KEY")))
	block, _ := aes.NewCipher(key[:])
	gcm, _ := cipher.NewGCM(block)
	iv, tag, encrypted := raw[:12], raw[12:28], raw[28:]
	nodeShape := append(encrypted, tag...)
	plain, err := gcm.Open(nil, iv, nodeShape, nil)
	return string(plain), err
}

func encryptVariables(vars map[string]string) (datatypes.JSON, error) {
	if vars == nil {
		return nil, nil
	}
	out := map[string]string{}
	for k, v := range vars {
		enc, err := encryptSecret(v)
		if err != nil {
			return nil, err
		}
		out[k] = enc
	}
	return mustJSON(out), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func createSessionToken() string { return randomHex(24) }
func createResetToken() string   { return randomHex(20) }
func createPAT() string          { return "th_pat_" + base64.RawURLEncoding.EncodeToString(randBytes(32)) }

func randomHex(n int) string { return hex.EncodeToString(randBytes(n)) }
func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func tokenPreview(token string) string {
	if len(token) < 16 {
		return token
	}
	return token[:10] + "..." + token[len(token)-6:]
}

func authMode() string {
	v := strings.ToLower(os.Getenv("TESTHUB_AUTH_MODE"))
	if v == "off" {
		if os.Getenv("NODE_ENV") == "production" {
			return "local"
		}
		return "off"
	}
	if v == "token" || v == "oidc" || v == "local" {
		return v
	}
	if oidcConfigured() {
		return "oidc"
	}
	if os.Getenv("TESTHUB_TOKEN") != "" {
		return "token"
	}
	return "local"
}

func fallbackRole() string {
	v := strings.ToLower(os.Getenv("TESTHUB_ROLE"))
	if v == "viewer" || v == "editor" {
		return v
	}
	return "admin"
}

func normalizeRole(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "viewer":
		return "viewer"
	case "editor":
		return "editor"
	default:
		return "admin"
	}
}

func roleFromClaims(claims map[string]any) string {
	if role := firstClaimString(claims["role"], claims["testhub_role"]); role != "" {
		return normalizeRole(role)
	}
	groups := append(claimStrings(claims["groups"]), claimStrings(claims["roles"])...)
	for _, group := range groups {
		if contains(envList("TESTHUB_ADMIN_GROUPS"), group) {
			return "admin"
		}
	}
	for _, group := range groups {
		if contains(envList("TESTHUB_EDITOR_GROUPS"), group) {
			return "editor"
		}
	}
	for _, group := range groups {
		if contains(envList("TESTHUB_VIEWER_GROUPS"), group) {
			return "viewer"
		}
	}
	return fallbackRole()
}

func hasPermission(role, permission string) bool {
	if role == "admin" {
		return true
	}
	if role == "editor" {
		return permission != "settings:write" && permission != "audit:read"
	}
	return false
}

func permissionFor(method, path string) string {
	if method == "GET" {
		if strings.HasPrefix(path, "/api/audit") {
			return "audit:read"
		}
		if path == "/api/users" || path == "/api/organizations" {
			return "settings:write"
		}
		return ""
	}
	switch {
	case strings.HasPrefix(path, "/api/projects"):
		return "project:write"
	case strings.HasPrefix(path, "/api/environments"):
		return "environment:write"
	case strings.HasPrefix(path, "/api/suites"), strings.HasPrefix(path, "/api/flows"), strings.HasPrefix(path, "/api/import/openapi"), strings.HasPrefix(path, "/api/spec/validate"):
		return "suite:write"
	case strings.HasPrefix(path, "/api/runs"):
		return "run:write"
	case strings.HasPrefix(path, "/api/users/") && strings.HasSuffix(path, "/memberships"), path == "/api/organizations", strings.HasPrefix(path, "/api/organizations/current/members"), strings.HasPrefix(path, "/api/ai/connections"), strings.HasPrefix(path, "/api/cleanup"):
		return "settings:write"
	case strings.HasPrefix(path, "/api/ai/"):
		return "ai:write"
	}
	return ""
}

func isPublicRoute(path string) bool {
	return path == "/" || path == "/api/health" || path == "/docs" || strings.HasPrefix(path, "/docs/") || path == "/openapi.json" || path == "/api/system/security" || path == "/api/auth/organizations" || path == "/api/auth/register" || path == "/api/auth/login" || path == "/api/auth/logout" || path == "/api/auth/password-reset/request" || path == "/api/auth/password-reset/confirm"
}

func tokenFromRequest(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	if c, err := r.Cookie(sessionCookieName); err == nil {
		return c.Value
	}
	return ""
}

func setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: os.Getenv("NODE_ENV") == "production", Expires: expires})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: os.Getenv("NODE_ENV") == "production", MaxAge: -1})
}

func corsOrigins() map[string]bool {
	out := map[string]bool{}
	if os.Getenv("NODE_ENV") != "production" {
		out["http://localhost:3333"], out["http://127.0.0.1:3333"], out["http://localhost:3334"], out["http://127.0.0.1:3334"] = true, true, true, true
	}
	for _, v := range strings.Split(os.Getenv("TESTHUB_CORS_ORIGINS")+","+os.Getenv("TESTHUB_WEB_URL"), ",") {
		v = strings.TrimSpace(v)
		if v != "" {
			out[v] = true
		}
	}
	return out
}

func allowedHosts() []string {
	parts := strings.Split(os.Getenv("TESTHUB_ALLOWED_HOSTS"), ",")
	out := []string{}
	for _, p := range parts {
		if p = strings.TrimSpace(strings.ToLower(p)); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func isHostAllowed(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return false
	}
	allow := allowedHosts()
	if len(allow) == 0 {
		return os.Getenv("NODE_ENV") != "production"
	}
	for _, a := range allow {
		if host == a || strings.HasSuffix(host, "."+a) {
			return true
		}
	}
	return false
}

func environmentReachable(baseURL string) (bool, string) {
	client := http.Client{
		Timeout: time.Duration(envInt("TESTHUB_ENV_HEALTH_TIMEOUT_MS", 5000)) * time.Millisecond,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("redirecionamentos demais")
			}
			if !isHostAllowed(req.URL.String()) {
				return errors.New("redirect host fora da allowlist")
			}
			return nil
		},
	}
	req, err := http.NewRequest("HEAD", baseURL, nil)
	if err != nil {
		return false, "baseUrl inválida"
	}
	resp, err := client.Do(req)
	if err != nil {
		return false, err.Error()
	}
	_ = resp.Body.Close()
	return true, ""
}

type specMeta struct {
	Version int              `yaml:"version"`
	Type    string           `yaml:"type"`
	Name    string           `yaml:"name"`
	Tests   []map[string]any `yaml:"tests"`
	Flows   map[string]struct {
		Steps []map[string]any `yaml:"steps"`
	} `yaml:"flows"`
}

func parseSpecMeta(raw string) specMeta {
	var m specMeta
	_ = yaml.Unmarshal([]byte(raw), &m)
	return m
}

func (a *App) validateSpecContent(raw, orgID, projectID string) error {
	m := parseSpecMeta(raw)
	if m.Version == 0 || m.Name == "" || (m.Type != "api" && m.Type != "web") || len(m.Tests) == 0 {
		return errors.New("Spec invalida")
	}
	if m.Type == "web" {
		refs := flowRefs(m)
		flows := a.flowMap(orgID, projectID)
		for _, ref := range refs {
			if _, ok := flows[ref]; !ok {
				if _, ok := m.Flows[ref]; !ok {
					return fmt.Errorf("Spec invalida:\nflow %q nao encontrado", ref)
				}
			}
		}
	}
	return nil
}

func (a *App) validateFlow(ns, name string, steps []map[string]any, orgID string, projectIDs []string) error {
	key := ns + "." + name
	refs := stepRefs(steps)
	for _, ref := range refs {
		if ref == key {
			return errors.New("Spec invalida:\nciclo em flows: " + key + " -> " + key)
		}
		if _, ok := a.flowMap(orgID, first(projectIDs))[ref]; !ok {
			return fmt.Errorf("Spec invalida:\nflow %q nao encontrado", ref)
		}
	}
	return nil
}

func (a *App) flowMap(orgID, projectID string) map[string]FlowLibraryItem {
	var flows []FlowLibraryItem
	a.db.Where("organization_id = ? AND status <> ?", orgID, "inactive").Find(&flows)
	out := map[string]FlowLibraryItem{}
	for _, f := range flows {
		ids := jsonStringSlice(f.ProjectIDs)
		if projectID == "" || len(ids) == 0 || contains(ids, projectID) {
			out[f.Namespace+"."+f.Name] = f
		}
	}
	return out
}

func flowRefs(m specMeta) []string {
	out := []string{}
	for _, t := range m.Tests {
		if steps, ok := t["steps"].([]any); ok {
			for _, ref := range refsAny(steps) {
				out = append(out, ref)
			}
		}
	}
	for _, f := range m.Flows {
		out = append(out, stepRefs(f.Steps)...)
	}
	return out
}

func stepRefs(steps []map[string]any) []string {
	out := []string{}
	for _, s := range steps {
		if v, ok := s["use"].(string); ok {
			out = append(out, v)
		}
	}
	return out
}

func refsAny(values []any) []string {
	out := []string{}
	for _, item := range values {
		if m, ok := item.(map[string]any); ok {
			if v, ok := m["use"].(string); ok {
				out = append(out, v)
			}
		}
	}
	return out
}

func openAPIToSuite(doc map[string]any, name string, baseURL *string) (string, error) {
	paths, ok := doc["paths"].(map[string]any)
	if !ok || len(paths) == 0 {
		return "", errors.New("OpenAPI invalido: paths ausente")
	}
	tests := []map[string]any{}
	methods := map[string]bool{"get": true, "post": true, "put": true, "patch": true, "delete": true, "head": true, "options": true}
	keys := []string{}
	for p := range paths {
		keys = append(keys, p)
	}
	sort.Strings(keys)
	for _, p := range keys {
		ops, _ := paths[p].(map[string]any)
		for method, raw := range ops {
			if !methods[strings.ToLower(method)] {
				continue
			}
			op, _ := raw.(map[string]any)
			testName := strings.ToUpper(method) + " " + p
			if id, ok := op["operationId"].(string); ok && id != "" {
				testName = id
			}
			tests = append(tests, map[string]any{"name": testName, "request": map[string]any{"method": strings.ToUpper(method), "path": sampleOpenAPIPath(p)}, "expect": map[string]any{"status": 200}})
		}
	}
	out := map[string]any{"version": 1, "type": "api", "name": name, "tests": tests}
	if baseURL != nil {
		out["baseUrl"] = *baseURL
	}
	b, _ := yaml.Marshal(out)
	return string(b), nil
}

func sampleOpenAPIPath(p string) string {
	re := regexp.MustCompile(`\{[^}]+}`)
	return re.ReplaceAllString(p, "1")
}

func callAIProvider(c AIConnection, prompt string) (string, error) {
	if c.APIKey == nil {
		return "", errors.New("AI connection sem apiKey")
	}
	key, err := decryptSecret(*c.APIKey)
	if err != nil {
		return "", err
	}
	if c.Provider == "anthropic" {
		endpoint := envPtr(c.BaseURL, "https://api.anthropic.com/v1/messages")
		body := mustJSONBytes(map[string]any{"model": c.Model, "max_tokens": 1200, "messages": []map[string]string{{"role": "user", "content": prompt}}})
		req, _ := http.NewRequest("POST", endpoint, bytes.NewReader(body))
		req.Header.Set("content-type", "application/json")
		req.Header.Set("x-api-key", key)
		req.Header.Set("anthropic-version", "2023-06-01")
		return doAI(req, "anthropic")
	}
	endpoint := envPtr(c.BaseURL, "https://api.openai.com/v1/chat/completions")
	if c.Provider == "openrouter" && c.BaseURL == nil {
		endpoint = "https://openrouter.ai/api/v1/chat/completions"
	}
	body := mustJSONBytes(map[string]any{"model": c.Model, "messages": []map[string]string{{"role": "user", "content": prompt}}, "temperature": 0.1})
	req, _ := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+key)
	return doAI(req, c.Provider)
}

func isAIBaseURLAllowed(raw, provider string) bool {
	if strings.TrimSpace(raw) == "" {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	defaults := map[string][]string{
		"openai":     {"api.openai.com"},
		"openrouter": {"openrouter.ai"},
		"anthropic":  {"api.anthropic.com"},
	}
	for _, allowed := range defaults[provider] {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return true
		}
	}
	for _, allowed := range envList("TESTHUB_AI_ALLOWED_HOSTS") {
		allowed = strings.ToLower(strings.TrimSpace(allowed))
		if allowed != "" && (host == allowed || strings.HasSuffix(host, "."+allowed)) {
			return true
		}
	}
	return false
}

func doAI(req *http.Request, provider string) (string, error) {
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("%s error %d", provider, resp.StatusCode)
	}
	if choices, ok := body["choices"].([]any); ok && len(choices) > 0 {
		if ch, ok := choices[0].(map[string]any); ok {
			if msg, ok := ch["message"].(map[string]any); ok {
				if s, ok := msg["content"].(string); ok {
					return s, nil
				}
			}
		}
	}
	if content, ok := body["content"].([]any); ok {
		parts := []string{}
		for _, c := range content {
			if m, ok := c.(map[string]any); ok {
				if s, ok := m["text"].(string); ok {
					parts = append(parts, s)
				}
			}
		}
		return strings.Join(parts, "\n"), nil
	}
	return "", nil
}

func promptFor(kind string, ctx any) string {
	b, _ := json.MarshalIndent(ctx, "", "  ")
	switch kind {
	case "explain-failure":
		return "Voce e AI Test Assistant do TestHub.\nClassifique falha em JSON.\n\nContexto sanitizado:\n" + string(b)
	case "suggest-test-fix":
		return "Voce sugere correcao de teste TestHub YAML.\n\nContexto sanitizado:\n" + string(b)
	default:
		return "Voce sugere poucos testes de alto valor para TestHub.\n\nContexto sanitizado:\n" + string(b)
	}
}

func (a *App) enabledAI(orgID string, id *string) (AIConnection, bool) {
	var c AIConnection
	q := a.db.Where("organization_id = ? AND enabled = ?", orgID, "true")
	if id != nil {
		q = q.Where("id = ?", *id)
	}
	return c, q.First(&c).Error == nil
}

func writeRawJSON(w http.ResponseWriter, status int, b []byte) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	w.Write(b)
}

func mapWith(v any, key string, value any) map[string]any {
	b, _ := json.Marshal(v)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	m[key] = value
	return m
}

func mustJSON(v any) datatypes.JSON {
	if v == nil {
		return nil
	}
	b, _ := json.Marshal(v)
	return datatypes.JSON(b)
}

func mustJSONBytes(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func jsonStringSlice(b datatypes.JSON) []string {
	if len(b) == 0 {
		return nil
	}
	var out []string
	_ = json.Unmarshal(b, &out)
	return out
}

func normalizeEmail(v string) string { return strings.ToLower(strings.TrimSpace(v)) }
func slugify(v string) string {
	re := regexp.MustCompile(`[^a-z0-9]+`)
	s := re.ReplaceAllString(strings.ToLower(strings.TrimSpace(v)), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "team"
	}
	return s
}

func sanitizeFile(v string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	return re.ReplaceAllString(v, "_")
}

func shortID() string { return randomHex(3) }
func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
func first(xs []string) string {
	if len(xs) == 0 {
		return ""
	}
	return xs[0]
}
func coalesceTime(p *time.Time, fallback time.Time) time.Time {
	if p != nil {
		return *p
	}
	return fallback
}
func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
func envInt(k string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil {
		return v
	}
	return fallback
}
func intQuery(r *http.Request, key string, fallback int) int {
	if v, err := strconv.Atoi(r.URL.Query().Get(key)); err == nil {
		return v
	}
	return fallback
}
func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
func isSafeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}
func originAllowedForMutation(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	return origin == "" || corsOrigins()[origin]
}
func isRole(value string) bool {
	switch value {
	case "admin", "editor", "viewer":
		return true
	default:
		return false
	}
}
func abs(p string) string {
	if p == "" {
		return ""
	}
	x, _ := filepath.Abs(p)
	return x
}
func realPath(p string) (string, error) {
	if p == "" {
		return "", errors.New("path vazio")
	}
	return filepath.EvalSymlinks(abs(p))
}
func isPathInside(parent, child string) bool {
	rel, err := filepath.Rel(abs(parent), abs(child))
	return err == nil && (rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)))
}
func contentTypeFor(p string) string {
	switch {
	case strings.HasSuffix(p, ".webm"):
		return "video/webm"
	case strings.HasSuffix(p, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(p, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(p, ".xml"):
		return "application/xml; charset=utf-8"
	case strings.HasSuffix(p, ".png"):
		return "image/png"
	case strings.HasSuffix(p, ".log"):
		return "text/plain; charset=utf-8"
	}
	return ""
}
func hostOf(raw string) string {
	u, _ := url.Parse(raw)
	return u.Hostname()
}
func retentionDays() int {
	v := envInt("TESTHUB_RETENTION_DAYS", 30)
	return int(math.Max(1, float64(v)))
}
func isDefaultSecretKey() bool {
	v := os.Getenv("TESTHUB_SECRET_KEY")
	return v == "" || v == "change-me"
}
func oidcIssuer() string {
	for _, k := range []string{"AUTH_OIDC_ISSUER", "AUTH_AUTH0_ISSUER", "AUTH_OKTA_ISSUER"} {
		if os.Getenv(k) != "" {
			return os.Getenv(k)
		}
	}
	return ""
}
func oidcConfigured() bool { return oidcIssuer() != "" && os.Getenv("AUTH_OIDC_CLIENT_ID") != "" }

type oidcJWTHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

type oidcMetadata struct {
	JWKSURI string `json:"jwks_uri"`
}

type oidcJWKS struct {
	Keys []oidcJWK `json:"keys"`
}

type oidcJWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type cachedJWKS struct {
	expiresAt time.Time
	jwks      oidcJWKS
}

func verifyOIDCJWT(token string) (map[string]any, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("OIDC token invalido")
	}
	var header oidcJWTHeader
	if err := decodeJWTPart(parts[0], &header); err != nil {
		return nil, err
	}
	if header.Alg != "RS256" {
		return nil, errors.New("OIDC alg nao suportado")
	}
	claims := map[string]any{}
	if err := decodeJWTPart(parts[1], &claims); err != nil {
		return nil, err
	}
	issuer, audience := oidcIssuer(), os.Getenv("AUTH_OIDC_CLIENT_ID")
	if issuer == "" || audience == "" {
		return nil, errors.New("OIDC nao configurado")
	}
	if firstClaimString(claims["iss"]) != issuer {
		return nil, errors.New("OIDC issuer invalido")
	}
	if !contains(claimStrings(claims["aud"]), audience) {
		return nil, errors.New("OIDC audience invalida")
	}
	if exp, ok := claims["exp"].(float64); ok && int64(exp) < time.Now().Unix() {
		return nil, errors.New("OIDC token expirado")
	}
	jwks, err := fetchOIDCJWKS(issuer)
	if err != nil {
		return nil, err
	}
	var key *oidcJWK
	for i := range jwks.Keys {
		if jwks.Keys[i].Kid == header.Kid && jwks.Keys[i].Kty == "RSA" {
			key = &jwks.Keys[i]
			break
		}
	}
	if key == nil {
		return nil, errors.New("OIDC key nao encontrada")
	}
	pub, err := rsaPublicKey(*key)
	if err != nil {
		return nil, err
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], signature); err != nil {
		return nil, errors.New("OIDC assinatura invalida")
	}
	return claims, nil
}

func fetchOIDCJWKS(issuer string) (oidcJWKS, error) {
	now := time.Now()
	oidcCache.Lock()
	if cached, ok := oidcCache.jwks[issuer]; ok && cached.expiresAt.After(now) {
		oidcCache.Unlock()
		return cached.jwks, nil
	}
	oidcCache.Unlock()

	client := http.Client{Timeout: 10 * time.Second}
	metadataURL := strings.TrimRight(issuer, "/") + "/.well-known/openid-configuration"
	resp, err := client.Get(metadataURL)
	if err != nil {
		return oidcJWKS{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return oidcJWKS{}, fmt.Errorf("OIDC metadata falhou: %d", resp.StatusCode)
	}
	var metadata oidcMetadata
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return oidcJWKS{}, err
	}
	if metadata.JWKSURI == "" {
		return oidcJWKS{}, errors.New("OIDC jwks_uri ausente")
	}
	resp, err = client.Get(metadata.JWKSURI)
	if err != nil {
		return oidcJWKS{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return oidcJWKS{}, fmt.Errorf("OIDC JWKS falhou: %d", resp.StatusCode)
	}
	var jwks oidcJWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return oidcJWKS{}, err
	}
	oidcCache.Lock()
	oidcCache.jwks[issuer] = cachedJWKS{expiresAt: now.Add(10 * time.Minute), jwks: jwks}
	oidcCache.Unlock()
	return jwks, nil
}

func rsaPublicKey(jwk oidcJWK) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, err
	}
	e := 0
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}
	if e == 0 {
		return nil, errors.New("OIDC exponent invalido")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: e}, nil
}

func decodeJWTPart(part string, out any) error {
	raw, err := base64.RawURLEncoding.DecodeString(part)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

func firstClaimString(values ...any) string {
	for _, value := range values {
		if s, ok := value.(string); ok && strings.TrimSpace(s) != "" {
			return s
		}
		if list, ok := value.([]any); ok {
			for _, item := range list {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					return s
				}
			}
		}
	}
	return ""
}

func claimStrings(value any) []string {
	if s, ok := value.(string); ok && s != "" {
		return []string{s}
	}
	list, ok := value.([]any)
	if !ok {
		return nil
	}
	out := []string{}
	for _, item := range list {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func envList(key string) []string {
	out := []string{}
	for _, value := range strings.Split(os.Getenv(key), ",") {
		if value = strings.TrimSpace(value); value != "" {
			out = append(out, value)
		}
	}
	return out
}

func envPtr(p *string, fallback string) string {
	if p != nil && *p != "" {
		return *p
	}
	return fallback
}
func actorLabel(a *Actor) string {
	if a == nil {
		return "anonymous"
	}
	if a.Email != "" {
		return a.Email
	}
	if a.Name != "" {
		return a.Name
	}
	return a.ID
}

type actorCtxKey struct{}

func withActor(ctx context.Context, actor *Actor) context.Context {
	return context.WithValue(ctx, actorCtxKey{}, actor)
}

func actorFromCtx(r *http.Request) *Actor {
	actor, _ := r.Context().Value(actorCtxKey{}).(*Actor)
	return actor
}
