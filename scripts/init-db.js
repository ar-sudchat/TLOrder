import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// SSL จำเป็นเฉพาะ Neon/Supabase (มี sslmode=require ใน URL) — ไม่ใช้กับ postgres internal ของ Coolify
export function needsSsl(connStr) {
  return /sslmode=(require|verify-ca|verify-full)/i.test(connStr || '');
}

export async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL ไม่ได้ตั้งค่า');

  const client = new Client({
    connectionString,
    ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : false,
  });

  const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const seed   = readFileSync(join(__dirname, '..', 'db', 'seed.sql'),   'utf8');

  try {
    await client.connect();
    await client.query(schema);
    await client.query(seed);
    const { rows: m } = await client.query('SELECT COUNT(*)::int AS n FROM menu_items');
    const { rows: p } = await client.query('SELECT COUNT(*)::int AS n FROM people');
    console.log(`✅ DB ready (menu_items=${m[0].n}, people=${p[0].n})`);
  } finally {
    await client.end();
  }
}

// อนุญาตให้รันแบบ CLI ตรงๆ ได้ด้วย — `npm run init-db`
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await initDb();
    process.exit(0);
  } catch (err) {
    console.error('❌ initDb failed:', err.message);
    process.exit(1);
  }
}
