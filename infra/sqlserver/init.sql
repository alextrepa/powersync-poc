:setvar DatabaseName "plant_route"
:setvar AppUser "plant_app"

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF DB_ID('$(DatabaseName)') IS NULL CREATE DATABASE [$(DatabaseName)];
GO
USE [$(DatabaseName)];
IF (SELECT is_cdc_enabled FROM sys.databases WHERE name = '$(DatabaseName)') = 0 EXEC sys.sp_cdc_enable_db;
GO

USE [master];
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '$(AppUser)')
  CREATE LOGIN [$(AppUser)] WITH PASSWORD = '$(AppPassword)', CHECK_POLICY = OFF;
GRANT VIEW SERVER PERFORMANCE STATE TO [$(AppUser)];
GO
USE [$(DatabaseName)];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$(AppUser)')
  CREATE USER [$(AppUser)] FOR LOGIN [$(AppUser)];
ALTER ROLE db_datareader ADD MEMBER [$(AppUser)];
ALTER ROLE db_datawriter ADD MEMBER [$(AppUser)];
GRANT VIEW DATABASE PERFORMANCE STATE TO [$(AppUser)];
GO

IF OBJECT_ID('dbo._powersync_checkpoints', 'U') IS NULL CREATE TABLE dbo._powersync_checkpoints (
  id int IDENTITY PRIMARY KEY,
  last_updated datetime NOT NULL DEFAULT GETUTCDATE()
);

IF OBJECT_ID('dbo.products', 'U') IS NULL CREATE TABLE dbo.products (
  id varchar(36) NOT NULL PRIMARY KEY,
  name nvarchar(160) NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.lots', 'U') IS NULL CREATE TABLE dbo.lots (
  id varchar(36) NOT NULL PRIMARY KEY,
  product_id varchar(36) NOT NULL REFERENCES dbo.products(id),
  code nvarchar(80) NOT NULL UNIQUE,
  location nvarchar(160) NOT NULL,
  recorded_quantity int NOT NULL,
  version int NOT NULL DEFAULT 1,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
DECLARE @lots_quantity_check sysname;
SELECT TOP (1) @lots_quantity_check = cc.name
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID('dbo.lots') AND cc.definition LIKE '%recorded_quantity%';
IF @lots_quantity_check IS NOT NULL
BEGIN
  DECLARE @drop_lots_quantity_check nvarchar(400);
  SET @drop_lots_quantity_check = 'ALTER TABLE dbo.lots DROP CONSTRAINT ' + QUOTENAME(@lots_quantity_check);
  EXEC sp_executesql @drop_lots_quantity_check;
END;
IF OBJECT_ID('dbo.daily_plans', 'U') IS NULL CREATE TABLE dbo.daily_plans (
  id varchar(36) NOT NULL PRIMARY KEY,
  service_date date NOT NULL,
  team_count int NOT NULL CHECK (team_count > 0),
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at datetimeoffset NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_daily_plans_published_date')
  CREATE UNIQUE INDEX UX_daily_plans_published_date ON dbo.daily_plans(service_date) WHERE status = 'published';
IF OBJECT_ID('dbo.trucks', 'U') IS NULL CREATE TABLE dbo.trucks (
  id varchar(36) NOT NULL PRIMARY KEY,
  daily_plan_id varchar(36) NOT NULL REFERENCES dbo.daily_plans(id),
  truck_number int NOT NULL CHECK (truck_number > 0),
  CONSTRAINT UX_trucks_plan_number UNIQUE (daily_plan_id, truck_number)
);
IF OBJECT_ID('dbo.allocations', 'U') IS NULL CREATE TABLE dbo.allocations (
  id varchar(36) NOT NULL PRIMARY KEY,
  truck_id varchar(36) NOT NULL REFERENCES dbo.trucks(id),
  lot_id varchar(36) NOT NULL REFERENCES dbo.lots(id),
  quantity int NOT NULL CHECK (quantity > 0),
  reserved_remaining int NOT NULL CHECK (reserved_remaining >= 0),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UX_allocations_truck_lot UNIQUE (truck_id, lot_id)
);
IF OBJECT_ID('dbo.team_assignments', 'U') IS NULL CREATE TABLE dbo.team_assignments (
  id varchar(36) NOT NULL PRIMARY KEY,
  allocation_id varchar(36) NOT NULL REFERENCES dbo.allocations(id),
  team_number int NOT NULL CHECK (team_number > 0),
  quantity int NOT NULL CHECK (quantity > 0),
  planned_picked_quantity int NOT NULL DEFAULT 0 CHECK (planned_picked_quantity >= 0),
  CONSTRAINT UX_assignments_allocation_team UNIQUE (allocation_id, team_number)
);
IF OBJECT_ID('dbo.lot_flags', 'U') IS NULL CREATE TABLE dbo.lot_flags (
  id varchar(36) NOT NULL PRIMARY KEY,
  lot_id varchar(36) NOT NULL REFERENCES dbo.lots(id),
  reason nvarchar(400) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cleared')),
  created_by_team_number int NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  cleared_at datetimeoffset NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_lot_flags_active')
  CREATE UNIQUE INDEX UX_lot_flags_active ON dbo.lot_flags(lot_id) WHERE status = 'active';
IF OBJECT_ID('dbo.alternative_claims', 'U') IS NULL CREATE TABLE dbo.alternative_claims (
  id varchar(36) NOT NULL PRIMARY KEY,
  assignment_id varchar(36) NOT NULL REFERENCES dbo.team_assignments(id),
  team_number int NOT NULL,
  lot_id varchar(36) NOT NULL REFERENCES dbo.lots(id),
  quantity int NOT NULL CHECK (quantity > 0),
  state varchar(16) NOT NULL DEFAULT 'active' CHECK (state IN ('active','picked','cancelled')),
  operation_id varchar(36) NOT NULL UNIQUE,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.pickups', 'U') IS NULL CREATE TABLE dbo.pickups (
  id varchar(36) NOT NULL PRIMARY KEY,
  assignment_id varchar(36) NOT NULL REFERENCES dbo.team_assignments(id),
  team_number int NOT NULL,
  lot_id varchar(36) NOT NULL REFERENCES dbo.lots(id),
  quantity int NOT NULL CHECK (quantity >= 0),
  source varchar(16) NOT NULL CHECK (source IN ('planned','alternative')),
  claim_id varchar(36) NULL REFERENCES dbo.alternative_claims(id),
  operation_id varchar(36) NOT NULL UNIQUE,
  recorded_at_client datetimeoffset NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.shortage_reports', 'U') IS NULL CREATE TABLE dbo.shortage_reports (
  id varchar(36) NOT NULL PRIMARY KEY,
  assignment_id varchar(36) NOT NULL REFERENCES dbo.team_assignments(id),
  expected_quantity int NOT NULL,
  picked_quantity int NOT NULL,
  reason varchar(32) NOT NULL,
  other_reason nvarchar(400) NULL,
  flag_requested bit NOT NULL,
  operation_id varchar(36) NOT NULL UNIQUE,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.exceptions', 'U') IS NULL CREATE TABLE dbo.exceptions (
  id varchar(36) NOT NULL PRIMARY KEY,
  type varchar(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  subject_type varchar(32) NOT NULL,
  subject_id varchar(36) NOT NULL,
  details nvarchar(max) NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  resolved_at datetimeoffset NULL
);
IF OBJECT_ID('dbo.exception_participants', 'U') IS NULL CREATE TABLE dbo.exception_participants (
  exception_id varchar(36) NOT NULL REFERENCES dbo.exceptions(id),
  plan_id varchar(36) NOT NULL REFERENCES dbo.daily_plans(id),
  team_number int NOT NULL,
  pickup_id varchar(36) NULL REFERENCES dbo.pickups(id),
  PRIMARY KEY (exception_id, plan_id, team_number)
);
IF OBJECT_ID('dbo.corrections', 'U') IS NULL CREATE TABLE dbo.corrections (
  id varchar(36) NOT NULL PRIMARY KEY,
  command_id varchar(36) NOT NULL UNIQUE,
  payload_hash varchar(64) NOT NULL,
  exception_id varchar(36) NULL REFERENCES dbo.exceptions(id),
  kind varchar(40) NOT NULL,
  details nvarchar(max) NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.pickup_effects', 'U') IS NULL CREATE TABLE dbo.pickup_effects (
  pickup_id varchar(36) NOT NULL PRIMARY KEY REFERENCES dbo.pickups(id),
  effective_lot_id varchar(36) NOT NULL REFERENCES dbo.lots(id),
  effective_quantity int NOT NULL,
  effective_source varchar(16) NOT NULL,
  version int NOT NULL DEFAULT 1
);
IF OBJECT_ID('dbo.inventory_adjustments', 'U') IS NULL CREATE TABLE dbo.inventory_adjustments (
  id varchar(36) NOT NULL PRIMARY KEY,
  lot_id varchar(36) NOT NULL REFERENCES dbo.lots(id),
  previous_quantity int NOT NULL,
  new_quantity int NOT NULL,
  reason nvarchar(400) NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.processed_operations', 'U') IS NULL CREATE TABLE dbo.processed_operations (
  operation_id varchar(36) NOT NULL PRIMARY KEY,
  operation_type varchar(40) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  result nvarchar(max) NOT NULL,
  processed_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.truck_completions', 'U') IS NULL CREATE TABLE dbo.truck_completions (
  id varchar(36) NOT NULL PRIMARY KEY,
  truck_id varchar(36) NOT NULL REFERENCES dbo.trucks(id),
  team_number int NOT NULL CHECK (team_number > 0),
  operation_id varchar(36) NOT NULL UNIQUE,
  completed_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UX_truck_completions_truck_team UNIQUE (truck_id, team_number)
);
IF OBJECT_ID('dbo.sync_probes', 'U') IS NULL CREATE TABLE dbo.sync_probes (
  id varchar(36) NOT NULL PRIMARY KEY,
  message nvarchar(200) NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [$(AppUser)];
IF IS_ROLEMEMBER('cdc_reader', '$(AppUser)') = 0 ALTER ROLE cdc_reader ADD MEMBER [$(AppUser)];
GRANT SELECT ON SCHEMA::cdc TO [$(AppUser)];
GO

DECLARE @table sysname;
DECLARE cdc_tables CURSOR LOCAL FAST_FORWARD FOR
SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo') AND name IN (
  '_powersync_checkpoints','products','lots','daily_plans','trucks','allocations','team_assignments',
  'lot_flags','alternative_claims','pickups','shortage_reports','exceptions','exception_participants',
  'corrections','pickup_effects','inventory_adjustments','processed_operations','truck_completions','sync_probes'
);
OPEN cdc_tables;
FETCH NEXT FROM cdc_tables INTO @table;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cdc.change_tables WHERE source_object_id = OBJECT_ID(N'dbo.' + @table))
    EXEC sys.sp_cdc_enable_table @source_schema=N'dbo', @source_name=@table, @role_name=N'cdc_reader', @supports_net_changes=0;
  FETCH NEXT FROM cdc_tables INTO @table;
END
CLOSE cdc_tables;
DEALLOCATE cdc_tables;
GO

DECLARE @tries int = 15;
WHILE @tries > 0 AND NOT EXISTS (SELECT 1 FROM msdb.dbo.cdc_jobs WHERE job_type = N'capture')
BEGIN WAITFOR DELAY '00:00:01'; SET @tries -= 1; END;
IF EXISTS (SELECT 1 FROM msdb.dbo.cdc_jobs WHERE job_type = N'capture')
  EXEC sys.sp_cdc_change_job @job_type=N'capture', @pollinginterval=1;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.sync_probes)
  INSERT dbo.sync_probes (id, message) VALUES ('00000000-0000-0000-0000-000000000001', N'SQL Server → PowerSync → browser SQLite');
GO
