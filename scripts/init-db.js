import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const seed   = readFileSync(join(__dirname, '..', 'db', 'seed.sql'),   'utf8');

try {
  await client.connect();
  console.log('✅ Connected to PostgreSQL');

  await client.query(schema);
  console.log('✅ Schema created');

  await client.query(seed);
  console.log('✅ Seed data inserted');

  const { rows: menuCount }   = await client.query('SELECT COUNT(*)::int AS n FROM menu_items');
  const { rows: peopleCount } = await client.query('SELECT COUNT(*)::int AS n FROM people');
  console.log(`📋 menu_items: ${menuCount[0].n}, people: ${peopleCount[0].n}`);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
