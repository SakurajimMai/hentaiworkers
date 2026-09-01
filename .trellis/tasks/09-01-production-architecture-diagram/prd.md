# 生成完整生产架构图

## Goal

Generate a polished, self-contained production architecture map for hentaiworkers that is
traceable to the current repository and deployed configuration. The artifact must explain both
the user-request runtime and the independently triggered delivery paths without inventing cloud
services, regions, or automation that the source does not prove.

## Requirements

- Use Archify's `architecture` diagram type with `meta.locale: "zh-CN"`,
  `meta.quality_profile: "showcase"`, and the `deployment-ownership` engineering profile.
- Pin repository evidence to the exact reviewed `main` revision and attach source paths/line ranges
  to components where Archify supports them.
- Keep one obvious runtime path: Browser / native Android -> HTTPS reverse proxy -> Next.js App ->
  application/domain services -> remote MariaDB.
- Show the separately operated delivery surfaces: GitHub Actions, Docker image publication and
  operator-controlled Compose deployment; Android validation/publication and GitHub Releases.
- Represent session/authentication, in-process bounded catalog caching, media delivery, health
  checks, secrets/TLS boundaries, and APK update discovery without turning every code module into
  a node.
- Distinguish the reverse proxy target (`127.0.0.1:13000`) from the App Compose publish binding
  (`0.0.0.0:13000`) and flag the resulting firewall-dependent bypass surface instead of depicting
  the App port as loopback-only.
- Show that Caddy and the App are operated as separate Compose projects, and that the currently
  reviewed production App runs revision `d26dbed234bdd67be12a28eed33780158c53cf03`.
- Use no more than 12 primary components. Put exclusions and supporting facts in concise cards,
  including the independent `crawler/` boundary and the fact that Compose does not migrate or seed
  the database.
- Do not claim automatic production deployment, a cloud provider, a geographic region, a managed
  CDN/WAF, replicas, queues, or observability services unless source evidence proves them.
- Deliver the editable specification and standalone HTML under `docs/diagrams/`.

## Acceptance Criteria

- [x] The JSON source is valid against Archify's architecture/common schemas and contains stable,
  domain-specific IDs and Chinese authored copy.
- [x] Every production component, ownership label, trust boundary, and meaningful relationship is
  supported by repository or host-configuration evidence at the pinned revision.
- [x] The diagram calls out the observed `0.0.0.0:13000` publish binding as deployment drift and
  does not imply that Caddy is the only network-reachable path unless an unrecorded firewall does so.
- [x] The runtime request path and the two delivery paths are visually distinguishable, with no
  unrelated-node crossings, ambiguous shared corridors, or masked relationship labels.
- [x] `validate architecture ... --quality showcase --json` reports all 9 artifact checks, zero
  composition errors, and zero warnings.
- [x] `deliver` succeeds and reports specification/artifact SHA-256 receipts for the final frozen
  candidate.
- [x] `visual-check` succeeds against the delivered HTML. Manual browser evidence at 1440x900,
  1600x1000, 1920x1080, and 2048x1320 shows no horizontal/vertical overflow, clipping, or
  conspicuous empty lower band.
- [x] An image-capable review confirms labels are readable, the main path is obvious, and the final
  result truthfully matches the evidence; automated checks are not reported as perceptual approval.
- [x] Existing application code, deployment configuration, production services, and the untracked
  root `design.md` remain unchanged.

## Notes

- Primary language is Chinese. Exact product names, paths, protocols, API routes, and commands stay
  in their source language.
- Static output is the default; trace animation and guided Viewer chapters are out of scope unless
  separately requested.
