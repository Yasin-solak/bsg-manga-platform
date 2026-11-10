# Contributing

Thanks for your interest in BSG Manga Platform. Bug reports, fixes, translations and documentation are all welcome.

## Good places to start

- **Fresh install testing.** The migration chain is checked on an empty database in CI. Installing it on your own Supabase project and reporting what breaks is still very valuable.
- **English audit reports.** The generators in `scripts/deep-audit-suite.mjs` and `scripts/repo-health-audit.mjs` still write Turkish headings.
- **A new language.** Dictionaries live in `src/i18n/messages/`.
- Issues labeled `good first issue`.

For larger changes, please open an issue first so we can agree on the approach.

## Development setup

Follow [Self-hosting](README.md#self-hosting) up to `npm run dev`. To run the browser tests, placeholder Supabase values are enough:

```bash
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder
```

Without these the app throws during startup, and every Playwright test reports "element not found".

## Before opening a pull request

```bash
npm run lint
npm run lint:text
npm run build
npm run test:contracts
npm run health:repo:strict
npm run audit:deep:strict
```

Run Playwright specs for the area you changed. Specs that write to a real database are skipped unless `E2E_ALLOW_LIVE_ACCOUNTS=1` is set. **Never set it against a database you care about.**

Audit baselines in `docs/reports` depend on the platform. Regenerate them only on Linux with Node 20, the same as CI.

## Project conventions

- **User-visible text** goes through `txa('...')` and needs a dictionary entry, or a contract test fails. Do not put UI text in constants evaluated at import time: use a getter, such as `get label() { return txa('...') }`.
- **Links and navigation** come from `@/i18n/router`, not `react-router-dom`. A lint rule enforces this.
- **Standalone full-screen pages** that draw their own shell must be added to `shouldUseChrome` in `src/components/layout/Layout.tsx`.
- **CSS** must not select on visible text such as `aria-label`. Use data attributes.
- **Contract tests** pin intent. When a redesign breaks one, update it to protect the new intent. Do not delete the guard, and do not just change it until it passes.
- **Authorization** belongs in the database. A client-side check is a convenience, not a security control.
- **File size:** source files are limited to 850 lines by the repo health check.
- **Commits and comments** are written in English.

## Database changes

- Add a new migration. Never edit one that has already been released.
- New tables need row level security and explicit policies.
- `SECURITY DEFINER` functions must set `search_path` and check the caller's permission.
- Do not include account-specific data or production identifiers.

## Pull requests

Keep each pull request focused on one change, explain why it is needed, and add screenshots for visual changes. By contributing, you agree that your contribution is licensed under AGPL-3.0, and that the project owner may also offer it under the project's commercial license.
