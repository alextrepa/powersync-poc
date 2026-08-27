# QA-010: Private Tailscale access

Routine state: executable

Covers: [Ticket 13](../../../.scratch/powersync-field-operations-poc/issues/13-test-remotely-over-tailscale.md)

## Outcome

A device on the configured tailnet can reach the containerized POC through one private HTTPS address, while a device outside the tailnet cannot.

## Preconditions

- The local Compose stack passes QA-001.
- The host and test device belong to the approved tailnet.
- Tailscale authentication material is available outside source control.
- The test device also has a way to verify behavior while disconnected from Tailscale.

## Procedure

1. Run `just remote-start`.
   Expected: The normal services and optional Tailscale container become healthy, and the command reports the tailnet HTTPS address.
2. Open the address from a tailnet-connected device.
   Expected: The field PWA loads over valid HTTPS and can reach its API and PowerSync endpoints.
3. Download a team package and perform one synchronized read and write.
   Expected: The remote device receives SQL Server data and uploads one operation through the private endpoint.
4. Run `just remote-status` and inspect the sanitized Tailscale and application logs.
   Expected: Status reports private Serve as active and Funnel as disabled. No authentication key, database secret, or connection string appears.
5. Disconnect the test device from Tailscale without joining the local network and retry the address.
   Expected: The private endpoint is unreachable.
6. Run `just stop`, run `just remote-start`, and reconnect the device.
   Expected: The Tailscale node reuses its saved state and the private address works without routine reauthentication.

## Pass criteria

- The remote device uses a tailnet-only HTTPS address.
- The field app, API, and PowerSync traffic work through that address.
- `just remote-status` confirms that no public Funnel or other public ingress is enabled.
- A non-tailnet device cannot reach the endpoint.
- Stop and restart preserve Tailscale node state without leaking credentials.

## Evidence

- Screenshot of the HTTPS address and loaded field PWA on the remote device.
- Tailnet device identity and ACL result without secret values.
- Sanitized `just remote-status` output showing private Serve enabled and Funnel disabled.
- Synchronized read and write identifiers.
- Failed access observation from outside the tailnet.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
