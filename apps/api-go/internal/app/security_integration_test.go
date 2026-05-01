package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestTenantIsolationForUsersAndPATs(t *testing.T) {
	dsn := isolatedTestDatabaseURL(t)
	t.Setenv("TESTHUB_AUTH_MODE", "local")
	t.Setenv("TESTHUB_SECRET_KEY", "test-secret")

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	a := &App{db: db, rootDir: t.TempDir()}
	if err := a.migrate(); err != nil {
		t.Fatal(err)
	}
	truncateSecurityTables(t, db)
	orgA, orgB, adminA, userB := seedTwoOrgs(t, db)
	tokenA := "session-a"
	now := time.Now().UTC()
	if err := db.Create(&AuthSession{ID: uuid.NewString(), UserID: adminA.ID, OrganizationID: orgA.ID, TokenHash: hashToken(tokenA), ExpiresAt: now.Add(time.Hour), CreatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.routes())
	defer server.Close()

	body, status := apiRequest(t, server.URL, http.MethodGet, "/api/users", tokenA, nil)
	if status != 200 {
		t.Fatalf("list users status=%d body=%s", status, body)
	}
	if strings.Contains(body, "b@example.com") || strings.Contains(body, orgB.ID) {
		t.Fatalf("cross-org user data leaked: %s", body)
	}

	payload := map[string]any{"memberships": []map[string]string{{"organizationId": orgB.ID, "role": "admin"}}}
	body, status = apiRequest(t, server.URL, http.MethodPatch, "/api/users/"+userB.ID+"/memberships", tokenA, payload)
	if status != 404 && status != 403 {
		t.Fatalf("cross-org membership update status=%d body=%s", status, body)
	}

	payload = map[string]any{"name": "bad", "organizationIds": []string{orgB.ID}, "defaultOrganizationId": orgB.ID}
	body, status = apiRequest(t, server.URL, http.MethodPost, "/api/users/me/tokens", tokenA, payload)
	if status != 403 {
		t.Fatalf("cross-org PAT status=%d body=%s", status, body)
	}

	payload = map[string]any{"name": "ok", "organizationIds": []string{orgA.ID}, "defaultOrganizationId": orgA.ID}
	body, status = apiRequest(t, server.URL, http.MethodPost, "/api/users/me/tokens", tokenA, payload)
	if status != 201 || !strings.Contains(body, `"token"`) {
		t.Fatalf("PAT create status=%d body=%s", status, body)
	}
	var created map[string]any
	if err := json.Unmarshal([]byte(body), &created); err != nil {
		t.Fatal(err)
	}
	createdSecret, _ := created["token"].(string)
	body, status = apiRequest(t, server.URL, http.MethodGet, "/api/users/me/tokens", tokenA, nil)
	if status != 200 {
		t.Fatalf("PAT list status=%d body=%s", status, body)
	}
	if strings.Contains(body, `"token":`) || (createdSecret != "" && strings.Contains(body, createdSecret)) {
		t.Fatalf("PAT secret leaked on list: %s", body)
	}
}

func TestPublicRegisterCannotJoinExistingOrgByID(t *testing.T) {
	dsn := isolatedTestDatabaseURL(t)
	t.Setenv("TESTHUB_AUTH_MODE", "local")
	t.Setenv("TESTHUB_ALLOW_PUBLIC_SIGNUP", "true")

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	a := &App{db: db, rootDir: t.TempDir()}
	if err := a.migrate(); err != nil {
		t.Fatal(err)
	}
	truncateSecurityTables(t, db)
	orgA, _, _, _ := seedTwoOrgs(t, db)
	server := httptest.NewServer(a.routes())
	defer server.Close()

	payload := map[string]any{"email": "join@example.com", "password": "correct-horse", "organizationIds": []string{orgA.ID}}
	body, status := apiRequest(t, server.URL, http.MethodPost, "/api/auth/register", "", payload)
	if status != 403 {
		t.Fatalf("register org injection status=%d body=%s", status, body)
	}
}

func TestHTTPGuardsAndSensitiveDomainEdges(t *testing.T) {
	dsn := isolatedTestDatabaseURL(t)
	t.Setenv("TESTHUB_AUTH_MODE", "local")
	t.Setenv("TESTHUB_SECRET_KEY", "test-secret")

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	rootDir := t.TempDir()
	a := &App{db: db, rootDir: rootDir}
	if err := a.migrate(); err != nil {
		t.Fatal(err)
	}
	truncateSecurityTables(t, db)
	orgA, _, adminA, _ := seedTwoOrgs(t, db)
	tokenA := "session-a"
	now := time.Now().UTC()
	if err := db.Create(&AuthSession{ID: uuid.NewString(), UserID: adminA.ID, OrganizationID: orgA.ID, TokenHash: hashToken(tokenA), ExpiresAt: now.Add(time.Hour), CreatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	project := Project{ID: uuid.NewString(), OrganizationID: orgA.ID, Name: "Project", Status: "active", CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	ai := AIConnection{ID: uuid.NewString(), OrganizationID: orgA.ID, Name: "Disabled", Provider: "openai", Model: "gpt-test", Enabled: "false", CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&ai).Error; err != nil {
		t.Fatal(err)
	}
	reportDir := filepath.Join(rootDir, "runs", "safe")
	if err := os.MkdirAll(reportDir, 0o755); err != nil {
		t.Fatal(err)
	}
	reportPath := filepath.Join(reportDir, "report.json")
	if err := os.WriteFile(reportPath, []byte(`{"ok":true}`), 0o600); err != nil {
		t.Fatal(err)
	}
	secretPath := filepath.Join(rootDir, "secret.txt")
	if err := os.WriteFile(secretPath, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	linkPath := filepath.Join(reportDir, "escape.txt")
	if err := os.Symlink(secretPath, linkPath); err != nil {
		t.Fatal(err)
	}
	run := RunRecord{ID: uuid.NewString(), ProjectID: project.ID, Status: "passed", ReportPath: &reportPath, CreatedAt: now}
	if err := db.Create(&run).Error; err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.routes())
	defer server.Close()

	body, status := apiRequestWithHeaders(t, server.URL, http.MethodPost, "/api/users/me/tokens", tokenA, map[string]any{"name": "bad"}, map[string]string{"Origin": "https://evil.example"})
	if status != 403 {
		t.Fatalf("origin guard status=%d body=%s", status, body)
	}

	t.Setenv("TESTHUB_MAX_BODY_BYTES", "16")
	body, status = apiRequest(t, server.URL, http.MethodPost, "/api/users/me/tokens", tokenA, map[string]any{"name": strings.Repeat("x", 64)})
	if status != 400 {
		t.Fatalf("body limit status=%d body=%s", status, body)
	}
	t.Setenv("TESTHUB_MAX_BODY_BYTES", "")

	body, status = apiRequest(t, server.URL, http.MethodGet, "/api/auth/organizations", "", nil)
	if status != 200 || strings.Contains(body, orgA.ID) {
		t.Fatalf("org discovery should be hidden status=%d body=%s", status, body)
	}

	body, status = apiRequest(t, server.URL, http.MethodPost, "/api/cleanup", tokenA, map[string]any{"projectId": project.ID, "days": 0})
	if status != 400 {
		t.Fatalf("cleanup invalid days status=%d body=%s", status, body)
	}

	spec := "version: 1\ntype: api\nname: DB Suite\ntests:\n  - name: health\n    request:\n      method: GET\n      path: /health\n    expect:\n      status: 200\n"
	body, status = apiRequest(t, server.URL, http.MethodPost, "/api/suites", tokenA, map[string]any{"projectId": project.ID, "name": "DB Suite", "type": "api", "specContent": spec})
	if status != 201 {
		t.Fatalf("create suite status=%d body=%s", status, body)
	}
	matches, err := filepath.Glob(filepath.Join(rootDir, "suites", "*.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) > 0 {
		t.Fatalf("suite creation wrote persistent yaml files: %v", matches)
	}

	body, status = apiRequest(t, server.URL, http.MethodPost, "/api/ai/explain-failure", tokenA, map[string]any{"connectionId": ai.ID, "context": map[string]any{"runId": "r1"}})
	if status != 400 {
		t.Fatalf("disabled AI by id status=%d body=%s", status, body)
	}

	req, err := http.NewRequest(http.MethodGet, server.URL+"/artifacts?path="+linkPath, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("authorization", "Bearer "+tokenA)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Fatalf("artifact symlink escape status=%d", resp.StatusCode)
	}
}

func TestRunCreationCreatesJobAndCancelUpdatesJob(t *testing.T) {
	dsn := isolatedTestDatabaseURL(t)
	t.Setenv("TESTHUB_AUTH_MODE", "local")
	t.Setenv("TESTHUB_SECRET_KEY", "test-secret")

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(204)
	}))
	defer target.Close()
	targetURL, err := url.Parse(target.URL)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("TESTHUB_ALLOWED_HOSTS", targetURL.Hostname())

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	a := &App{db: db, rootDir: t.TempDir()}
	if err := a.migrate(); err != nil {
		t.Fatal(err)
	}
	truncateSecurityTables(t, db)
	orgA, _, adminA, _ := seedTwoOrgs(t, db)
	tokenA := "session-a"
	now := time.Now().UTC()
	if err := db.Create(&AuthSession{ID: uuid.NewString(), UserID: adminA.ID, OrganizationID: orgA.ID, TokenHash: hashToken(tokenA), ExpiresAt: now.Add(time.Hour), CreatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	project := Project{ID: uuid.NewString(), OrganizationID: orgA.ID, Name: "Project", Status: "active", CreatedAt: now, UpdatedAt: now}
	envr := Environment{ID: uuid.NewString(), ProjectID: project.ID, Name: "Local", BaseURL: target.URL, Status: "active", CreatedAt: now, UpdatedAt: now}
	suite := Suite{ID: uuid.NewString(), ProjectID: project.ID, Name: "Suite", Type: "api", SpecPath: "postgres:test", SpecContent: "version: 1\ntype: api\nname: Suite\ntests:\n  - name: health\n    request:\n      method: GET\n      path: /\n    expect:\n      status: 204\n", Status: "active", CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&envr).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&suite).Error; err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.routes())
	defer server.Close()

	body, status := apiRequest(t, server.URL, http.MethodPost, "/api/runs", tokenA, map[string]any{"projectId": project.ID, "environmentId": envr.ID, "suiteId": suite.ID})
	if status != 202 {
		t.Fatalf("create run status=%d body=%s", status, body)
	}
	var run RunRecord
	if err := json.Unmarshal([]byte(body), &run); err != nil {
		t.Fatal(err)
	}
	var job RunJob
	if err := db.Where("run_id = ? AND status = ?", run.ID, "queued").First(&job).Error; err != nil {
		t.Fatalf("queued job not created with run: %v", err)
	}

	body, status = apiRequest(t, server.URL, http.MethodPost, "/api/runs/"+run.ID+"/cancel", tokenA, nil)
	if status != 200 {
		t.Fatalf("cancel run status=%d body=%s", status, body)
	}
	if err := db.First(&job, "id = ?", job.ID).Error; err != nil {
		t.Fatal(err)
	}
	if job.Status != "canceled" {
		t.Fatalf("job status after cancel = %q", job.Status)
	}
}

func isolatedTestDatabaseURL(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("TESTHUB_GO_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TESTHUB_GO_TEST_DATABASE_URL not set")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("invalid TESTHUB_GO_TEST_DATABASE_URL: %v", err)
	}
	dbName := strings.TrimPrefix(u.Path, "/")
	if !strings.HasSuffix(dbName, "_test") && os.Getenv("TESTHUB_ALLOW_DESTRUCTIVE_GO_TESTS") != "true" {
		t.Skip("integration tests truncate tables; use a database ending in _test or set TESTHUB_ALLOW_DESTRUCTIVE_GO_TESTS=true")
	}
	return dsn
}

func truncateSecurityTables(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Exec("TRUNCATE audit_entries, ai_connections, run_jobs, runs, suites, environments, projects, personal_access_tokens, auth_sessions, password_reset_tokens, organization_memberships, users, organizations RESTART IDENTITY CASCADE").Error; err != nil {
		t.Fatal(err)
	}
}

func seedTwoOrgs(t *testing.T, db *gorm.DB) (Organization, Organization, User, User) {
	t.Helper()
	now := time.Now().UTC()
	orgA := Organization{ID: uuid.NewString(), Name: "Org A", Slug: "org-a-" + shortID(), Status: "active", CreatedAt: now, UpdatedAt: now}
	orgB := Organization{ID: uuid.NewString(), Name: "Org B", Slug: "org-b-" + shortID(), Status: "active", CreatedAt: now, UpdatedAt: now}
	adminA := User{ID: uuid.NewString(), Email: "a@example.com", PasswordHash: "x", Status: "active", CreatedAt: now, UpdatedAt: now}
	userB := User{ID: uuid.NewString(), Email: "b@example.com", PasswordHash: "x", Status: "active", CreatedAt: now, UpdatedAt: now}
	rows := []any{&orgA, &orgB, &adminA, &userB}
	for _, row := range rows {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	memberships := []OrganizationMembership{
		{ID: uuid.NewString(), UserID: adminA.ID, OrganizationID: orgA.ID, Role: "admin", CreatedAt: now, UpdatedAt: now},
		{ID: uuid.NewString(), UserID: userB.ID, OrganizationID: orgB.ID, Role: "admin", CreatedAt: now, UpdatedAt: now},
	}
	if err := db.Create(&memberships).Error; err != nil {
		t.Fatal(err)
	}
	return orgA, orgB, adminA, userB
}

func apiRequest(t *testing.T, baseURL, method, path, token string, payload any) (string, int) {
	return apiRequestWithHeaders(t, baseURL, method, path, token, payload, nil)
}

func apiRequestWithHeaders(t *testing.T, baseURL, method, path, token string, payload any, headers map[string]string) (string, int) {
	t.Helper()
	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, baseURL+path, &body)
	if err != nil {
		t.Fatal(err)
	}
	if payload != nil {
		req.Header.Set("content-type", "application/json")
	}
	if token != "" {
		req.Header.Set("authorization", "Bearer "+token)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out bytes.Buffer
	_, _ = out.ReadFrom(resp.Body)
	return out.String(), resp.StatusCode
}
