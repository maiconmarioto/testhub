package app

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPermissionMatrix(t *testing.T) {
	if !hasPermission("admin", "settings:write") {
		t.Fatal("admin must write settings")
	}
	if hasPermission("editor", "settings:write") {
		t.Fatal("editor must not write settings")
	}
	if hasPermission("editor", "audit:read") {
		t.Fatal("editor must not read audit")
	}
	if !hasPermission("editor", "project:write") {
		t.Fatal("editor must write projects")
	}
	if hasPermission("viewer", "project:write") {
		t.Fatal("viewer must not write projects")
	}
}

func TestRoleFromClaims(t *testing.T) {
	if got := roleFromClaims(map[string]any{"role": "viewer"}); got != "viewer" {
		t.Fatalf("explicit role = %q", got)
	}
	t.Setenv("TESTHUB_EDITOR_GROUPS", "qa,dev")
	if got := roleFromClaims(map[string]any{"groups": []any{"dev"}}); got != "editor" {
		t.Fatalf("group role = %q", got)
	}
	t.Setenv("TESTHUB_ROLE", "viewer")
	if got := roleFromClaims(map[string]any{}); got != "viewer" {
		t.Fatalf("fallback role = %q", got)
	}
}

func TestVerifyOIDCJWTWithJWKS(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			writeJSON(w, 200, map[string]any{"jwks_uri": "http://" + r.Host + "/jwks"})
		case "/jwks":
			writeJSON(w, 200, map[string]any{"keys": []map[string]string{{
				"kty": "RSA",
				"kid": "test-key",
				"alg": "RS256",
				"n":   base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes()),
			}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	oidcCache.Lock()
	oidcCache.jwks = map[string]cachedJWKS{}
	oidcCache.Unlock()
	t.Setenv("AUTH_OIDC_ISSUER", server.URL)
	t.Setenv("AUTH_OIDC_CLIENT_ID", "test-client")
	t.Setenv("TESTHUB_EDITOR_GROUPS", "qa")
	token := signedOIDCTestToken(t, key, map[string]any{
		"iss":    server.URL,
		"aud":    []string{"test-client"},
		"exp":    time.Now().Add(time.Hour).Unix(),
		"sub":    "user-1",
		"email":  "user@example.com",
		"groups": []string{"qa"},
	})
	claims, err := verifyOIDCJWT(token)
	if err != nil {
		t.Fatal(err)
	}
	if got := roleFromClaims(claims); got != "editor" {
		t.Fatalf("role = %q", got)
	}
}

func TestTokenHashShape(t *testing.T) {
	got := hashToken("secret")
	if len(got) != 64 {
		t.Fatalf("hash length = %d", len(got))
	}
}

func TestPasswordHashCompatibility(t *testing.T) {
	hash, err := hashPassword("correct-horse")
	if err != nil {
		t.Fatal(err)
	}
	ok, err := verifyPassword("correct-horse", hash)
	if err != nil || !ok {
		t.Fatalf("expected password to verify, ok=%v err=%v", ok, err)
	}
	ok, err = verifyPassword("wrong", hash)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("wrong password verified")
	}
}

func TestSecretEncryptionCompatibilityShape(t *testing.T) {
	t.Setenv("TESTHUB_SECRET_KEY", "test-secret")
	encrypted, err := encryptSecret("plain")
	if err != nil {
		t.Fatal(err)
	}
	if encrypted == "plain" || len(encrypted) <= len(encPrefix) || encrypted[:len(encPrefix)] != encPrefix {
		t.Fatalf("bad encrypted value: %q", encrypted)
	}
	decrypted, err := decryptSecret(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	if decrypted != "plain" {
		t.Fatalf("decrypted = %q", decrypted)
	}
}

func TestMalformedEncryptedSecretDoesNotPanic(t *testing.T) {
	t.Setenv("TESTHUB_SECRET_KEY", "test-secret")
	if _, err := decryptSecret(encPrefix + base64.StdEncoding.EncodeToString([]byte("short"))); err == nil {
		t.Fatal("expected malformed encrypted secret to fail")
	}
}

func TestHostAllowlistFailsClosedInProduction(t *testing.T) {
	t.Setenv("NODE_ENV", "production")
	t.Setenv("TESTHUB_ALLOWED_HOSTS", "")
	if isHostAllowed("http://example.com") {
		t.Fatal("production without allowlist must deny outbound environment host")
	}
	t.Setenv("TESTHUB_ALLOWED_HOSTS", "example.com")
	if !isHostAllowed("https://api.example.com") {
		t.Fatal("configured host suffix should be allowed")
	}
	if isHostAllowed("file:///etc/passwd") {
		t.Fatal("non-http scheme must be denied")
	}
}

func TestAIBaseURLAllowlist(t *testing.T) {
	if !isAIBaseURLAllowed("https://api.openai.com/v1/chat/completions", "openai") {
		t.Fatal("default OpenAI host should be allowed")
	}
	if isAIBaseURLAllowed("http://api.openai.com/v1/chat/completions", "openai") {
		t.Fatal("AI base URL must be https")
	}
	if isAIBaseURLAllowed("https://169.254.169.254/latest", "openai") {
		t.Fatal("unexpected AI host should be denied")
	}
}

func signedOIDCTestToken(t *testing.T, key *rsa.PrivateKey, claims map[string]any) string {
	t.Helper()
	header := map[string]string{"alg": "RS256", "kid": "test-key", "typ": "JWT"}
	headerJSON, err := json.Marshal(header)
	if err != nil {
		t.Fatal(err)
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	signingInput := strings.Join([]string{
		base64.RawURLEncoding.EncodeToString(headerJSON),
		base64.RawURLEncoding.EncodeToString(claimsJSON),
	}, ".")
	digest := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)
}
