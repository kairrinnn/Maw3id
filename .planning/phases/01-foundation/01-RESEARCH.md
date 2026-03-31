# Phase 1: Foundation - Research

**Researched:** 2026-03-31
**Domain:** Supabase multi-tenant RLS, Next.js 15 SSR auth, Postgres schema design
**Confidence:** HIGH (core patterns verified against official docs and npm registry)

---

## Summary

Phase 1 establishes the data layer, authentication, and tenant isolation that every subsequent phase depends on. The existing `botmaroc` directory contains a scaffolded Next.js 16 app with Supabase already in dependencies, but it uses the deprecated `@supabase/auth-helpers-nextjs` package alongside a single non-SSR Supabase client with no RLS. Phase 1 must replace this with the correct `@supabase/ssr` pattern and install the full schema with RLS from day one.

Multi-tenant isolation in Supabase is achieved through Row Level Security on every tenant-owned table, with tenant context delivered via custom JWT claims injected by a Supabase Auth Hook. Dashboard routes use a cookie-based server client (`createServerClient` from `@supabase/ssr`) where RLS is enforced automatically via `auth.uid()`. The webhook pipeline (Phase 2+) uses the service role key, which bypasses RLS, and must add explicit `.eq('tenant_id', ...)` filters to every query.

The key architectural decision already locked in STATE.md is FSM with structured state — this influences schema design for Phase 1 because the `conversations` table must store a `state JSONB` column (not raw message history) from the start. Bot configs per tenant are stored as columns on the `tenants` table plus a separate `bot_configs` table for the prompt and settings.

**Primary recommendation:** Bootstrap the schema in `botmaroc/supabase/migrations/` using the Supabase CLI, apply RLS on all tenant tables immediately, use the custom access token hook to inject `tenant_id` into JWTs, and verify cross-tenant isolation with integration tests before proceeding to Phase 2.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Postgres multi-tenant schema with `tenant_id` indexed on all tables (tenants, bookings, services, conversations, templates) | Full schema SQL documented in Architecture section; index strategy verified against Supabase RLS performance docs |
| INFRA-02 | RLS enabled by default DENY — each salon reads/writes only its own data | RLS policy patterns verified against official Supabase RLS docs; helper function + SELECT wrap pattern documented |
| INFRA-03 | Salon owner can create account and log in to dashboard (Supabase Auth email/password) | `@supabase/ssr` createServerClient + middleware pattern verified; getClaims() vs getSession() distinction documented |
| INFRA-04 | Each salon has its own bot configuration (system prompt, services, hours, active status) | `bot_configs` table design documented; covered by tenant_id-scoped schema |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.1 | App Router, API Routes, SSR | Already in project; Next.js docs state `--yes` defaults include TypeScript + Tailwind + App Router |
| @supabase/supabase-js | 2.101.0 | Supabase JS client | Latest; service role client for webhook pipeline |
| @supabase/ssr | 0.10.0 | Cookie-based SSR auth for Next.js | Replaces deprecated auth-helpers; only package for App Router server component auth |
| typescript | 5.x (6.0.2 latest) | Type safety | Already in project devDependencies |
| supabase (CLI) | 2.84.5 | Local dev, migrations, linking to remote | Required for migration workflow |

> Version note: `@supabase/supabase-js` 2.101.0 and `@supabase/ssr` 0.10.0 verified via `npm view` on 2026-03-31.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 | Runtime validation of API inputs and env vars | Used in all API routes and form submissions |
| shadcn/ui | 4.1.1 | Dashboard UI components | Login form, settings pages |
| tailwindcss | 4.x | Utility CSS | Already in project, keep |

### Deprecated — Remove

| Package | Status | Replace With |
|---------|--------|--------------|
| `@supabase/auth-helpers-nextjs` | Deprecated (final version 0.15.0, no further updates) | `@supabase/ssr` |

The existing `botmaroc/package.json` includes both `@supabase/auth-helpers-nextjs` and `@supabase/ssr`. Supabase docs explicitly warn: "do not use both packages in the same application." Remove auth-helpers in Phase 1.

**Installation:**
```bash
# In botmaroc/
npm install @supabase/supabase-js@latest @supabase/ssr@latest zod
npm uninstall @supabase/auth-helpers-nextjs

# Supabase CLI (global, not project-scoped)
npm install -g supabase
```

**Version verification (run before writing code):**
```bash
npm view @supabase/supabase-js version
npm view @supabase/ssr version
npm view next version
```

---

## Architecture Patterns

### Recommended Project Structure

The `botmaroc` directory is the canonical project. Phase 1 adds:

```
botmaroc/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx         # Email/password login form
│   │   └── (dashboard)/             # Auth-protected tenant dashboard
│   │       └── [tenantSlug]/
│   │           └── settings/        # Bot config page (Phase 1 foundation only)
│   ├── lib/
│   │   └── supabase/
│   │       ├── server.ts            # createServerClient with cookies (dashboard routes)
│   │       ├── client.ts            # createBrowserClient (client components)
│   │       ├── service.ts           # Service role client (webhook pipeline, no session)
│   │       └── middleware.ts        # updateSession() for token refresh
│   └── middleware.ts                # Route protection + session refresh
├── supabase/
│   ├── migrations/
│   │   ├── 20260331000001_create_tenants.sql
│   │   ├── 20260331000002_create_tenant_users.sql
│   │   ├── 20260331000003_create_services.sql
│   │   ├── 20260331000004_create_schedules.sql
│   │   ├── 20260331000005_create_conversations.sql
│   │   ├── 20260331000006_create_bookings.sql
│   │   ├── 20260331000007_create_bot_configs.sql
│   │   ├── 20260331000008_enable_rls.sql
│   │   └── 20260331000009_custom_access_token_hook.sql
│   └── seed.sql                     # Dev tenant + owner for local testing
└── .env.local                       # Supabase URL + keys (never committed)
```

### Pattern 1: Supabase Server Client (Dashboard Routes)

**What:** Cookie-based Supabase client for Next.js App Router server components and API routes. Uses `createServerClient` from `@supabase/ssr`. In Next.js 15+, `cookies()` must be awaited.

**When to use:** All dashboard API routes (`app/api/dashboard/**`) and server components that need user identity.

```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/creating-a-client
// botmaroc/src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()  // await required in Next.js 15+

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — middleware handles token refresh
          }
        },
      },
    }
  )
}
```

### Pattern 2: Supabase Service Role Client (Webhook Pipeline)

**What:** Service role client bypasses all RLS. No cookie/session needed. Used exclusively in the webhook pipeline (Phase 2+) and any server-side jobs that process data without a user session.

**When to use:** `app/api/webhook/route.ts`, cron jobs, background tasks. NEVER in client-facing code.

```typescript
// botmaroc/src/lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // Server-only, never NEXT_PUBLIC_
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      }
    }
  )
}
```

### Pattern 3: Middleware for Session Refresh and Route Protection

**What:** Next.js middleware that refreshes Supabase auth tokens on every request and redirects unauthenticated users away from protected routes.

**When to use:** Always — required because Next.js Server Components cannot write cookies directly.

```typescript
// Source: https://the-shubham.medium.com/next-js-supabase-cookie-based-auth-workflow
// (verified pattern matches official Supabase @supabase/ssr docs behavior)

// botmaroc/src/lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Use getClaims(), NOT getSession() — getClaims validates JWT signature
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const PROTECTED_ROUTES = ['/dashboard']
  const isProtected = PROTECTED_ROUTES.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

// botmaroc/src/middleware.ts
import { updateSession } from './lib/supabase/middleware'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|public|api/webhook).*)'],
  // Note: exclude /api/webhook — it uses service role key, not session
}
```

**Critical:** Use `supabase.auth.getClaims()` to protect pages, NOT `supabase.auth.getSession()`. The `getSession()` method does not validate the JWT signature inside server code. `getClaims()` validates against the project's published public keys on every call.

### Pattern 4: RLS Multi-Tenant Isolation via Custom JWT Claims

**What:** Inject `tenant_id` into the JWT via a Supabase Auth Hook so that RLS policies can reference it directly without an extra DB join on every row evaluation.

**When to use:** All multi-tenant RLS policies. More performant than `SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()` inside the policy (that pattern hits the DB per row, per query).

```sql
-- Source: https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
-- Migration: 20260331000009_custom_access_token_hook.sql

-- Step 1: Create the hook function
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims JSONB;
  v_tenant_id UUID;
BEGIN
  -- Look up tenant from the tenant_users table
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_users
  WHERE user_id = (event->>'user_id')::UUID
  LIMIT 1;

  claims := event->'claims';

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id));
  ELSE
    claims := jsonb_set(claims, '{tenant_id}', 'null'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Step 2: Grant correct permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT ALL ON TABLE public.tenant_users TO supabase_auth_admin;
REVOKE ALL ON TABLE public.tenant_users FROM authenticated, anon, public;

-- Step 3: Register hook in Supabase Dashboard
-- Navigate to: Authentication > Hooks (Beta)
-- Select: Custom Access Token Hook → public.custom_access_token_hook
```

**RLS policy using the custom claim:**
```sql
-- Fast: reads from JWT, not from DB per row
CREATE POLICY "tenant_isolation_select"
ON services
FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID)
);
```

**Fallback pattern** (if hook not yet configured in dashboard — use as interim only):
```sql
-- Slower: hits tenant_users per row evaluation — use only during dev
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id FROM public.tenant_users
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE POLICY "tenant_isolation_select"
ON services
FOR SELECT
TO authenticated
USING ( tenant_id = (SELECT public.get_user_tenant_id()) );
```

### Pattern 5: RLS Default DENY Verification

**What:** When `ALTER TABLE x ENABLE ROW LEVEL SECURITY` is run, Supabase immediately blocks ALL access to that table via the anon/authenticated roles until explicit policies are added. This is the default DENY.

**Verification query to run in psql or Supabase SQL editor:**
```sql
-- Verify RLS is enabled on all tenant tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- rowsecurity = true for every tenant-owned table = INFRA-02 satisfied
```

### Pattern 6: Supabase Migration Workflow

**Commands:**
```bash
# Initialize Supabase in the project (creates supabase/ directory)
cd botmaroc
supabase init

# Link to remote project
supabase login
supabase link --project-ref <project-id>   # project-id from dashboard URL

# Create a new migration file (timestamped automatically)
supabase migration new create_tenants

# Run migrations locally (requires Docker)
supabase start
supabase db reset    # applies all migrations + seed.sql

# Push migrations to remote Supabase project
supabase db push

# Pull remote schema to local (for initial sync)
supabase db pull
```

### Anti-Patterns to Avoid

- **Single shared Supabase client (`src/lib/supabase.ts` in botmaroc):** The existing file exports a single `createClient()` with the anon key. This has no cookie session support and cannot enforce RLS per user. Replace completely in Phase 1.
- **Using `getSession()` in middleware:** Supabase docs explicitly say never trust `getSession()` in server code. Use `getClaims()`.
- **JWT custom claims in `user_metadata`:** User-editable — a malicious user could set their own `tenant_id`. Always use `app_metadata` or a custom hook reading from a controlled table.
- **Mixing auth-helpers and @supabase/ssr:** Package conflict causes session bugs. Remove `@supabase/auth-helpers-nextjs` entirely in Phase 1.
- **Service role key in NEXT_PUBLIC_ env var:** Must never be exposed to the browser. Only prefix with `NEXT_PUBLIC_` for URL and anon key.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email/password auth with session management | Custom JWT handling, cookie logic | Supabase Auth + `@supabase/ssr` | Handles token refresh, expiry, rotation, PKCE, and cookie signing |
| Cross-tenant data isolation | Application-layer tenant filtering | Supabase RLS | DB-layer enforcement — survives developer mistakes, cannot be bypassed from app code |
| Password hashing and storage | bcrypt wrappers | Supabase Auth (built-in) | Uses industry-standard Argon2, not your implementation |
| Session persistence across requests | Manual cookie reads | `@supabase/ssr` `createServerClient` | Handles `getAll`/`setAll` cookie protocol correctly |
| RLS policy testing | Custom test framework | pgTAP (or SQL queries with `SET LOCAL ROLE`) | Built for Postgres RLS verification; community-validated |

**Key insight:** RLS policies live entirely in the database — any application bug that accidentally skips a filter is still caught at the DB layer. This is why hand-rolled application-level filtering is insufficient for multi-tenant security.

---

## Common Pitfalls

### Pitfall 1: getSession() Instead of getClaims() in Middleware
**What goes wrong:** `getSession()` does not validate the JWT signature in server-side code. An attacker could forge a session token and gain access to protected routes.
**Why it happens:** Old documentation (pre-2025) used `getSession()`. Migration guides still appear in search results.
**How to avoid:** Always `supabase.auth.getClaims()` in middleware and server components.
**Warning signs:** Any import of `getSession` in server-side files.

### Pitfall 2: RLS Enabled But No Policy = Table Still Inaccessible
**What goes wrong:** After enabling RLS, creating an INSERT policy but forgetting a SELECT policy means dashboard can write but never read. App appears broken.
**Why it happens:** Each operation (SELECT, INSERT, UPDATE, DELETE) requires its own policy.
**How to avoid:** Template all four CRUD policies for every table in the migration. Verify with the pg_tables query above.

### Pitfall 3: auth-helpers and @supabase/ssr Conflict
**What goes wrong:** `botmaroc/package.json` currently has both. Auth state becomes unpredictable — session sometimes present, sometimes null, on identical requests.
**Why it happens:** The existing scaffold mixed both packages.
**How to avoid:** Phase 1 first task is to uninstall `@supabase/auth-helpers-nextjs` and update all imports to `@supabase/ssr`.

### Pitfall 4: Tenant ID Stored in user_metadata (User-Editable)
**What goes wrong:** A salon owner modifies their `user_metadata.tenant_id` via the Supabase client to point to a competitor's tenant_id. RLS policy trusts this value — cross-tenant data leak.
**Why it happens:** `user_metadata` is writable by the authenticated user. `app_metadata` is not. Neither is as safe as a custom access token hook reading from a controlled table.
**How to avoid:** Use the custom access token hook that reads `tenant_id` from `tenant_users` table — application code cannot modify this lookup.

### Pitfall 5: Missing Supabase CLI Initialization Before Running Migrations
**What goes wrong:** `supabase migration new` fails with "supabase not initialized" because the `supabase/` directory does not exist yet.
**Why it happens:** `botmaroc` was scaffolded without running `supabase init`.
**How to avoid:** Run `supabase init` inside the `botmaroc/` directory as the first migration step. Commit the generated `supabase/config.toml`.

### Pitfall 6: Webhook Route Matched by Middleware
**What goes wrong:** Middleware redirects to `/login` when Meta calls `/api/webhook` because the route matches the protected pattern and has no auth session.
**Why it happens:** Overly broad middleware matcher.
**How to avoid:** Exclude `/api/webhook` from the middleware matcher pattern (already shown in Pattern 3 above).

---

## Code Examples

### Complete Schema Migration (Core Tables)

```sql
-- Source: ARCHITECTURE.md (verified against project requirements)
-- botmaroc/supabase/migrations/20260331000001_create_schema.sql

-- Core multi-tenant table
CREATE TABLE public.tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  plan         TEXT DEFAULT 'starter',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- One WhatsApp number per tenant (V1)
CREATE TABLE public.phone_numbers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number_id  TEXT UNIQUE NOT NULL,
  waba_id          TEXT NOT NULL,
  display_phone    TEXT NOT NULL,
  status           TEXT DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_phone_numbers_phone_number_id ON public.phone_numbers(phone_number_id);

-- Links Supabase Auth users to tenants
CREATE TABLE public.tenant_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'admin',
  UNIQUE(tenant_id, user_id)
);
CREATE INDEX idx_tenant_users_user_id ON public.tenant_users(user_id);

-- Bot configuration per tenant (INFRA-04)
CREATE TABLE public.bot_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID UNIQUE NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  system_prompt   TEXT,
  active          BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Services offered by each salon
CREATE TABLE public.services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  price_mad        NUMERIC(10,2),
  active           BOOLEAN DEFAULT true
);
CREATE INDEX idx_services_tenant_id ON public.services(tenant_id);

-- Business hours
CREATE TABLE public.schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL,
  open_time    TIME NOT NULL,
  close_time   TIME NOT NULL,
  closed       BOOLEAN DEFAULT false
);
CREATE INDEX idx_schedules_tenant_id ON public.schedules(tenant_id);

-- Conversation state (FSM state per WhatsApp user × tenant)
CREATE TABLE public.conversations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id),
  wa_id                    TEXT NOT NULL,
  state                    JSONB NOT NULL DEFAULT '{"status":"IDLE"}',
  last_customer_message_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, wa_id)
);
CREATE INDEX idx_conversations_tenant_wa ON public.conversations(tenant_id, wa_id);

-- Bookings
CREATE TABLE public.bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  conversation_id UUID REFERENCES public.conversations(id),
  service_id      UUID NOT NULL REFERENCES public.services(id),
  client_wa_id    TEXT NOT NULL,
  client_name     TEXT,
  appointment_at  TIMESTAMPTZ NOT NULL,
  status          TEXT DEFAULT 'confirmed',
  reminder_sent   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  -- Double-booking prevention (BOOK-05, Phase 4)
  UNIQUE(tenant_id, appointment_at)
);
CREATE INDEX idx_bookings_tenant_appointment ON public.bookings(tenant_id, appointment_at);
CREATE INDEX idx_bookings_reminder ON public.bookings(appointment_at, reminder_sent)
  WHERE status = 'confirmed' AND reminder_sent = false;
```

### Complete RLS Migration

```sql
-- botmaroc/supabase/migrations/20260331000002_enable_rls.sql

-- Enable RLS on all tenant tables (default DENY = INFRA-02)
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
-- Note: public.tenants table itself is NOT RLS-protected
-- (service role reads it during tenant lookup; dashboard reads via join)

-- Helper: extract tenant_id from JWT custom claim (set by hook)
-- Wrapping in SELECT allows Postgres to cache per statement, not per row
CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::UUID
$$;

-- RLS policies for: services
CREATE POLICY "services_tenant_select" ON public.services
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));

CREATE POLICY "services_tenant_insert" ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));

CREATE POLICY "services_tenant_update" ON public.services
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.jwt_tenant_id()));

CREATE POLICY "services_tenant_delete" ON public.services
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));

-- Repeat same pattern for: schedules, conversations, bookings, bot_configs, phone_numbers

-- tenant_users: user can only see their own membership row
CREATE POLICY "tenant_users_select" ON public.tenant_users
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
```

### Cross-Tenant Isolation Test (SQL)

```sql
-- Run in Supabase SQL editor to verify INFRA-02 and INFRA-03 (tenant isolation)
-- Step 1: Get two test user tokens (A and B from different tenants)
-- Step 2: Execute as user A:
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "<user_A_id>", "tenant_id": "<tenant_A_id>"}';
SELECT count(*) FROM public.services;
-- Should return only tenant A's rows

-- Step 3: Execute as user A, but query with tenant B's services directly:
-- RLS policy means WHERE tenant_id = tenant_A_id is enforced automatically
-- A cross-tenant query returns 0 rows even without explicit WHERE clause
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 (deprecated 2024, final version 0.15.0) | Remove auth-helpers, use createServerClient/createBrowserClient |
| `supabase.auth.getSession()` in server code | `supabase.auth.getClaims()` | 2025 | getSession() does not validate JWT on server — security vulnerability |
| RLS with `auth.uid()` called per row | Wrap in `(SELECT auth.uid())` | Supabase performance docs (ongoing) | Dramatic query performance improvement on large tables |
| Tenant ID stored in `user_metadata` | Custom access token hook reading from DB | Best practice | user_metadata is user-editable — security risk for RLS |
| `next dev --turbopack` flag | Default (Turbopack is now default in Next.js 16) | Next.js 16 | `next dev` uses Turbopack by default, no flag needed |

**Deprecated:**
- `@supabase/auth-helpers-nextjs`: Final version 0.15.0, no further updates. All helpers replaced by `@supabase/ssr`.
- `supabase.auth.getSession()` in server middleware: Never trust inside server code, use `getClaims()`.

---

## Open Questions

1. **Does the existing `botmaroc` scaffold have any live data or Supabase project linked?**
   - What we know: The project has env var references to `NEXT_PUBLIC_SUPABASE_URL` but no `.env.local` visible
   - What's unclear: Whether a Supabase project exists remotely that Phase 1 should migrate, or whether Phase 1 starts fresh
   - Recommendation: Check for `.env.local` / `.env` files and any existing `supabase/` directory in botmaroc before running `supabase init`. If remote project exists, run `supabase db pull` first.

2. **slug-based routing vs ID-based routing for tenant dashboard**
   - What we know: ARCHITECTURE.md shows `app/(dashboard)/[tenantSlug]/...` pattern
   - What's unclear: Whether the planner should build the `[tenantSlug]` routing in Phase 1 or defer to dashboard phase
   - Recommendation: Phase 1 only needs a minimal post-login landing page. Full slug routing can be introduced in Phase 6 (Dashboard). Avoid over-engineering routing in Phase 1.

3. **bot_configs vs columns on tenants table**
   - What we know: INFRA-04 requires "system prompt, services list, opening hours, active status"
   - What's unclear: Services and schedules are already separate tables. INFRA-04 bot config means a `bot_configs` table for the LLM-specific settings
   - Recommendation: `bot_configs` table (tenant 1:1 relation) for `system_prompt` and `active` flag. Services and schedules remain in their own tables (already in schema above).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `botmaroc/vitest.config.ts` — Wave 0 gap |
| Quick run command | `cd botmaroc && npx vitest run --reporter=verbose` |
| Full suite command | `cd botmaroc && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | All tenant tables have tenant_id indexed | SQL/integration | `supabase db push && psql $DB_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'"` | Wave 0 gap |
| INFRA-02 | RLS default DENY — anon key returns 0 rows on tenant tables | Integration | `npx vitest run tests/rls.test.ts` | Wave 0 gap |
| INFRA-03 | Salon owner can sign up and sign in via email/password | Integration | `npx vitest run tests/auth.test.ts` | Wave 0 gap |
| INFRA-04 | Bot config row can be created and fetched for a tenant | Integration | `npx vitest run tests/bot_configs.test.ts` | Wave 0 gap |

### Sampling Rate

- **Per task commit:** `cd botmaroc && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd botmaroc && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `botmaroc/vitest.config.ts` — Vitest configuration, points to test files
- [ ] `botmaroc/tests/setup.ts` — Test setup: Supabase test client, seed helper
- [ ] `botmaroc/tests/rls.test.ts` — Covers INFRA-01 (indexes exist) + INFRA-02 (cross-tenant returns 0 rows)
- [ ] `botmaroc/tests/auth.test.ts` — Covers INFRA-03 (sign up / sign in flow)
- [ ] `botmaroc/tests/bot_configs.test.ts` — Covers INFRA-04 (bot config CRUD, tenant-scoped)
- [ ] Framework install: `cd botmaroc && npm install -D vitest @vitest/ui` — no test runner currently in package.json

---

## Sources

### Primary (HIGH confidence)
- `https://supabase.com/docs/guides/database/postgres/row-level-security` — RLS syntax, default DENY behavior, SELECT wrap optimization
- `https://supabase.com/docs/guides/auth/server-side/creating-a-client` — createServerClient pattern, cookie handling for Next.js 15
- `https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac` — custom access token hook SQL, JWT claims injection
- `https://nextjs.org/docs/app/getting-started/installation` — Next.js 16 bootstrap, `--yes` defaults (TypeScript + Tailwind + App Router)
- `https://supabase.com/docs/guides/local-development/overview` — Migration CLI commands (migration new, db reset, db push, db pull)
- `npm view @supabase/supabase-js version` → 2.101.0 (verified 2026-03-31)
- `npm view @supabase/ssr version` → 0.10.0 (verified 2026-03-31)
- `npm view next version` → 16.2.1 (verified 2026-03-31)
- `npm view vitest version` → 4.1.2 (verified 2026-03-31)

### Secondary (MEDIUM confidence)
- `https://the-shubham.medium.com/next-js-supabase-cookie-based-auth-workflow-the-best-auth-solution-2025-guide-f6738b4673c1` — complete middleware.ts and updateSession pattern (consistent with official Supabase docs behavior)
- `https://github.com/supabase/auth-helpers` (DEPRECATED.md) — confirmed auth-helpers deprecated, final version 0.15.0
- WebSearch: getClaims() vs getSession() guidance — corroborated by multiple official Supabase doc pages

### Tertiary (LOW confidence)
- Architecture pattern for `bot_configs` as separate 1:1 table — inferred from INFRA-04 requirement + schema research; not a Supabase-specific recommendation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry 2026-03-31
- Architecture: HIGH — patterns verified against official Supabase and Next.js docs
- RLS patterns: HIGH — official Supabase docs; SELECT-wrap optimization documented
- Custom access token hook: MEDIUM — SQL structure verified; hook registration UI steps not fully documented (dashboard UI path)
- Pitfalls: HIGH — getSession/getClaims distinction and auth-helpers deprecation directly from official Supabase docs

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (Supabase and Next.js move quickly; re-verify @supabase/ssr API if delayed more than 30 days)
