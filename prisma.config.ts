/// <reference types="node" />
import "dotenv/config";
import { defineConfig, PrismaConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL || "",
  },
}) satisfies PrismaConfig;
