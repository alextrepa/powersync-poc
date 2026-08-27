# 03: Prove an offline mutation reaches SQL Server once

**What to build:** A field browser can save work without connectivity, reconnect, upload through the API, empty its queue, and converge with one authoritative SQL Server effect.

**Blocked by:** 02: Prove SQL Server data reaches the field browser.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] The field client stores a mutation in persistent browser SQLite while its network is disabled.
- [x] Reconnection sends the queued operation through the containerized API and commits it to SQL Server.
- [x] Every operation has a stable identifier, and a retry after a lost success response returns the stored result without duplicating the effect.
- [x] Reusing an operation identifier with a different payload is rejected without corrupting queue order.
- [x] The queue becomes empty and the browser converges with SQL Server within 30 seconds after all services are healthy.
- [x] Headless Chromium proves the offline, retry, and convergence behavior against the real Compose stack.
- [x] Gate 0 records a proceed or stop decision before product feature work continues.
