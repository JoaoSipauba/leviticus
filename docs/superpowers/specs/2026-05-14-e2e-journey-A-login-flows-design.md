# E2E Journey A — Login Flows Design

## Goal

Cover the login pathway and its key validation/error states. The harness currently only exercises signup — the LOGIN flow (returning user, wrong password, etc.) has zero E2E coverage despite being the most-used auth path in production.

Maps to gap items 1-6 in the post-journey audit.

---

## Scope

**In:** 4 tests in `09-login-flows.spec.ts`.

| # | Test | Path | Expected |
|---|---|---|---|
| T1 | Login with correct credentials | Seed user via admin → app at `/login` → fill email+password → submit | Redirect to `/org` (no org assigned yet) |
| T2 | Login with wrong password | Seed user → fill email+wrong password → submit | Error message via `friendlySignInError` |
| T3 | Signup with existing email | Seed user → app at `/login` → switch to signup → fill same email → submit | Error `"Este e-mail já está cadastrado. Faça login."` |
| T4 | Signup with name vazio | App at `/login` → switch to signup → leave name empty → submit | Error `"Informe seu nome."` |

**Out:** session expiry mid-app (token refresh), forgot-password flow (no UI), magic-link (not implemented), social auth (not implemented).

---

## Setup pattern

T1-T3 share a pre-seeded user. T4 doesn't need one. Use `createTestUser(admin, opts)` (already exists) in `before()` to seed; reset WebKit via `cleanLocalSqlite` so app boots at `/login`.

For T1-T3, login via UI (the existing Login.tsx form has "Entrar" tab as default, "Criar conta" link to toggle).

---

## Test details

### T1 — Login with correct credentials
```
before: createTestUser via admin → returns { email, password='senha-do-teste-e2e' }
it:
  - Wait for /login
  - Fill input#email with seeded email
  - Fill input#password with seeded password
  - Click submit (text "Entrar" in login mode)
  - Wait for /org redirect (no org assigned yet)
```

### T2 — Wrong password
```
before: createTestUser
it:
  - Wait for /login
  - Fill email + a clearly wrong password ('senha-errada-999')
  - Click submit
  - Wait for <p role="alert"> to contain expected substring (friendlySignInError handles raw Supabase error)
  - Verify URL still at /login
```

The `friendlySignInError` function in Login.tsx maps Supabase auth errors to friendly Portuguese strings. The test asserts the alert exists and the URL doesn't change — exact wording is wrapper logic (e.g. "Credenciais inválidas") that we don't pin too tightly.

### T3 — Signup with existing email
```
before: createTestUser (so email exists)
it:
  - Wait for /login
  - Click "Criar conta" (toggle to signup mode)
  - Fill name + the existing email + a valid password
  - Click submit (text "Criar conta" in signup mode)
  - Wait for <p role="alert"> containing "Este e-mail já está cadastrado"
```

### T4 — Signup with empty name
```
before: (none — fresh state)
it:
  - Wait for /login
  - Click "Criar conta" toggle
  - Fill email + password but leave name empty
  - Click submit
  - Wait for <p role="alert"> containing "Informe seu nome"
```

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/09-login-flows.spec.ts` | CREATE |

No new helpers needed. Reuses `cleanLocalSqlite`, `setReactInputValue`, `createTestUser`, `makeAdminClient`.

---

## Risks

- **Test 2 timing**: Supabase auth error response can take 1-2s. The alert `waitForExist` should have a 10s timeout.
- **Empty name button state**: the Login form might disable submit when name is empty (validation client-side). If so, T4 needs `waitForEnabled` to be lenient or assert state differently. Verify and adapt.

---

## Out of scope
- Session persistence after restart (separate journey).
- Magic-link, OAuth, password reset — not in app.
- Logout flow (covered in Journey D's role tests indirectly via the danger zone).
