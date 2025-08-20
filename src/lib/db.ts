import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

declare global { var pgPool: Pool | undefined; }

export const pool =
    global.pgPool ??
    new Pool({ connectionString, application_name: "courses-app" });

if (process.env.NODE_ENV !== "production") global.pgPool = pool;
