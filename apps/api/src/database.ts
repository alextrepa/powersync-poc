import sql from "mssql";

let poolPromise: Promise<sql.ConnectionPool> | undefined;

function config(): sql.config {
  return {
    server: process.env.SQL_SERVER ?? "127.0.0.1",
    database: process.env.SQL_DATABASE ?? "plant_route",
    user: process.env.SQL_USER ?? "plant_app",
    password: process.env.SQL_PASSWORD ?? "",
    port: Number(process.env.SQL_PORT ?? 1433),
    options: {
      encrypt: process.env.SQL_ENCRYPT === "true",
      trustServerCertificate:
        process.env.SQL_TRUST_SERVER_CERTIFICATE !== "false",
    },
    pool: { min: 0, max: 10, idleTimeoutMillis: 30_000 },
  };
}

export function getPool(): Promise<sql.ConnectionPool> {
  poolPromise ??= new sql.ConnectionPool(config()).connect();
  return poolPromise;
}

export async function withTransaction<T>(
  work: (transaction: sql.Transaction) => Promise<T>,
): Promise<T> {
  const transaction = new sql.Transaction(await getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export function request(
  parent: sql.ConnectionPool | sql.Transaction,
): sql.Request {
  if (parent instanceof sql.Transaction) return new sql.Request(parent);
  return new sql.Request(parent);
}

export { sql };
