# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting: go to the **Security** tab of this repository and choose **Report a vulnerability**. Include the affected area, steps to reproduce and the likely impact.

You can expect an initial response within 7 days. This is a community project, so there is no bug bounty.

## Supported versions

Only the latest `main` branch receives security fixes.

## If you run your own instance

You are responsible for the security of your deployment. In particular:

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or AI provider keys through `VITE_` variables, which are sent to every browser.
- Replace the placeholder contact details in `public/.well-known/security.txt` and the legal pages.
- Keep row level security enabled on every table.
- Set spending limits on AI providers. The translation studio can create real costs.
- Keep the Supabase Auth redirect list limited to your own domains.
