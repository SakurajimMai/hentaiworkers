import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

// Resolving '../anime.db' relative to where the script is run (package root usually).
const client = createClient({ url: 'file:../anime.db' });
export const db = drizzle(client);
