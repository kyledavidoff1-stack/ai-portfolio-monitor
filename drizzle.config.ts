import type { Config } from 'drizzle-kit';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL ?? './data/portfolio.db';

// drizzle-kit connects directly rather than going through src/lib/db, so the
// data directory has to exist before push/migrate runs — otherwise a fresh
// clone fails at the first setup command.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const config: Config = {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: DB_PATH,
  },
};

export default config;
