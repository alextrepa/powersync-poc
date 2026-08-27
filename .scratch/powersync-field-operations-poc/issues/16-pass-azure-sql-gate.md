# 16: Pass the Azure SQL compatibility gate

**What to build:** The containerized applications can replace the local SQL Server service with a temporary Azure SQL Database and pass the conflict and retry scenarios required for the client's database target.

**Blocked by:** 14: Qualify the complete local workflow in CI.

**Status:** ready-for-agent

**Implementation:** the disposable Azure SQL provisioning, cleanup safeguards, and Compose override are ready; no Azure resources were provisioned and the cloud acceptance gate has not been run.

- [ ] A temporary Azure SQL Database supports the required CDC and PowerSync checkpoint configuration.
- [ ] The frontend, API, PowerSync, PostgreSQL, and test runner remain containerized while only the application database changes to managed Azure SQL.
- [ ] Secrets stay outside source and sanitized evidence.
- [ ] The overdraw scenario passes in both reconnect orders and preserves both physical pickups.
- [ ] The lost-response retry scenario produces one business effect and an empty queue.
- [ ] Every reconnect run converges within 120 seconds.
- [ ] Evidence records source-to-client timing, reconnect timing, version details, and differences from local SQL Server.
- [ ] The temporary Azure resources are removed after evidence is captured.
