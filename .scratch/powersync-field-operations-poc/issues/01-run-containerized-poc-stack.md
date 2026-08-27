# 01: Run the containerized POC stack

**What to build:** A developer can start the complete local POC through Docker Compose and reach healthy field, admin, API, SQL Server, PowerSync, and PostgreSQL services without installing application runtimes on the host.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] `just start` builds and starts both frontends, the API, SQL Server, PowerSync, private PostgreSQL bucket storage, and the containerized browser test runner.
- [x] Compose health checks cover every required long-running service, and `just start` waits for readiness or exits with a failure.
- [x] The field and admin shells are reachable after startup, and a headless Chromium smoke check runs against the containerized stack.
- [x] SQL Server and PostgreSQL use named volumes and retain data across an ordinary stop and restart.
- [x] `just stop` stops every service, including an enabled optional profile, without deleting named volumes.
- [x] Local secrets use ignored configuration and never appear in committed files or test output.
- [x] A CI job can build the images and run the same containerized smoke check.
