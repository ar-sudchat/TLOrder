import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, needsSsl } from './scripts/init-db.js';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('Unexpected pg pool error:', err));

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

// ===== Security headers (พอใช้สำหรับ static + Wikimedia images) =====
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ===== Helpers =====
function getDate(req) {
  if (req.query.date) {
    const d = String(req.query.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return d;
  }
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bkk.toISOString().slice(0, 10);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ปกป้อง endpoint แก้ไข settings — ถ้าไม่ตั้ง ADMIN_PASSWORD จะปล่อยผ่าน (โหมด dev/intranet)
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const hdr = req.headers['x-admin-password'];
  if (hdr === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'รหัสผ่านแอดมินไม่ถูกต้อง' });
}

// ===== Health (สำหรับ platform health-check) =====
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// ===== Menu =====
app.get('/api/menu', async (req, res) => {
  // ?all=true เพื่อรวมเมนูที่ปิดไว้ (สำหรับ admin)
  const includeInactive = req.query.all === 'true';
  try {
    const { rows } = await pool.query(
      includeInactive
        ? 'SELECT * FROM menu_items ORDER BY is_active DESC, display_order'
        : 'SELECT * FROM menu_items WHERE is_active = true ORDER BY display_order'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Menu CRUD (admin only) =====
app.post('/api/menu', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const name_th   = (b.name_th   || '').trim().slice(0, 100);
  const emoji     = (b.emoji     || '').trim().slice(0, 10) || '🍽️';
  const image_url = (b.image_url || '').trim() || null;
  const category  = (b.category  || '').trim().slice(0, 40) || null;
  const has_protein = !!b.has_protein;
  const has_style   = !!b.has_style;

  if (!name_th) return res.status(400).json({ error: 'ชื่อเมนูจำเป็น' });
  if (image_url && !/^https?:\/\//i.test(image_url)) {
    return res.status(400).json({ error: 'image_url ต้องเป็น URL ขึ้นต้นด้วย http:// หรือ https://' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO menu_items (name_th, emoji, image_url, has_protein, has_style, category, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(display_order) FROM menu_items), 0) + 1, true)
       RETURNING *`,
      [name_th, emoji, image_url, has_protein, has_style, category]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'ชื่อเมนูนี้มีอยู่แล้ว' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/menu/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const b = req.body || {};

  const fields = [];
  const values = [];
  const set = (col, val) => { fields.push(`${col} = $${fields.length + 1}`); values.push(val); };

  if (typeof b.name_th    === 'string')  set('name_th',    b.name_th.trim().slice(0, 100));
  if (typeof b.emoji      === 'string')  set('emoji',      b.emoji.trim().slice(0, 10) || '🍽️');
  if (typeof b.image_url  === 'string')  {
    const u = b.image_url.trim();
    if (u && !/^https?:\/\//i.test(u)) return res.status(400).json({ error: 'image_url ต้องเป็น URL ขึ้นต้นด้วย http:// หรือ https://' });
    set('image_url', u || null);
  }
  if (typeof b.category    === 'string') set('category',    b.category.trim().slice(0, 40) || null);
  if (typeof b.has_protein === 'boolean') set('has_protein', b.has_protein);
  if (typeof b.has_style   === 'boolean') set('has_style',   b.has_style);
  if (typeof b.is_active   === 'boolean') set('is_active',   b.is_active);

  if (fields.length === 0) return res.status(400).json({ error: 'ไม่มีฟิลด์ที่อัปเดต' });
  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE menu_items SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'ชื่อเมนูนี้มีอยู่แล้ว' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/menu/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    // ถ้ามีออเดอร์อ้างถึงเมนูนี้ — soft delete (set is_active = false) แทน
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM orders WHERE menu_item_id = $1',
      [id]
    );
    if (rows[0].n > 0) {
      await pool.query('UPDATE menu_items SET is_active = false WHERE id = $1', [id]);
      return res.json({ ok: true, soft_deleted: true, order_count: rows[0].n });
    }
    const r = await pool.query('DELETE FROM menu_items WHERE id = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, soft_deleted: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Popular menu (top N ordered in last 30 days) =====
app.get('/api/menu/popular', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 20);
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.name_th, m.emoji, m.image_url, m.has_protein, m.has_style,
              m.category, m.display_order, m.is_active,
              COUNT(o.id)::int AS order_count
       FROM menu_items m
       JOIN orders o ON o.menu_item_id = m.id
       WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
         AND m.is_active = true
       GROUP BY m.id
       ORDER BY order_count DESC, m.display_order
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Favorites =====
app.get('/api/favorites', async (req, res) => {
  const person_id = Number(req.query.person_id);
  if (!Number.isFinite(person_id)) return res.status(400).json({ error: 'person_id required' });
  try {
    const { rows } = await pool.query(
      'SELECT menu_item_id FROM favorites WHERE person_id = $1',
      [person_id]
    );
    res.json(rows.map((r) => r.menu_item_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/favorites/toggle', async (req, res) => {
  const person_id    = Number(req.body?.person_id);
  const menu_item_id = Number(req.body?.menu_item_id);
  if (!Number.isFinite(person_id) || !Number.isFinite(menu_item_id)) {
    return res.status(400).json({ error: 'person_id และ menu_item_id จำเป็น' });
  }
  try {
    const del = await pool.query(
      'DELETE FROM favorites WHERE person_id=$1 AND menu_item_id=$2',
      [person_id, menu_item_id]
    );
    if (del.rowCount > 0) return res.json({ favorited: false });
    await pool.query(
      `INSERT INTO favorites (person_id, menu_item_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [person_id, menu_item_id]
    );
    res.json({ favorited: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== People =====
app.get('/api/people', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM people ORDER BY display_order, name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/people', async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  if (name.length > 30) return res.status(400).json({ error: 'ชื่อยาวเกินไป (ไม่เกิน 30 ตัว)' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO people (name, display_order)
       VALUES ($1, COALESCE((SELECT MAX(display_order) FROM people), 0) + 1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Orders =====
app.get('/api/orders', async (req, res) => {
  const date = getDate(req);
  if (!date) return res.status(400).json({ error: 'invalid date' });
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.order_date::text AS order_date, o.person_id, o.menu_item_id,
              o.protein, o.style, o.add_egg, o.spice_level,
              o.is_special, o.notes, o.created_at,
              p.name           AS person_name,
              p.display_order  AS person_order,
              m.name_th        AS menu_name,
              m.emoji          AS menu_emoji
       FROM orders o
       JOIN people p     ON p.id = o.person_id
       JOIN menu_items m ON m.id = o.menu_item_id
       WHERE o.order_date = $1
       ORDER BY p.display_order, o.created_at`,
      [date]
    );
    res.json({ date, orders: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/dates', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT order_date::text AS date, COUNT(*)::int AS count
       FROM orders GROUP BY order_date ORDER BY order_date DESC LIMIT 90`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  const b = req.body || {};
  const person_id    = Number(b.person_id);
  const menu_item_id = Number(b.menu_item_id);
  if (!Number.isFinite(person_id) || !Number.isFinite(menu_item_id)) {
    return res.status(400).json({ error: 'person_id และ menu_item_id จำเป็น' });
  }

  // จำกัดความยาวเพื่อกัน DoS / DB bloat
  const cap = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v);
  const order_date = b.order_date && /^\d{4}-\d{2}-\d{2}$/.test(b.order_date) ? b.order_date : null;
  const protein     = cap((b.protein     || '').trim(), 30) || null;
  const style       = cap((b.style       || '').trim(), 20) || null;
  const add_egg     = cap((b.add_egg     || '').trim(), 20) || null;
  const spice_level = cap((b.spice_level || '').trim(), 20) || null;
  const notes       = cap((b.notes       || '').trim(), 200) || null;
  const is_special  = !!b.is_special;

  try {
    const { rows } = await pool.query(
      `INSERT INTO orders
         (order_date, person_id, menu_item_id, protein, style,
          add_egg, spice_level, is_special, notes)
       VALUES (COALESCE($1::date, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, order_date::text AS order_date`,
      [order_date, person_id, menu_item_id, protein, style, add_egg, spice_level, is_special, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rowCount } = await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Settings (QR, ผู้รับเงิน) =====
app.get('/api/settings', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const obj = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      payee_name:        obj.payee_name  || '',
      payee_phone:       obj.payee_phone || '',
      qr_image:          obj.qr_image    || '',
      shop_name:         process.env.SHOP_NAME || 'ร้านข้าวเที่ยง',
      admin_required:    !!ADMIN_PASSWORD,  // เพื่อให้ frontend รู้ว่าต้องถามรหัสไหม
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const updates = {};
  if (typeof b.payee_name  === 'string') updates.payee_name  = b.payee_name.trim().slice(0, 100);
  if (typeof b.payee_phone === 'string') updates.payee_phone = b.payee_phone.trim().slice(0, 30);
  if (typeof b.qr_image    === 'string') {
    // อนุญาตเฉพาะ data: URL ของรูปภาพ หรือ empty string (ลบ QR)
    if (b.qr_image !== '' && !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(b.qr_image)) {
      return res.status(400).json({ error: 'qr_image ต้องเป็นรูป (data URL)' });
    }
    if (b.qr_image.length > 5_500_000) {
      return res.status(400).json({ error: 'รูป QR ใหญ่เกินไป' });
    }
    updates.qr_image = b.qr_image;
  }

  const entries = Object.entries(updates);
  if (entries.length === 0) return res.status(400).json({ error: 'ไม่มีฟิลด์ที่อัปเดต' });

  try {
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Static (ต้องอยู่หลัง /api/* เพื่อ priority) =====
// ไม่ cache HTML/CSS/JS โดยใช้ ETag-based revalidation อย่างเดียว เพื่อให้แก้แล้วเห็นทันที
app.use(express.static(join(__dirname, 'public'), { etag: true, lastModified: true }));

// ===== Boot + Graceful shutdown =====
const PORT = process.env.PORT || 3000;

// Auto-init DB ตอน boot — schema เป็น idempotent (CREATE TABLE IF NOT EXISTS)
// seed ก็ idempotent (ON CONFLICT DO UPDATE/NOTHING) ฉะนั้นรันซ้ำได้ปลอดภัย
// ถ้า init ล้มเหลว ยังคงเริ่ม HTTP server ต่อ เพื่อให้ /health คืน 503 (Coolify รู้)
try {
  await initDb();
} catch (err) {
  console.error('⚠️  initDb failed (server will still start):', err.message);
}

const server = app.listen(PORT, () => {
  console.log(`🍱 Lunch order app: http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) {
    console.warn('⚠️  ADMIN_PASSWORD ไม่ได้ตั้ง — ใครก็แก้ QR / ชื่อผู้รับเงินได้ (โหมด dev เท่านั้น)');
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} received, closing gracefully…`);
  server.close(() => console.log('HTTP closed'));
  try { await pool.end(); console.log('PG pool closed'); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
