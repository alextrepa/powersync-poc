# 02: Prove SQL Server data reaches the field browser

**What to build:** A developer can write a probe row to SQL Server and watch it travel through CDC and PowerSync into persistent browser storage and the visible field client.

**Blocked by:** 01: Run the containerized POC stack.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] SQL Server enables CDC on the database, checkpoint structures, and replicated probe table.
- [x] PowerSync reads the source through supported SQL Server configuration and writes to its private PostgreSQL bucket storage.
- [x] The field client reads the replicated row from browser SQLite rather than an online HTTP read.
- [x] A real-stack Chromium test inserts a SQL Server row and waits until the browser displays it.
- [x] The evidence records SQL Server, PowerSync service, PowerSync Web, and browser storage versions plus source-to-client timing.
- [x] A failed or unsupported connector path produces a clear Gate 0 stop decision rather than triggering product UI work.
