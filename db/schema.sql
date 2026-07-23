-- ===== ตารางคน (ผู้สั่งอาหาร) =====
CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== ตารางรายการอาหาร =====
CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  name_th VARCHAR(100) NOT NULL UNIQUE,
  emoji VARCHAR(10),
  image_url TEXT,
  price INT NOT NULL DEFAULT 50,
  calories INT NOT NULL DEFAULT 450,
  has_protein BOOLEAN NOT NULL DEFAULT false,
  has_style BOOLEAN NOT NULL DEFAULT false,
  category VARCHAR(40),
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);
-- เพิ่มคอลัมน์ใหม่สำหรับ DB ที่สร้างจาก schema เก่า
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price INT DEFAULT 50;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS calories INT DEFAULT 450;

-- ===== ตารางออเดอร์ =====
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  person_id INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  menu_item_id INT NOT NULL REFERENCES menu_items(id),
  protein VARCHAR(20),
  style VARCHAR(20),
  add_egg VARCHAR(20),
  spice_level VARCHAR(20),
  is_special BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  price INT NOT NULL DEFAULT 50,
  calories INT NOT NULL DEFAULT 450,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS price INT DEFAULT 50;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS calories INT DEFAULT 450;

CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_person_date ON orders(person_id, order_date);

-- ===== ตารางตั้งค่า (เก็บ QR code, ชื่อผู้รับเงิน ฯลฯ) =====
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== ตารางเมนูโปรด (per person) =====
CREATE TABLE IF NOT EXISTS favorites (
  person_id    INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  menu_item_id INT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (person_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_person ON favorites(person_id);
