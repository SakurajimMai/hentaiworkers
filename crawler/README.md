# Crawler workspace

`crawler/` contains data-producer projects that are independent from the root Next.js app.
Each crawler owns its dependencies, runtime configuration, tests, and deployment. Crawler
code must not import private modules from `app/`, `components/`, or `lib/server/`, and it is
excluded from the App Docker build, TypeScript project, ESLint, and Compose deployment.

Production configuration and generated runtime files must remain untracked. Commit only
sanitized `*.example.yml` templates.
