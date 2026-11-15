# A01 – Deployment identity and test-data isolation verification

**15 November 2026 – A01 diagnostics release.** Development can add a safe
read-only environment inspection page, but **A01 remains an operational NO-GO**
until the actual running Production and Preview deployments have distinct,
independently verified database projects and a signed deployment map.

## Evidence collected (no secrets)

- GitHub `main` was `c18f8dcce3ce7732ae1a3727e4cce8826e444fdf`
  at the beginning of this A01 review; latest A11 Vercel Production build
  for this SHA had successful status.
- Supabase project **Vanstock**, ref `aqdwqargcjnhvupwtjcr`,
  ap-southeast-1, healthy, is the audited operational data project.
- A second Supabase project **Gazzbean's Project**,
  ref `sgcixcohvigeibqylbhq`, ap-southeast-2, also exists in the account.
  It has **NOT** been designated a VanStock test project, inspected for
  nonproduction data suitability or authorised for data reset.
  Its existence does not establish isolation of Vercel Preview.
- Production database read-only counts: 15 van-stock records,
  2 warehouse-stock records and 35 stock activity records at initial check.
- The current application takes `NEXT_PUBLIC_SUPABASE_URL` as the endpoint
  for browser, session-aware and privileged server clients
  (`lib/supabase.ts`). Vercel Preview can therefore target the live DB
  if provided the production URL, irrespective of a Preview Vercel build.
- Existing `WAREHOUSE_WRITES_ENABLED` only gates selected warehouse
  operations; **it is not a global read-only mode** for all stock actions.
- Vercel production alias, individual deployment IDs and the actual
  Preview/Production environment variable scopes were **not directly
  retrievable** through connected tools as of this review.
  Never fill them from guesses, a deployment's build status or a screenshot
  of another deployment.

## Deployment diagnostic

A01 introduces `/admin/deployment`, a **server-rendered,
Administrator-only** read-only page linked from the Administrator screen.
It displays only:
- Vercel environment and target environment, Git branch and commit SHA;
- Vercel's **unique deployment hostname** and production hostname hint
  (neither is, by itself, proof that the production alias is pointed there);
- **Supabase project ref only**, from public project URL, not anon/service keys;
- effective warehouse write-flag value (for only operations gated by it);
- warnings if Preview uses the *known audited production ref* or if Production
  points to a different ref.

A distinct Preview project ID is **not yet proof** that the second project is
empty, isolated, suitably permissioned, or safe for synthetic stock operations.
The page never changes a flag, issues a stock RPC, reads live inventory or
claims operational acceptance. System environment variables may show
`Not supplied` if the Vercel project does not expose them.

## Required A01 evidence (Release Owner)

| Evidence field | Production | Preview/isolation |
|---|---|---|
| Actual stable URL and configured Vercel Domains alias | To verify | To verify |
| Vercel deployment ID and deployed Git SHA | To verify in deployment detail | To verify in deployment detail |
| Runtime `VERCEL_ENV` and target environment | Read admin diagnostic page | Read admin diagnostic page |
| Runtime Supabase project ref | Must match audited `aqdwqargcjnhvupwtjcr` | Must differ and be approved as safe |
| DB ownership/purpose and data-reset approval | Real operational data, protected | Explicit test designation and consent |
| Warehouse write flag on deployed build | Capture on admin page; document control | Disabled until safe isolated acceptance |
| Business sign-off | Release Owner + date | Release Owner + date |

**No stock test writes until the Preview connection is confirmed isolated.**

## How to complete the comparison

1. Visit the actual stable **Production** URL and sign in as Administrator.
   Open **Admin → A01 – Check deployment identity**. Record the displayed
   Vercel environment, project ref and Git SHA, and whether the guarded
   warehouse-write flag is enabled. Do not record API secrets.
2. From the Vercel `simplicityair/vanstock` project, open
   **Deployments** and select the actual production deployment to confirm
   the Deployment ID, its Git SHA, Environment and assigned domains.
   Compare with the admin page; a GitHub status alone is insufficient.
3. Open the intended **Preview** deployment. Sign in only for the
   **read-only** diagnostics. Confirm the runtime database ref, environment
   and SHA. Do not use Warehouse, Materials Used or stock-changing routes
   for test data, even if the preview contains only sample records.
4. In Vercel **Settings → Environment Variables**, inspect the
   *environment scope* of `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` and `WAREHOUSE_WRITES_ENABLED`
   **without recording any key values**. Note whether branch-specific
   Preview overrides and shared variables apply. Check that the deployed
   build was created **after** the appropriate environment settings.
5. If the Preview URL uses audited Production ref, record **NO-GO**:
   ensure no Preview stock writes, and arrange a genuinely independent
   nonproduction Supabase project and correct Preview environment variables.
   Do not repurpose the other existing Supabase project without confirming
   ownership and data disposition.
6. Once the test project is independently verified, conduct A06
   authenticated user acceptance with synthetic stock only inside that
   isolated environment and complete A08–A10 operational controls.

## Rollback

Only the admin-only diagnostic page, a private-source helper, tests and
docs are added. No migration, Supabase data/grants, Vercel flags, user
roles or stock quantities change. Roll back the PR if the page has an
unexpected issue; this does not change deployment bindings.

## Sources

- Vercel, System Environment Variables:
  https://vercel.com/docs/environment-variables/system-environment-variables
- Vercel, Deployment Environment variables and scopes:
  https://vercel.com/docs/environment-variables
- VanStock authoritative release gate:
  `docs/A11-technical-audit-and-pilot-gate.md`.
