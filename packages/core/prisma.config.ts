import path from 'node:path';
import { defineConfig } from 'prisma/config';

// DATABASE_URL must be set in the environment.
// Defaults to a local dev.db if not provided (development convenience only).
// Tests must set DATABASE_URL to a tmp-file path (I-13).
const databaseUrl =
  process.env['DATABASE_URL'] ??
  `file:${path.join(__dirname, 'prisma', 'dev.db')}`;

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
});
