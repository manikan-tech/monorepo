# Phase 1 container operations

This is the local/EC2 deployment topology for the first vertical slice:

```text
Internet -> Caddy (only published ports 80/443) -> Store (:3000, private)
                                                -> Body (:8001, private)
```

`BODY_SERVICE_URL` is set by Compose to `http://body:8001`; the Store reaches
Body using Docker service DNS. Body has no `ports:` section, so it cannot be
addressed through the host IP. The Store adds `X-Manikan-Internal-Key`, and
Body verifies the matching `BODY_SERVICE_KEY`.

Set the server-only `STORE_PUBLIC_URL` to the browser-facing HTTPS Store
origin. This lets Store give Body a publicly resolvable product-image URL even
though Next itself listens only on the private Docker address.

## Private configuration

Copy the three files in `infra/env/` ending in `.example` to files without
`.example`. These copies are ignored by Git. Keep licensed SMPL assets in the
directory named by `BODY_MODEL_HOST_DIR`; Compose mounts it at
`/app/models/smpl` read-only, so rebuilding the image never copies or deletes
those assets while the image retains its normal garment templates.

For a local HTTP test, use `CADDY_SITE_ADDRESS=:80` and non-conflicting host
ports such as `18080`/`18443`. On EC2, set `CADDY_SITE_ADDRESS` to a real DNS
name and point that DNS record at the instance before Caddy can obtain TLS.

## Useful commands

Run from the repository root after loading the private Compose environment.
The `STORE_ENV_FILE` and `BODY_ENV_FILE` values inside `compose.env` are
relative to `infra/compose.production.yml`.

```bash
docker compose --env-file infra/env/compose.env -f infra/compose.production.yml up -d
docker compose --env-file infra/env/compose.env -f infra/compose.production.yml ps
docker compose --env-file infra/env/compose.env -f infra/compose.production.yml logs -f store
docker compose --env-file infra/env/compose.env -f infra/compose.production.yml logs -f body
docker compose --env-file infra/env/compose.env -f infra/compose.production.yml restart body
```

The liveness probes are `GET /api/health` for Store and `GET /ready` for Body.
Body readiness only checks required assets; it does not perform a generation.
Docker JSON logs rotate at 10 MB with three files per container.

## Local benchmark baseline (Phase A)

Measured on the development host (31 GiB RAM, 12 logical CPUs), with one
male dressed-avatar request at a time:

| Measurement | Observed result |
| --- | --- |
| Store idle memory | ~187 MiB |
| Body cold idle memory | ~206 MiB |
| Body warm peak memory | ~357 MiB |
| Cold dressed generation | ~3.12 s |
| Warm dressed generation | ~1.42 s |
| Body CPU peak | ~11.5 logical cores during one generation |
| Store `/store` response while Body generated | ~20 ms |
| Store image | ~141 MB |
| Body image | ~383 MB |
| Private model directory | ~196 MB |

These are measurements from this machine and payload, not an EC2 sizing
guarantee. The key finding is CPU saturation: preserve the one-generation
limit initially and benchmark on the selected EC2 family before increasing
concurrency or colocating additional workers.
