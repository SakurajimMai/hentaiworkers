# Production Architecture Diagram Design

## Evidence Boundary

The diagram describes the committed App-only system and the currently documented production
deployment. Evidence comes from the repository at one full Git revision plus sanitized operational
configuration under `/root/docker/anime` and the reverse-proxy configuration. Secret values are
never copied into task research or diagram artifacts.

Repository paths expected to anchor the diagram:

- `docs/architecture.md` and `docs/deployment.md` for declared system boundaries.
- `app/**`, `middleware.ts`, and `lib/server/**` for request, session, service, cache, and database
  behavior.
- `Dockerfile`, `deploy/docker-compose.yml`, and health Route Handlers for the App container.
- `.github/workflows/docker-publish.yml` and `.github/workflows/build-android.yml` for independent
  image/APK delivery paths.
- `mobile/android/**` for the native client, local persistence, media playback, and update checks.

Host configuration may prove the active reverse proxy, bind address, and single App container, but
the checked-in artifact must not include hostnames containing secrets, credentials, database
addresses, or environment values beyond the already-public site origin.

## Diagram Model

Use Archify `architecture` with Chinese renderer UI, `showcase` quality, and
`deployment-ownership`. Keep the primary runtime request path visually dominant and arrange
delivery components as shorter supporting branches. Exact coordinates are chosen only while
authoring the candidate and are not prescribed here.

Primary semantic groups:

1. Public clients: browser and native Kotlin Android application.
2. Production ingress and host: HTTPS reverse proxy, operator-controlled Docker Compose, and the
   single Next.js standalone container.
3. App internals: App Router / Route Handlers and the application/domain/infrastructure boundary,
   including process-local bounded read caches.
4. External state and media: remote TLS MariaDB plus externally addressed image/video origins.
5. Delivery: GitHub source and Actions, Docker Hub images, Android release artifacts, and manual
   production rollout/rollback.

Use cards rather than extra nodes for table families, auth/encryption details, health endpoints,
cache freshness/stale behavior, database migration ownership, and the excluded independent crawler.

## Truth And Ownership

- The reverse proxy terminates public HTTPS and forwards to the App's host-bound port.
- Caddy targets `127.0.0.1:13000`, but the App Compose project currently publishes that port on
  `0.0.0.0:13000`. The diagram must show this as an observed, firewall-dependent bypass surface;
  it must not silently normalize the deployment to the documented loopback recommendation.
- Caddy and the App are separate Compose projects on the production host. The diagram may group
  them inside one host boundary, but ownership labels and connections must preserve that separation.
- Production Compose owns only the App container; the remote database is independently operated.
- Next.js owns UI, admin, APIs, use-case orchestration, session validation, encryption adapters, and
  MariaDB repositories in one process.
- GitHub Actions publishes images but does not prove automatic host deployment. The operator selects
  and rolls out an image through Compose, with an explicitly retained rollback image/tag.
- Android CI and GitHub Releases are independent of the App image. The App update endpoint discovers
  verified release assets; the client decides when to download/install an APK.
- Unknown provider, region, host ownership organization, and media-origin implementation stay
  explicitly unknown instead of being inferred.
- The production snapshot is pinned to App revision
  `d26dbed234bdd67be12a28eed33780158c53cf03`; transient rollback tags are operational evidence, not
  a guaranteed permanent architecture component.

## Artifact Contract

- Source: `docs/diagrams/hentaiworkers-production.architecture.json`
- Delivery: `docs/diagrams/hentaiworkers-production.architecture.html`
- Diagram source contains the pinned public GitHub repository URL and full reviewed revision.
- `deliver` is the only command allowed to replace the final HTML.
- After a passing final validation, freeze the JSON bytes. Browser evidence may inspect but never
  rerender or mutate the delivered HTML.

## Verification And Repair

Run schema/showcase validation after each candidate edit. For a failure, change only the diagnosed
subject using supported fixes. Stop and report unresolved diagnostics if two consecutive repair
rounds do not reduce the best objective error count.

After delivery, run Archify `visual-check`, then inspect real screenshots at all required desktop
sizes. Automated receipts, browser measurements, and perceptual visual review are reported as three
separate claims.

## Non-Goals

- No application, API, database, Android, CI, Compose, or live production mutation.
- No crawler topology beyond documenting that it is outside the App runtime and image boundary.
- No sequence-level request trace, data lineage map, animated presentation, or incident runbook.
- No invented availability, disaster recovery, WAF, CDN, queue, telemetry, or auto-deploy layer.
