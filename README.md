# 🍱 เว็บสั่งข้าวเที่ยง

เว็บแอปสำหรับให้ทีมสั่งข้าวเที่ยงร่วมกัน พร้อมหน้าสรุปออเดอร์ส่งให้แม่ค้า และ QR PromptPay เก็บใน DB

## ฟีเจอร์
- เลือกชื่อตัวเอง + สั่งเมนูจากเมนูร้าน (รูปจริงจาก Wikimedia Commons)
- ตัวเลือก: เนื้อสัตว์, ไข่ดาว/ไข่เจียว, ระดับความเผ็ด, พิเศษ, หมายเหตุ
- หน้าสรุปออเดอร์ + คัดลอกข้อความส่งให้แม่ค้าใน LINE
- **ดูประวัติย้อนหลัง** — ปุ่ม 7 วันล่าสุด + date picker
- QR PromptPay เก็บใน DB อัปโหลดผ่านหน้าเว็บได้ (ป้องกันด้วยรหัสแอดมิน)

## โครงสร้าง
```
order/
├── server.js           # Express backend
├── package.json
├── .env                # DATABASE_URL, ADMIN_PASSWORD ฯลฯ (อย่า commit)
├── db/
│   ├── schema.sql      # โครงสร้างตาราง (idempotent)
│   └── seed.sql        # เมนู + รายชื่อทีม + image URLs ตั้งต้น
├── scripts/
│   └── init-db.js
└── public/
    ├── index.html, styles.css, app.js
    └── images/         # (รูปอาหารโหลดจาก Wikimedia ตรงๆ ไม่ต้องเซฟลงนี่)
```

## รันบนเครื่อง (Local)

```bash
cp .env.example .env       # แล้วกรอก DATABASE_URL กับ ADMIN_PASSWORD
npm install
npm run init-db            # รันครั้งแรก (idempotent ปลอดภัยจะรันซ้ำก็ได้)
npm start                  # http://localhost:3000
```

---

## 🚀 Deploy

### ขั้นเตรียม
1. ตั้งค่า env vars บน platform:
   - `DATABASE_URL` — connection string ของ Neon/Supabase
   - `ADMIN_PASSWORD` — **บังคับตั้ง** (ใส่ค่าเดายาก)
   - `SHOP_NAME` (optional)
2. รัน `npm run init-db` หนึ่งครั้งจากเครื่อง local โดยชี้ที่ `DATABASE_URL` ตัวเดียวกับ production

### Platform ที่แนะนำ
- **Render**: New Web Service → connect repo → Build `npm install`, Start `npm start`
- **Railway**: `railway up` → ตั้ง env vars ใน dashboard
- **Fly.io**: `fly launch` → Node.js → set secrets

ทุก platform จะตั้ง `PORT` ให้อัตโนมัติ ไม่ต้องตั้งเอง

### Health check
- `GET /health` — คืน `{"ok":true}` ถ้าเชื่อม DB ได้ (200) หรือ 503 ถ้าเชื่อมไม่ได้
- ใช้ตั้งใน platform เพื่อ auto-restart ถ้า DB ขาดการเชื่อมต่อ

---

## ✅ Production checklist
- [ ] ตั้ง `ADMIN_PASSWORD` แล้ว (ถ้าไม่ตั้ง server จะ log warning เตือนตอนสตาร์ท)
- [ ] รัน `npm run init-db` แล้วเช็คว่า `menu_items` มี 18 แถว
- [ ] อัปโหลด QR จริงในหน้า "💳 ชำระเงิน" (ต้องใส่รหัสแอดมิน)
- [ ] platform กำหนด HTTPS อัตโนมัติ (Render/Railway/Fly ทำให้แล้ว)
- [ ] `/health` คืน 200

---

## 🛡️ Security notes

| เรื่อง | สถานะ |
|---|---|
| SQL injection | ใช้ parameterized queries ทุกที่ |
| XSS | escape ค่าทุกที่ที่ใช้ `innerHTML` |
| QR/ผู้รับเงิน | แก้ได้เฉพาะคนที่รู้ `ADMIN_PASSWORD` (ส่งผ่าน `X-Admin-Password` header) |
| ลบ/สั่งออเดอร์ | ไม่มี auth — ออกแบบให้เป็น **internal team app**; ใครเข้า URL ได้ก็สั่ง/ลบได้ |
| Rate limiting | ยังไม่มี — ถ้าจะเปิดเป็นสาธารณะ ควรเพิ่ม `express-rate-limit` หรือใช้ Cloudflare |
| HTTPS | ขึ้นกับ platform (เปิด HTTPS ก่อน deploy เสมอ) |

ถ้าจะให้เข้าได้แค่ภายในออฟฟิศ พิจารณา:
- ใช้ Cloud Run + IAM
- ใส่ Cloudflare Access / Tailscale หน้าเว็บ
- เปิด VPN

---

## API
| Method | Path | Description |
|---|---|---|
| GET  | `/health` | health check |
| GET  | `/api/menu` | รายการเมนู (active เท่านั้น) |
| GET  | `/api/people` | รายชื่อทีม |
| POST | `/api/people` | เพิ่มชื่อใหม่ |
| GET  | `/api/orders?date=YYYY-MM-DD` | ออเดอร์วันนั้น (default = วันนี้ BKK) |
| GET  | `/api/orders/dates` | รายการวันที่มีออเดอร์ (90 วันล่าสุด) |
| POST | `/api/orders` | สร้างออเดอร์ |
| DELETE | `/api/orders/:id` | ลบออเดอร์ |
| GET  | `/api/settings` | ข้อมูลผู้รับเงิน + QR (data URL) |
| PUT  | `/api/settings` | แก้ไข (ต้องมี `X-Admin-Password` ถ้าตั้ง `ADMIN_PASSWORD`) |
