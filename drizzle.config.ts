import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/schema.ts',
  out: './drizzle/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
