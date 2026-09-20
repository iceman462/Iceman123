# FRANCIS AND ISAAC AI BOT — Admin Edition

Modern neon AI website with an administrator-only AI Chat and a private Website Status & Updates control center.

## Admin
- Default admin password requested: `ISAAC12345`
- For a public deployment, set `ADMIN_PASSWORD` in Render environment variables to a new private password.
- AI Chat is locked until the administrator logs in.
- Admin dashboard shows website status, AI API configuration, version and uptime.
- The Update Center has a **Check for Updates** button and a **Copy Update Request** button for requesting a new ZIP update from ChatGPT.

## Required Render environment variables
- `OPENAI_API_KEY` — your OpenAI API key
- `OPENAI_CHAT_MODEL` — the model you want to use
- `ADMIN_PASSWORD` — admin password (default fallback is `ISAAC12345`)
- `UPDATE_MANIFEST_URL` — optional JSON manifest URL for your own update server

## Important
The website cannot directly receive a future ChatGPT response as an application update. The included Update Center prepares a standard update request; when you want a new version, send that request to ChatGPT together with the current ZIP and a new deployment-ready ZIP can be produced.
