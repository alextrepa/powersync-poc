# 13: Test the stack remotely over Tailscale

**What to build:** A developer can expose the running Compose stack through a private tailnet HTTPS name and test the field PWA from a remote phone without opening the application to the public internet.

**Blocked by:** 06: Download a complete team day for offline use.

**Status:** ready-for-agent

**Implementation:** Compose profile, persistent state, tailnet-only Serve configuration, and `just` controls are complete; live acceptance was intentionally not run per user instruction.

- [ ] An optional Compose profile runs the official Tailscale container with persistent node state.
- [ ] Tailscale Serve provides one HTTPS entry point for the containerized field app, API, and PowerSync connections.
- [ ] The setup uses tailnet-only access and does not enable Tailscale Funnel or another public ingress.
- [ ] Authentication material comes from ignored local configuration or CI secrets and never appears in source, logs, or artifacts.
- [ ] A `just` command starts the normal stack with remote access and prints or reports the tailnet URL.
- [ ] `just stop` also stops the optional Tailscale service without deleting its saved node state.
- [ ] A separate device on the tailnet can install or open the PWA, load a team package, and reach the API and PowerSync service through the private HTTPS endpoint.
- [ ] A device outside the tailnet cannot reach the private endpoint.
