package app

import (
	"net/http"
	"os"
)

func (a *App) root(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"service":   "testhub-api",
		"status":    "ok",
		"docs":      "/docs",
		"openapi":   "/openapi.json",
		"health":    "/api/health",
		"dashboard": env("TESTHUB_WEB_URL", "http://localhost:3333"),
	})
}

func (a *App) health(w http.ResponseWriter, r *http.Request) {
	sqlDB, _ := a.db.DB()
	err := sqlDB.Ping()
	writeJSON(w, 200, map[string]any{"status": "ok", "database": err == nil})
}

func (a *App) openapi(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"openapi": "3.0.3", "info": map[string]any{"title": "TestHub API", "version": "0.1.0"}})
}

func (a *App) securityStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"oidc":      map[string]any{"configured": oidcConfigured(), "issuer": oidcIssuer()},
		"auth":      map[string]any{"apiTokenEnabled": os.Getenv("TESTHUB_TOKEN") != "", "rbacRole": fallbackRole(), "mode": authMode()},
		"secrets":   map[string]any{"defaultKey": isDefaultSecretKey(), "blockedInProduction": os.Getenv("NODE_ENV") == "production" && isDefaultSecretKey()},
		"network":   map[string]any{"allowedHosts": allowedHosts(), "allowAllWhenEmpty": len(allowedHosts()) == 0},
		"retention": map[string]any{"days": retentionDays()},
	})
}
