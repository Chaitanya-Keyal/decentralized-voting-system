import { inject } from "vitest";

// Before any module reads the environment, point it at this run's database.
process.env.DATABASE_URL = inject("databaseUrl");
