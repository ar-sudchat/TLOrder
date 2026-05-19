// ===== State =====
const state = {
  menu: [],
  people: [],
  myPersonId: null,
  currentDate: null,
  ordersByDate: {},
  adminRequired: false,
  favorites: new Set(),   // menu_item_id ที่ติดดาว
  popular: [],            // [{id, ..., order_count}]
  searchQuery: '',
  modal: {
    menuItem: null, protein: '', style: '', add_egg: '',
    spice: '', special: false, notes: '',
  },
};

// ===== DOM helpers =====
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== HTML escape (กัน XSS ทุกที่ที่ใช้ innerHTML กับข้อมูลผู้ใช้) =====
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}
function safeUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u, location.href);
    if (['http:', 'https:', 'data:'].includes(url.protocol)) return u;
  } catch {}
  return '';
}

// ===== Date helpers =====
function todayBKK() {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bkk.toISOString().slice(0, 10);
}
function thaiDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${d} ${months[m-1]} ${y+543}`;
}
function shortDayLabel(iso) {
  const t = todayBKK();
  if (iso === t) return 'วันนี้';
  const today = new Date(t + 'T00:00:00');
  const d = new Date(iso + 'T00:00:00');
  const diff = Math.round((today - d) / 86400000);
  if (diff === 1) return 'เมื่อวาน';
  const [, m, dd] = iso.split('-').map(Number);
  return `${dd}/${m}`;
}
function bkkTime(iso) {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  });
}

// ===== Toast =====
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => t.classList.add('hidden'), 1800);
}

// ===== API =====
async function api(path, opts = {}) {
  // headers ต้องอยู่หลัง ...opts ไม่งั้นจะถูก overwrite
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || res.statusText);
  }
  return res.json();
}

// ===== Order text (plain string สำหรับ clipboard / HTML จะ escape ตอนแสดงผล) =====
function orderText(o) {
  const parts = [o.menu_name];
  if (o.protein)     parts.push(o.protein);
  if (o.style)       parts.push(`(${o.style})`);
  if (o.is_special)  parts.push('พิเศษ');
  if (o.add_egg)     parts.push(`+ ${o.add_egg}`);
  if (o.spice_level) parts.push(`(${o.spice_level})`);
  let line = parts.join(' ');
  if (o.notes) line += ` — ${o.notes}`;
  return line;
}

// ===== Tabs =====
$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    const tab = btn.dataset.tab;
    $('#view-order').classList.toggle('hidden', tab !== 'order');
    $('#view-summary').classList.toggle('hidden', tab !== 'summary');
    $('#view-pay').classList.toggle('hidden', tab !== 'pay');
    if (tab === 'summary') openSummary(state.currentDate || todayBKK());
    if (tab === 'pay')     loadSettings();
  });
});

// ===== People =====
async function loadPeople() {
  state.people = await api('/api/people');
  const sel = $('#personSelect');
  sel.innerHTML = '<option value="">— เลือกชื่อ —</option>' +
    state.people.map((p) =>
      `<option value="${p.id}">${esc(p.display_order)}. ${esc(p.name)}</option>`
    ).join('');

  const saved = localStorage.getItem('myPersonId');
  if (saved && state.people.find((p) => String(p.id) === saved)) {
    sel.value = saved;
    state.myPersonId = Number(saved);
  }
  renderMyOrder();
}

$('#personSelect').addEventListener('change', async (e) => {
  state.myPersonId = e.target.value ? Number(e.target.value) : null;
  if (state.myPersonId) localStorage.setItem('myPersonId', state.myPersonId);
  else localStorage.removeItem('myPersonId');
  await loadFavorites();
  renderMyOrder();
  renderMenu();
});

$('#addPersonBtn').addEventListener('click', async () => {
  const name = prompt('ใส่ชื่อใหม่:');
  if (!name) return;
  try {
    const p = await api('/api/people', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    await loadPeople();
    $('#personSelect').value = p.id;
    state.myPersonId = p.id;
    localStorage.setItem('myPersonId', p.id);
    await loadFavorites();
    renderMyOrder();
    renderMenu();
    showToast(`เพิ่ม "${p.name}" แล้ว`);
  } catch (err) {
    alert(err.message);
  }
});

// ===== Menu rendering (search + sections + stars) =====
function menuCardHtml(m, opts = {}) {
  const url = safeUrl(m.image_url);
  const isFav = state.favorites.has(m.id);
  const showStar = state.myPersonId != null;
  return `
    <div class="menu-card" data-id="${m.id}">
      <div class="photo">
        ${opts.badge ? `<div class="popular-badge">${esc(opts.badge)}</div>` : ''}
        ${showStar
          ? `<button class="star-btn ${isFav ? 'filled' : ''}" data-id="${m.id}" title="ติดดาว">${isFav ? '⭐' : '☆'}</button>`
          : ''}
        ${url
          ? `<img src="${esc(url)}" alt="${esc(m.name_th)}" loading="lazy"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
             <div class="emoji-fallback" style="display:none">${esc(m.emoji || '🍽️')}</div>`
          : `<div class="emoji-fallback">${esc(m.emoji || '🍽️')}</div>`
        }
      </div>
      <div class="body">
        <div class="name">${esc(m.name_th)}</div>
        ${m.has_protein ? '<div class="options-hint">หมู / ไก่ / ทะเล</div>' : ''}
        ${m.has_style ? '<div class="options-hint">น้ำ / แห้ง</div>' : ''}
      </div>
    </div>`;
}

function wireMenuGrid(grid) {
  grid.querySelectorAll('.menu-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.star-btn')) return;
      openOrderModal(Number(card.dataset.id));
    });
  });
  grid.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFavorite(Number(btn.dataset.id));
    });
  });
}

async function loadMenu() {
  state.menu = await api('/api/menu');
  renderMenu();
}

async function loadPopular() {
  try {
    state.popular = await api('/api/menu/popular?limit=6');
  } catch {
    state.popular = [];
  }
  renderMenu();
}

async function loadFavorites() {
  if (!state.myPersonId) {
    state.favorites = new Set();
    return;
  }
  try {
    const ids = await api(`/api/favorites?person_id=${state.myPersonId}`);
    state.favorites = new Set(ids);
  } catch {
    state.favorites = new Set();
  }
}

async function toggleFavorite(menuItemId) {
  if (!state.myPersonId) { alert('กรุณาเลือกชื่อก่อน'); return; }
  try {
    const r = await api('/api/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ person_id: state.myPersonId, menu_item_id: menuItemId }),
    });
    if (r.favorited) state.favorites.add(menuItemId);
    else             state.favorites.delete(menuItemId);
    renderMenu();
  } catch (err) {
    alert(err.message);
  }
}

function normalize(s) { return (s || '').toLowerCase().trim(); }

function renderMenu() {
  const q = normalize(state.searchQuery);
  const allGrid     = $('#menuGrid');
  const favGrid     = $('#favoritesGrid');
  const popGrid     = $('#popularGrid');
  const sectFav     = $('#sectionFavorites');
  const sectPop     = $('#sectionPopular');
  const allTitle    = $('#allSectionTitle');
  const emptyHint   = $('#emptySearch');

  if (q) {
    // โหมดค้นหา: ซ่อน section, แสดง flat grid
    sectFav.classList.add('hidden');
    sectPop.classList.add('hidden');
    const matched = state.menu.filter((m) => normalize(m.name_th).includes(q));
    allTitle.textContent = `ผลการค้นหา (${matched.length})`;
    allGrid.innerHTML = matched.map((m) => menuCardHtml(m)).join('');
    emptyHint.classList.toggle('hidden', matched.length > 0);
    wireMenuGrid(allGrid);
    return;
  }

  // โหมดปกติ: 3 sections
  emptyHint.classList.add('hidden');
  allTitle.textContent = 'เมนูทั้งหมด';

  // 1) Favorites — แสดงเฉพาะตอนเลือกชื่อแล้วและมี favorites
  const favs = state.menu.filter((m) => state.favorites.has(m.id));
  if (state.myPersonId && favs.length > 0) {
    favGrid.innerHTML = favs.map((m) => menuCardHtml(m)).join('');
    wireMenuGrid(favGrid);
    sectFav.classList.remove('hidden');
  } else {
    sectFav.classList.add('hidden');
  }

  // 2) Popular — top 6 ใน 30 วันล่าสุด
  if (state.popular.length > 0) {
    popGrid.innerHTML = state.popular.map((m, i) =>
      menuCardHtml(m, { badge: i === 0 ? '🏆 อันดับ 1' : `#${i + 1}` })
    ).join('');
    wireMenuGrid(popGrid);
    sectPop.classList.remove('hidden');
  } else {
    sectPop.classList.add('hidden');
  }

  // 3) All
  allGrid.innerHTML = state.menu.map((m) => menuCardHtml(m)).join('');
  wireMenuGrid(allGrid);
}

// ===== Search input =====
$('#searchInput').addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  $('#searchClearBtn').classList.toggle('hidden', !state.searchQuery);
  renderMenu();
});
$('#searchClearBtn').addEventListener('click', () => {
  $('#searchInput').value = '';
  state.searchQuery = '';
  $('#searchClearBtn').classList.add('hidden');
  renderMenu();
  $('#searchInput').focus();
});

// ===== Today's orders =====
async function loadTodayOrders() {
  const today = todayBKK();
  const data = await api(`/api/orders?date=${today}`);
  state.ordersByDate[today] = data.orders;
  renderMyOrder();
}

function renderMyOrder() {
  const box = $('#myOrderBox');
  const ul = $('#myOrderList');
  if (!state.myPersonId) { box.classList.add('hidden'); return; }
  const today = todayBKK();
  const orders = state.ordersByDate[today] || [];
  const mine = orders.filter((o) => o.person_id === state.myPersonId);
  if (mine.length === 0) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  ul.innerHTML = mine.map((o) => `
    <li>
      <span>${esc(orderText(o))}</span>
      <button class="del-btn" data-id="${o.id}" title="ลบ">🗑️</button>
    </li>
  `).join('');
  ul.querySelectorAll('.del-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('ลบรายการนี้?')) return;
      try {
        await api(`/api/orders/${b.dataset.id}`, { method: 'DELETE' });
        await loadTodayOrders();
        showToast('ลบแล้ว');
      } catch (err) { alert(err.message); }
    });
  });
}

// ===== Order modal =====
function setChipActive(rowSel, value) {
  $$(`${rowSel} .chip`).forEach((c) => c.classList.toggle('active', c.dataset.val === value));
}
function wireChipRow(rowSel, key) {
  $$(`${rowSel} .chip`).forEach((c) => {
    c.addEventListener('click', () => {
      state.modal[key] = c.dataset.val;
      setChipActive(rowSel, c.dataset.val);
    });
  });
}
wireChipRow('#styleChips', 'style');
wireChipRow('#eggChips',   'add_egg');
wireChipRow('#spiceChips', 'spice');

function openOrderModal(menuItemId) {
  if (!state.myPersonId) { alert('กรุณาเลือกชื่อก่อนสั่ง'); return; }
  const item = state.menu.find((m) => m.id === menuItemId);
  if (!item) return;
  state.modal = {
    menuItem: item, protein: '', style: '', add_egg: '',
    spice: '', special: false, notes: '',
  };
  $('#modalTitle').textContent = `${item.emoji || '🍽️'} ${item.name_th}`;

  const proteinField = $('#proteinField');
  if (item.has_protein) {
    proteinField.classList.remove('hidden');
    const chips = ['หมูชิ้น', 'หมูสับ', 'ไก่', 'ทะเล'];
    $('#proteinChips').innerHTML = chips.map((c) => `<button class="chip" data-val="${esc(c)}">${esc(c)}</button>`).join('');
    $$('#proteinChips .chip').forEach((c) => {
      c.addEventListener('click', () => {
        state.modal.protein = c.dataset.val;
        setChipActive('#proteinChips', c.dataset.val);
      });
    });
  } else {
    proteinField.classList.add('hidden');
  }

  $('#styleField').classList.toggle('hidden', !item.has_style);
  setChipActive('#styleChips', '');
  setChipActive('#eggChips',   '');
  setChipActive('#spiceChips', '');
  $('#specialChk').checked = false;
  $('#notesInput').value = '';

  $('#orderModal').classList.remove('hidden');
}

$('#closeModal').addEventListener('click', () => $('#orderModal').classList.add('hidden'));
$('#orderModal').addEventListener('click', (e) => {
  if (e.target === $('#orderModal')) $('#orderModal').classList.add('hidden');
});

$('#confirmOrderBtn').addEventListener('click', async () => {
  const m = state.modal;
  if (m.menuItem.has_protein && !m.protein) { alert('กรุณาเลือกเนื้อสัตว์'); return; }
  if (m.menuItem.has_style && !m.style)     { alert('กรุณาเลือก น้ำ / แห้ง'); return; }
  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        person_id: state.myPersonId,
        menu_item_id: m.menuItem.id,
        protein: m.protein,
        style: m.style,
        add_egg: m.add_egg,
        spice_level: m.spice,
        is_special: $('#specialChk').checked,
        notes: $('#notesInput').value,
        order_date: todayBKK(),
      }),
    });
    $('#orderModal').classList.add('hidden');
    await loadTodayOrders();
    loadPopular();   // popularity อาจเปลี่ยน (ไม่ต้องรอ)
    showToast('สั่งเรียบร้อย 🍽️');
  } catch (err) {
    alert('ผิดพลาด: ' + err.message);
  }
});

// ===== Summary + History =====
async function openSummary(date) {
  state.currentDate = date;
  $('#historyDate').value = date;
  await renderHistoryChips();
  await renderSummary(date);
}

async function renderHistoryChips() {
  const dates = await api('/api/orders/dates');
  const container = $('#historyChips');
  const recent = dates.slice(0, 7);
  const t = todayBKK();
  if (!recent.find((d) => d.date === t)) recent.unshift({ date: t, count: 0 });

  container.innerHTML = recent.map((d) => `
    <button class="hist-chip ${d.date === state.currentDate ? 'active' : ''}" data-date="${esc(d.date)}">
      ${esc(shortDayLabel(d.date))}${d.count ? `<span class="count">(${d.count})</span>` : ''}
    </button>
  `).join('');
  container.querySelectorAll('.hist-chip').forEach((c) => {
    c.addEventListener('click', () => openSummary(c.dataset.date));
  });
}

async function renderSummary(date) {
  const data = await api(`/api/orders?date=${date}`);
  state.ordersByDate[date] = data.orders;

  const isToday = date === todayBKK();
  $('#summaryTitle').textContent = `สรุปออเดอร์${isToday ? 'วันนี้' : ''}`;

  // เวลาที่แสดง: ถ้าเป็นวันเก่า ใช้เวลาออเดอร์แรกของวัน, ถ้าวันนี้ใช้เวลาปัจจุบัน
  let timeLabel = '';
  if (isToday) {
    timeLabel = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  } else if (data.orders.length > 0) {
    timeLabel = bkkTime(data.orders[0].created_at);
  }

  $('#summaryMeta').innerHTML = `
    <strong>วันที่:</strong> ${esc(thaiDateLabel(date))}
    &nbsp;·&nbsp;
    <strong>จำนวนรายการ:</strong> ${data.orders.length}
    ${timeLabel ? `&nbsp;·&nbsp;<strong>เวลา:</strong> ${esc(timeLabel)}` : ''}
  `;

  const byPerson = new Map();
  for (const o of data.orders) {
    if (!byPerson.has(o.person_id)) byPerson.set(o.person_id, []);
    byPerson.get(o.person_id).push(o);
  }

  // วันเก่า: เฉพาะคนที่สั่ง
  // วันนี้:  คนที่สั่งแล้วขึ้นก่อน (เรียง display_order) ตามด้วยคนที่ยังไม่สั่ง
  const ordered  = state.people.filter((p) => byPerson.has(p.id));
  const pending  = state.people.filter((p) => !byPerson.has(p.id));
  const peopleList = isToday ? [...ordered, ...pending] : ordered;

  const tbody = $('#summaryTable tbody');
  if (peopleList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row" style="text-align:center;padding:20px">ไม่มีข้อมูลออเดอร์วันนี้</td></tr>`;
    return;
  }

  tbody.innerHTML = peopleList.map((p, idx) => {
    const seq = idx + 1;  // เลขลำดับเรียงใหม่ตามแถวที่แสดง
    const orders = byPerson.get(p.id) || [];
    if (orders.length === 0) {
      return `<tr>
        <td class="col-num">${seq}</td>
        <td class="col-name">${esc(p.name)}</td>
        <td class="empty-row">—</td>
        <td class="col-action"></td>
      </tr>`;
    }
    return orders.map((o, i) => `
      <tr>
        <td class="col-num">${i === 0 ? seq : ''}</td>
        <td class="col-name">${i === 0 ? esc(p.name) : ''}</td>
        <td>${esc(orderText(o))}</td>
        <td class="col-action">
          <button class="del-btn" data-id="${o.id}" title="ลบ">🗑️</button>
        </td>
      </tr>
    `).join('');
  }).join('');

  tbody.querySelectorAll('.del-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('ลบรายการนี้?')) return;
      try {
        await api(`/api/orders/${b.dataset.id}`, { method: 'DELETE' });
        await openSummary(date);
        await renderHistoryChips();
      } catch (err) { alert(err.message); }
    });
  });
}

$('#historyDate').addEventListener('change', (e) => {
  if (e.target.value) openSummary(e.target.value);
});
$('#todayBtn').addEventListener('click', () => openSummary(todayBKK()));

$('#copySummaryBtn').addEventListener('click', () => {
  const date = state.currentDate || todayBKK();
  const orders = state.ordersByDate[date] || [];
  const isToday = date === todayBKK();
  const timeLabel = isToday
    ? new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    : (orders[0] ? bkkTime(orders[0].created_at) : '—');

  const byPerson = new Map();
  for (const o of orders) {
    if (!byPerson.has(o.person_id)) byPerson.set(o.person_id, []);
    byPerson.get(o.person_id).push(o);
  }
  // ลำดับเดียวกับที่แสดงในตาราง: คนสั่งแล้วก่อน ตามด้วยคนที่ยังไม่สั่ง (เฉพาะวันนี้)
  const ordered = state.people.filter((p) => byPerson.has(p.id));
  const pending = state.people.filter((p) => !byPerson.has(p.id));
  const peopleList = isToday ? [...ordered, ...pending] : ordered;

  const lines = [
    `${thaiDateLabel(date)}\t\tสั่งตอน ${timeLabel}`,
    `ลำดับ\tชื่อ\tรายการอาหาร`,
  ];
  peopleList.forEach((p, idx) => {
    const seq = idx + 1;
    const list = byPerson.get(p.id) || [];
    if (list.length === 0) {
      lines.push(`${seq}\t${p.name}\t`);
    } else {
      list.forEach((o, i) => {
        lines.push(`${i === 0 ? seq : ''}\t${i === 0 ? p.name : ''}\t${orderText(o)}`);
      });
    }
  });
  navigator.clipboard.writeText(lines.join('\n'));
  showToast('คัดลอกแล้ว ส่งให้แม่ค้าได้เลย');
});

$('#printSummaryBtn').addEventListener('click', () => window.print());

// ===== Settings (admin password aware) =====
function getAdminHeader() {
  if (!state.adminRequired) return {};
  let pw = sessionStorage.getItem('adminPw');
  if (!pw) {
    pw = prompt('รหัสผ่านแอดมิน:') || '';
    if (pw) sessionStorage.setItem('adminPw', pw);
  }
  return pw ? { 'X-Admin-Password': pw } : {};
}

async function loadSettings() {
  const cfg = await api('/api/settings');
  state.adminRequired = !!cfg.admin_required;
  $('#qrName').textContent  = cfg.payee_name || '—';
  $('#qrPhone').textContent = cfg.payee_phone || '—';
  $('#payeeNameInput').value  = cfg.payee_name || '';
  $('#payeePhoneInput').value = cfg.payee_phone || '';

  const img = $('#qrImage');
  const fallback = $('#qrFallback');
  if (cfg.qr_image && safeUrl(cfg.qr_image)) {
    img.src = cfg.qr_image;
    img.style.display = 'block';
    fallback.style.display = 'none';
  } else {
    img.style.display = 'none';
    fallback.style.display = 'block';
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

$('#saveSettingsBtn').addEventListener('click', async () => {
  const payload = {
    payee_name:  $('#payeeNameInput').value.trim(),
    payee_phone: $('#payeePhoneInput').value.trim(),
  };
  const file = $('#qrFileInput').files[0];
  if (file) {
    if (file.size > 4 * 1024 * 1024) {
      alert('ไฟล์ใหญ่เกิน 4MB กรุณาย่อก่อน');
      return;
    }
    if (!/^image\//.test(file.type)) {
      alert('กรุณาเลือกไฟล์รูปภาพ');
      return;
    }
    payload.qr_image = await fileToDataUrl(file);
  }
  try {
    await api('/api/settings', {
      method: 'PUT',
      headers: getAdminHeader(),
      body: JSON.stringify(payload),
    });
    $('#qrFileInput').value = '';
    await loadSettings();
    showToast('บันทึกแล้ว');
  } catch (err) {
    if (/รหัสผ่าน/.test(err.message)) {
      sessionStorage.removeItem('adminPw');  // ล้าง pw ที่ผิด
    }
    alert('ผิดพลาด: ' + err.message);
  }
});

// ===== Boot =====
$('#datePill').textContent = thaiDateLabel(todayBKK());
(async () => {
  try {
    await loadPeople();                                   // ตั้ง myPersonId จาก localStorage
    await Promise.all([loadMenu(), loadPopular(), loadFavorites()]);
    renderMenu();                                          // รวมข้อมูลทั้งหมดที่โหลดมา
    await loadTodayOrders();
  } catch (err) {
    alert('โหลดข้อมูลล้มเหลว: ' + err.message);
  }
})();
