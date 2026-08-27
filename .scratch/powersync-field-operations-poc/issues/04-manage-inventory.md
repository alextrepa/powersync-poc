# 04: Manage products, lots, quantities, and flags

**What to build:** An administrator can maintain the product-specific lots that planning and field work use, including quantity changes and reversible lot flags with retained history.

**Blocked by:** 02: Prove SQL Server data reaches the field browser.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] The admin can create and edit products.
- [x] The admin can create lots, and each lot belongs to exactly one product while a product may have many lots.
- [x] The admin can set and edit a numeric recorded quantity.
- [x] The admin can flag a whole lot and see its active reason and history.
- [x] The admin can clear a flag without changing recorded quantity or deleting flag history.
- [x] Admin commands use the API and transactional SQL Server domain services rather than direct browser database access.
- [x] A containerized browser scenario covers product creation, lot creation, quantity editing, flagging, and flag clearing.
