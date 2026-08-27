set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

default:
    just --list

# Check that the agreed specification set exists and contains no draft markers.
check-specs:
    & './scripts/check-specs.ps1'

# Build every image and start the application after health checks pass.
start:
    docker compose --profile test build
    docker compose up -d --wait

# Stop all normal and optional services without deleting persistent volumes.
stop:
    docker compose --profile test --profile tailscale down

# Run all fast checks on the host.
check:
    npm run check
    just check-specs
    docker compose config --quiet

# Run Chromium against the real containerized stack.
e2e:
    docker compose --profile test run --build --rm e2e

# Start the private tailnet ingress. This is intentionally not exercised in the POC automation.
start-remote:
    docker compose --profile tailscale up -d --build --wait
    docker compose exec tailscale tailscale status --json

remote-start: start-remote

remote-status:
    docker compose exec tailscale tailscale status --json

remote-stop:
    docker compose --profile tailscale stop tailscale

# Provision and remove a dedicated, temporary CDC-capable Azure SQL S3 database.
azure-provision:
    & './scripts/provision-azure.ps1'

azure-prepare:
    & './scripts/prepare-azure.ps1'

azure-start:
    docker compose -f compose.yaml -f compose.azure.yaml up -d --build --wait powersync api admin field gateway

azure-stop:
    docker compose -f compose.yaml -f compose.azure.yaml down

azure-clean:
    & './scripts/clean-azure.ps1'

qa-service service action:
    docker compose {{action}} {{service}}

qa-reset scenario:
    & './scripts/qa-reset.ps1' '{{scenario}}'

qa-inspect view="health":
    & './scripts/qa-inspect.ps1' '{{view}}'

qa-fault mode:
    & './scripts/qa-fault.ps1' '{{mode}}'

qa-command scenario:
    & './scripts/qa-command.ps1' '{{scenario}}'

e2e-convergence runs="20":
    docker compose --profile test run --build --rm e2e sh -lc 'npx playwright test tests/e2e/stack-smoke.spec.ts --grep "survives offline reload" --repeat-each={{runs}} --workers=1 --reporter=json > /tmp/convergence.json && node scripts/summarize-convergence.mjs /tmp/convergence.json /workspace/evidence/convergence-summary.json'

# Restart the replication and API services, then prove the browser-visible stack recovers.
e2e-recovery:
    docker compose restart api powersync
    docker compose up -d --wait
    docker compose --profile test run --build --rm e2e npx playwright test tests/e2e/stack-smoke.spec.ts --grep "containerized stack serves"

# Queue a real browser operation, stop API and PowerSync, then restore both and prove convergence.
e2e-interruption:
    node scripts/run-interruption-e2e.mjs

logs service="":
    docker compose logs --tail 200 {{service}}
