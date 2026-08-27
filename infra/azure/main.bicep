@description('Globally unique logical SQL server name.')
param serverName string

@description('Database used only for this POC.')
param databaseName string = 'plant_route'

@description('SQL administrator login.')
param administratorLogin string

@secure()
@description('SQL administrator password. Supply through a secure parameter source.')
param administratorLoginPassword string

@description('The tester public IPv4 address. This is the only public firewall allowance.')
param testerIpAddress string

param location string = resourceGroup().location

resource sqlServer 'Microsoft.Sql/servers@2023-08-01' = {
  name: serverName
  location: location
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    version: '12.0'
  }
}

resource testerFirewallRule 'Microsoft.Sql/servers/firewallRules@2023-08-01' = {
  parent: sqlServer
  name: 'poc-tester-only'
  properties: {
    startIpAddress: testerIpAddress
    endIpAddress: testerIpAddress
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: sqlServer
  name: databaseName
  location: location
  sku: {
    name: 'S3'
    tier: 'Standard'
    capacity: 100
  }
  properties: {
    requestedBackupStorageRedundancy: 'Local'
  }
}

output serverFqdn string = sqlServer.properties.fullyQualifiedDomainName
output database string = database.name
