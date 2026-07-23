-- ===== ข้อมูลตั้งต้น: รายการอาหารจากเมนูร้าน =====
INSERT INTO menu_items (name_th, emoji, image_url, price, calories, has_protein, has_style, category, display_order) VALUES
  ('กะเพรา',         '🌶️', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Siam_Garden_Phat_kaphrao_ac.jpg/500px-Siam_Garden_Phat_kaphrao_ac.jpg',                                                    50, 550, true,  false, 'จานหลัก', 1),
  ('ผัดพริกแกง',     '🌿', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Mu_phat_phrik_khing.jpg/500px-Mu_phat_phrik_khing.jpg',                                                                50, 520, true,  false, 'จานหลัก', 2),
  ('ข้าวผัด',        '🍚', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Khao_phat_nam_phrik_narok.jpg/500px-Khao_phat_nam_phrik_narok.jpg',                                                    50, 570, true,  false, 'จานหลัก', 3),
  ('ผัดพริกหยวก',    '🫑', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Thai_banana_chilli.jpg/500px-Thai_banana_chilli.jpg',                                                                  50, 480, true,  false, 'จานหลัก', 4),
  ('ทอดกระเทียม',   '🧄', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Mu_thot_krathiam.jpg/500px-Mu_thot_krathiam.jpg',                                                                       50, 590, true,  false, 'จานหลัก', 5),
  ('ผัดผงกะหรี่',    '🍛', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Pu_Phat_Phong_Kari.jpg/500px-Pu_Phat_Phong_Kari.jpg',                                                                  60, 610, true,  false, 'จานหลัก', 6),
  ('ผัดพริกเผา',     '🌶️', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Pla_muek_phat_phrik_phao.JPG/500px-Pla_muek_phat_phrik_phao.JPG',                                                      50, 530, true,  false, 'จานหลัก', 7),
  ('คะน้าหมูกรอบ',   '🥬', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Phat_khana_mu_krop.jpg/500px-Phat_khana_mu_krop.jpg',                                                                  60, 670, false, false, 'จานหลัก', 8),
  ('ผัดผักรวม',      '🥦', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/2008-06-14ThaiRestaurant03.jpg/500px-2008-06-14ThaiRestaurant03.jpg',                                                   50, 380, false, false, 'จานหลัก', 9),
  ('ผัดซีอิ๊ว',      '🍜', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Pad_See_Ew_-_Bangkok.jpg/500px-Pad_See_Ew_-_Bangkok.jpg',                                                              50, 630, true,  false, 'เส้น',    10),
  ('ราดหน้า',        '🍲', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Kuay-tiew_rad_na.jpg/500px-Kuay-tiew_rad_na.jpg',                                                                      50, 490, true,  false, 'เส้น',    11),
  ('มาม่าผัดขี้เมา', '🍜', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Drunken_noodles_%28pad_kee_mao%29.jpg/500px-Drunken_noodles_%28pad_kee_mao%29.jpg',                                     55, 580, true,  false, 'เส้น',    12),
  ('สุกี้',          '🥘', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Thai_Suki_of_MK_Restaurant.JPG/500px-Thai_Suki_of_MK_Restaurant.JPG',                                                  55, 420, true,  true,  'เส้น',    13),
  ('ข้าวไข่เจียว',   '🍳', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Khao_khai_chiao_songkhrueng.jpg/500px-Khao_khai_chiao_songkhrueng.jpg',                                                40, 560, false, false, 'ของง่าย', 14),
  ('ไข่ดาว',         '🍳', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Khai_dao.JPG/500px-Khai_dao.JPG',                                                                                     10, 90,  false, false, 'ของง่าย', 15),
  ('ไข่เจียว',       '🍳', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/2017_0418_Khai_chiao_khai_mot_daeng.jpg/500px-2017_0418_Khai_chiao_khai_mot_daeng.jpg',                                15, 120, false, false, 'ของง่าย', 16),
  ('ผัดผักบุ้ง',     '🌿', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Stir_fried_morning_glory_at_Kualao_Restaurant.jpg/500px-Stir_fried_morning_glory_at_Kualao_Restaurant.jpg',            45, 340, true,  false, 'จานหลัก', 17),
  ('พริกเกลือ',      '🧂', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Thai_dry_dip_for_fruit_%28sugar%2C_salt%2C_crushed_dried_red_chillies%29.jpg/500px-Thai_dry_dip_for_fruit_%28sugar%2C_salt%2C_crushed_dried_red_chillies%29.jpg', 55, 510, true, false, 'จานหลัก', 18)
ON CONFLICT (name_th) DO UPDATE SET
  image_url     = EXCLUDED.image_url,
  emoji         = EXCLUDED.emoji,
  price         = EXCLUDED.price,
  calories      = EXCLUDED.calories,
  has_protein   = EXCLUDED.has_protein,
  has_style     = EXCLUDED.has_style,
  category      = EXCLUDED.category,
  display_order = EXCLUDED.display_order;

-- ===== ข้อมูลตั้งต้น: รายชื่อทีมจากตัวอย่างวันที่ 18/5/2026 =====
INSERT INTO people (name, display_order) VALUES
  ('แพ็ค', 1), ('เจ', 2), ('บอน', 3), ('ฟลุ๊ค', 4), ('แอน', 5),
  ('ผุย', 6), ('นา', 7), ('นก', 8), ('เจ็ก', 9), ('แจ็ค', 10),
  ('มอส', 11), ('บีม', 12), ('บอส', 13), ('แมน', 14), ('โจ', 15)
ON CONFLICT (name) DO NOTHING;

-- ===== ค่าตั้งต้น settings (เผื่อยังไม่เคยมี) =====
INSERT INTO settings (key, value) VALUES
  ('payee_name',  'NATTAPOL DEDRUKTIP'),
  ('payee_phone', '094-xxx-4990'),
  ('qr_image',    NULL)
ON CONFLICT (key) DO NOTHING;
