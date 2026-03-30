import type { Config } from 'drizzle-kit';

const config: Config = {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/portfolio.db',
  },
};

export default config;
