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
  selectedCategory: 'all',
  theme: localStorage.getItem('user_theme') || 'light', // Default to Light theme
  currentExportText: '',
  modal: {
    menuItem: null, protein: '', style: '', add_egg: '',
    spice: '', special: false, notes: '',
  },
};

// ===== DOM helpers =====
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Theme Initialization =====
function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('user_theme', theme);
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
applyTheme(state.theme);

$('#themeToggleBtn')?.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// ===== HTML escape =====
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
  if (!iso) return '';
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

// ===== Toast Notification =====
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ===== CUSTOM APP DIALOG SYSTEM (Replaces Browser Alert, Confirm, Prompt) =====
function showCustomDialog(options) {
  return new Promise((resolve) => {
    const modal = $('#customDialogModal');
    const icon = $('#dialogIcon');
    const title = $('#dialogTitle');
    const msg = $('#dialogMessage');
    const inputWrapper = $('#dialogInputWrapper');
    const input = $('#dialogInput');
    const cancelBtn = $('#dialogCancelBtn');
    const confirmBtn = $('#dialogConfirmBtn');

    icon.textContent = options.icon || '💡';
    title.textContent = options.title || 'แจ้งเตือน';
    msg.textContent = options.message || '';

    if (options.type === 'prompt') {
      inputWrapper.classList.remove('hidden');
      input.value = options.defaultValue || '';
      input.placeholder = options.placeholder || '';
      setTimeout(() => input.focus(), 100);
    } else {
      inputWrapper.classList.add('hidden');
    }

    if (options.type === 'alert') {
      cancelBtn.classList.add('hidden');
    } else {
      cancelBtn.classList.remove('hidden');
    }

    confirmBtn.textContent = options.confirmText || 'ตกลง';
    cancelBtn.textContent = options.cancelText || 'ยกเลิก';

    modal.classList.remove('hidden');

    function cleanup() {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
    }

    function onConfirm() {
      cleanup();
      if (options.type === 'prompt') resolve(input.value);
      else resolve(true);
    }

    function onCancel() {
      cleanup();
      if (options.type === 'prompt') resolve(null);
      else resolve(false);
    }

    function onKey(e) {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    if (options.type === 'prompt') input.addEventListener('keydown', onKey);
  });
}

function customAlert(message, title = 'แจ้งเตือนระบบ', icon = '💡') {
  return showCustomDialog({ type: 'alert', message, title, icon });
}

function customConfirm(message, title = 'ยืนยันการทำรายการ', icon = '❓') {
  return showCustomDialog({ type: 'confirm', message, title, icon });
}

function customPrompt(message, defaultValue = '', placeholder = '', title = 'ระบุข้อมูล', icon = '✏️') {
  return showCustomDialog({ type: 'prompt', message, defaultValue, placeholder, title, icon });
}

// ===== API =====
async function api(path, opts = {}) {
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

// ===== Order text & Calc helpers =====
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

function calcOrderPrice(o, basePrice = 50) {
  if (o.price != null && o.price > 0) return Number(o.price);
  let p = Number(basePrice) || 50;
  if (o.add_egg) p += 10;
  if (o.is_special) p += 10;
  return p;
}

function calcOrderCalories(o, baseCal = 450) {
  if (o.calories != null && o.calories > 0) return Number(o.calories);
  let c = Number(baseCal) || 450;
  if (o.add_egg === 'ไข่ดาว') c += 90;
  if (o.add_egg === 'ไข่เจียว') c += 120;
  if (o.is_special) c += 100;
  return c;
}

// ===== Tabs =====
$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    const tab = btn.dataset.tab;
    $('#view-order').classList.toggle('hidden', tab !== 'order');
    $('#view-summary').classList.toggle('hidden', tab !== 'summary');
    $('#view-pay').classList.toggle('hidden', tab !== 'pay');
    $('#view-admin').classList.toggle('hidden', tab !== 'admin');
    if (tab === 'summary') openSummary(state.currentDate || todayBKK());
    if (tab === 'pay')     loadSettings();
    if (tab === 'admin')   loadAdminMenu();
  });
});

$('#quickAddMenuBtn')?.addEventListener('click', () => {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'admin'));
  $('#view-order').classList.add('hidden');
  $('#view-summary').classList.add('hidden');
  $('#view-pay').classList.add('hidden');
  $('#view-admin').classList.remove('hidden');
  loadAdminMenu();
  setTimeout(() => $('#newMenuName')?.focus(), 150);
});

// ===== People =====
async function loadPeople() {
  state.people = await api('/api/people');
  const sel = $('#personSelect');
  sel.innerHTML = '<option value="">— เลือกชื่อสมาชิก —</option>' +
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
  const name = await customPrompt('ใส่ชื่อสมาชิกใหม่:', '', 'เช่น น้องแพ็ค', 'เพิ่มสมาชิกใหม่', '👤');
  if (!name || !name.trim()) return;
  try {
    const p = await api('/api/people', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    await loadPeople();
    $('#personSelect').value = p.id;
    state.myPersonId = p.id;
    localStorage.setItem('myPersonId', p.id);
    await loadFavorites();
    renderMyOrder();
    renderMenu();
    showToast(`เพิ่มสมาชิก "${p.name}" เรียบร้อยแล้ว ✨`);
  } catch (err) {
    customAlert(err.message, 'เกิดข้อผิดพลาด', '❌');
  }
});

// ===== Category Filter Chips =====
$$('#categoryChips .cat-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#categoryChips .cat-chip').forEach((b) => b.classList.toggle('active', b === btn));
    state.selectedCategory = btn.dataset.cat;
    renderMenu();
  });
});

// ===== Menu Card HTML =====
function menuCardHtml(m, opts = {}) {
  const url = safeUrl(m.image_url);
  const isFav = state.favorites.has(m.id);
  const showStar = state.myPersonId != null;
  const price = m.price != null ? m.price : 50;
  const calories = m.calories != null ? m.calories : 450;

  return `
    <div class="menu-card" data-id="${m.id}">
      <div class="photo">
        ${opts.badge ? `<div class="popular-badge">${esc(opts.badge)}</div>` : ''}
        <div class="cal-badge">🔥 ${calories} kcal</div>
        <div class="price-tag">฿${price}</div>
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
  if (!state.myPersonId) { customAlert('กรุณาเลือกชื่อสมาชิกก่อนครับ', 'แจ้งเตือน', '👤'); return; }
  try {
    const r = await api('/api/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ person_id: state.myPersonId, menu_item_id: menuItemId }),
    });
    if (r.favorited) state.favorites.add(menuItemId);
    else             state.favorites.delete(menuItemId);
    renderMenu();
  } catch (err) {
    customAlert(err.message, 'เกิดข้อผิดพลาด', '❌');
  }
}

function normalize(s) { return (s || '').toLowerCase().trim(); }

function filterCategory(menuList) {
  const cat = state.selectedCategory;
  if (cat === 'all') return menuList;
  if (cat === 'under50') return menuList.filter((m) => (m.price || 50) <= 50);
  if (cat === 'lowcal')  return menuList.filter((m) => (m.calories || 450) <= 500);
  return menuList.filter((m) => m.category === cat);
}

function renderMenu() {
  const q = normalize(state.searchQuery);
  const allGrid     = $('#menuGrid');
  const favGrid     = $('#favoritesGrid');
  const popGrid     = $('#popularGrid');
  const sectFav     = $('#sectionFavorites');
  const sectPop     = $('#sectionPopular');
  const allTitle    = $('#allSectionTitle');
  const emptyHint   = $('#emptySearch');

  let filteredMenu = filterCategory(state.menu);

  if (q) {
    sectFav.classList.add('hidden');
    sectPop.classList.add('hidden');
    const matched = filteredMenu.filter((m) => normalize(m.name_th).includes(q));
    allTitle.textContent = `ผลการค้นหา (${matched.length})`;
    allGrid.innerHTML = matched.map((m) => menuCardHtml(m)).join('');
    emptyHint.classList.toggle('hidden', matched.length > 0);
    wireMenuGrid(allGrid);
    return;
  }

  emptyHint.classList.add('hidden');
  allTitle.textContent = state.selectedCategory === 'all' ? 'เมนูทั้งหมด' : `เมนูหมวด "${state.selectedCategory}"`;

  // 1) Favorites
  const favs = filteredMenu.filter((m) => state.favorites.has(m.id));
  if (state.myPersonId && favs.length > 0) {
    favGrid.innerHTML = favs.map((m) => menuCardHtml(m)).join('');
    wireMenuGrid(favGrid);
    sectFav.classList.remove('hidden');
  } else {
    sectFav.classList.add('hidden');
  }

  // 2) Popular
  const popFiltered = filterCategory(state.popular);
  if (popFiltered.length > 0) {
    popGrid.innerHTML = popFiltered.map((m, i) =>
      menuCardHtml(m, { badge: i === 0 ? '🏆 อันดับ 1' : `#${i + 1}` })
    ).join('');
    wireMenuGrid(popGrid);
    sectPop.classList.remove('hidden');
  } else {
    sectPop.classList.add('hidden');
  }

  // 3) All
  allGrid.innerHTML = filteredMenu.map((m) => menuCardHtml(m)).join('');
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
  const totalLabel = $('#myOrderTotalLabel');
  if (!state.myPersonId) { box.classList.add('hidden'); return; }
  const today = todayBKK();
  const orders = state.ordersByDate[today] || [];
  const mine = orders.filter((o) => o.person_id === state.myPersonId);
  if (mine.length === 0) { box.classList.add('hidden'); return; }
  
  let myTotal = 0;
  let myTotalCal = 0;
  box.classList.remove('hidden');
  ul.innerHTML = mine.map((o) => {
    const itemPrice = calcOrderPrice(o, o.base_price);
    const itemCal   = calcOrderCalories(o, o.base_calories);
    myTotal += itemPrice;
    myTotalCal += itemCal;
    return `
      <li>
        <div class="order-item-detail">
          <span>${esc(orderText(o))}</span>
          <span class="order-item-price">฿${itemPrice}</span>
          <span style="font-size:12px;color:#f59e0b;">(🔥 ${itemCal} kcal)</span>
        </div>
        <button class="del-btn" data-id="${o.id}" title="ลบออเดอร์">🗑️</button>
      </li>
    `;
  }).join('');

  if (totalLabel) totalLabel.textContent = `รวมของคุณ: ฿${myTotal} · 🔥 ${myTotalCal} kcal`;

  ul.querySelectorAll('.del-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const ok = await customConfirm('คุณต้องการลบรายการสั่งนี้ใช่หรือไม่?', 'ยืนยันการลบออเดอร์', '🗑️');
      if (!ok) return;
      try {
        await api(`/api/orders/${b.dataset.id}`, { method: 'DELETE' });
        await loadTodayOrders();
        showToast('ลบรายการเรียบร้อย');
      } catch (err) { customAlert(err.message, 'เกิดข้อผิดพลาด', '❌'); }
    });
  });
}

// ===== Order modal with Real-time Price & Calories Calc =====
function updateModalPriceAndCalories() {
  const m = state.modal;
  if (!m.menuItem) return;
  const basePrice = Number(m.menuItem.price) || 50;
  const baseCal   = Number(m.menuItem.calories) || 450;
  
  let extraPrice = 0;
  let extraCal   = 0;

  if (m.add_egg === 'ไข่ดาว')  { extraPrice += 10; extraCal += 90; }
  if (m.add_egg === 'ไข่เจียว') { extraPrice += 10; extraCal += 120; }
  if (m.special)              { extraPrice += 10; extraCal += 100; }

  const totalPrice = basePrice + extraPrice;
  const totalCal   = baseCal + extraCal;

  $('#modalBasePrice').textContent = `฿${basePrice}`;
  $('#modalTotalPrice').textContent = `฿${totalPrice}`;
  if ($('#modalTotalCalories')) $('#modalTotalCalories').textContent = `${totalCal} kcal`;

  const badge = $('#modalExtraBadge');
  if (badge) {
    if (extraPrice > 0 || extraCal > 0) {
      badge.textContent = `+ ออปชัน (+฿${extraPrice}, +${extraCal} kcal)`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

function setChipActive(rowSel, value) {
  $$(`${rowSel} .chip`).forEach((c) => c.classList.toggle('active', c.dataset.val === value));
}
function wireChipRow(rowSel, key) {
  $$(`${rowSel} .chip`).forEach((c) => {
    c.addEventListener('click', () => {
      state.modal[key] = c.dataset.val;
      setChipActive(rowSel, c.dataset.val);
      updateModalPriceAndCalories();
    });
  });
}
wireChipRow('#styleChips', 'style');
wireChipRow('#eggChips',   'add_egg');
wireChipRow('#spiceChips', 'spice');

$('#specialChk').addEventListener('change', (e) => {
  state.modal.special = e.target.checked;
  updateModalPriceAndCalories();
});

function openOrderModal(menuItemId) {
  if (!state.myPersonId) { customAlert('กรุณาเลือกชื่อผู้สั่งก่อนเลือกเมนูครับ', 'แจ้งเตือน', '👤'); return; }
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

  updateModalPriceAndCalories();
  $('#orderModal').classList.remove('hidden');
}

$('#closeModal').addEventListener('click', () => $('#orderModal').classList.add('hidden'));
$('#orderModal').addEventListener('click', (e) => {
  if (e.target === $('#orderModal')) $('#orderModal').classList.add('hidden');
});

$('#confirmOrderBtn').addEventListener('click', async () => {
  const m = state.modal;
  if (m.menuItem.has_protein && !m.protein) { customAlert('กรุณาเลือกเนื้อสัตว์ครับ', 'ข้อมูลไม่ครบถ้วน', '🥩'); return; }
  if (m.menuItem.has_style && !m.style)     { customAlert('กรุณาเลือก น้ำ / แห้ง ครับ', 'ข้อมูลไม่ครบถ้วน', '🍜'); return; }
  
  const basePrice = Number(m.menuItem.price) || 50;
  const baseCal   = Number(m.menuItem.calories) || 450;
  
  let extraPrice = (m.add_egg ? 10 : 0) + (m.special ? 10 : 0);
  let extraCal   = (m.add_egg === 'ไข่ดาว' ? 90 : (m.add_egg === 'ไข่เจียว' ? 120 : 0)) + (m.special ? 100 : 0);
  
  const finalPrice = basePrice + extraPrice;
  const finalCal   = baseCal + extraCal;

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
        is_special: m.special,
        notes: $('#notesInput').value,
        price: finalPrice,
        calories: finalCal,
        order_date: todayBKK(),
      }),
    });
    $('#orderModal').classList.add('hidden');
    await loadTodayOrders();
    loadPopular();
    showToast(`สั่ง "${m.menuItem.name_th}" (฿${finalPrice}, 🔥 ${finalCal} kcal) เรียบร้อย 🎉`);
  } catch (err) {
    customAlert('ผิดพลาด: ' + err.message, 'เกิดข้อผิดพลาด', '❌');
  }
});

// ===== Summary + History + KPIs =====
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
  $('#summaryTitle').textContent = `📊 สรุปออเดอร์ & รวมเงิน ${isToday ? '(วันนี้)' : ''}`;

  let timeLabel = '';
  if (isToday) {
    timeLabel = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  } else if (data.orders.length > 0) {
    timeLabel = bkkTime(data.orders[0].created_at);
  }

  let grandTotal = 0;
  let grandCalories = 0;

  for (const o of data.orders) {
    grandTotal += calcOrderPrice(o, o.base_price);
    grandCalories += calcOrderCalories(o, o.base_calories);
  }

  const byPerson = new Map();
  for (const o of data.orders) {
    if (!byPerson.has(o.person_id)) byPerson.set(o.person_id, []);
    byPerson.get(o.person_id).push(o);
  }

  // Update KPI Cards
  $('#kpiTotalDishes').innerHTML = `${data.orders.length} <span>จาน</span>`;
  $('#kpiGrandTotal').textContent = `฿${grandTotal.toLocaleString()}`;
  $('#kpiTotalPeople').innerHTML = `${byPerson.size} <span>คน</span>`;
  if ($('#kpiTotalCalories')) {
    const avgCal = data.orders.length > 0 ? Math.round(grandCalories / data.orders.length) : 0;
    $('#kpiTotalCalories').innerHTML = `${grandCalories.toLocaleString()} <span>kcal</span> <small style="display:block;font-size:11px;color:var(--ink-muted);font-weight:400;">(~${avgCal} kcal/จาน)</small>`;
  }

  $('#summaryMeta').innerHTML = `
    <strong>วันที่:</strong> ${esc(thaiDateLabel(date))}
    &nbsp;·&nbsp;
    <strong>ออเดอร์รวม:</strong> ${data.orders.length} รายการ
    ${timeLabel ? `&nbsp;·&nbsp;<strong>อัปเดตเมื่อ:</strong> ${esc(timeLabel)}` : ''}
  `;

  const ordered  = state.people.filter((p) => byPerson.has(p.id));
  const pending  = state.people.filter((p) => !byPerson.has(p.id));
  const peopleList = isToday ? [...ordered, ...pending] : ordered;

  const tbody = $('#summaryTable tbody');
  const tableGrandTotal = $('#tableGrandTotal');
  const tableTotalCal = $('#tableTotalCal');

  if (tableGrandTotal) tableGrandTotal.textContent = `฿${grandTotal.toLocaleString()}`;
  if (tableTotalCal) tableTotalCal.textContent = `🔥 ${grandCalories.toLocaleString()} kcal`;

  if (peopleList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ink-muted);">ยังไม่มีข้อมูลออเดอร์ในวันที่เลือก</td></tr>`;
    return;
  }

  tbody.innerHTML = peopleList.map((p, idx) => {
    const seq = idx + 1;
    const orders = byPerson.get(p.id) || [];
    if (orders.length === 0) {
      return `<tr>
        <td class="col-num">${seq}</td>
        <td class="col-name">${esc(p.name)}</td>
        <td style="color:var(--ink-muted);">ยังไม่ได้สั่ง</td>
        <td class="col-cal">—</td>
        <td class="col-price">—</td>
        <td class="col-action"></td>
      </tr>`;
    }
    return orders.map((o, i) => {
      const itemPrice = calcOrderPrice(o, o.base_price);
      const itemCal   = calcOrderCalories(o, o.base_calories);
      return `
        <tr>
          <td class="col-num">${i === 0 ? seq : ''}</td>
          <td class="col-name">${i === 0 ? esc(p.name) : ''}</td>
          <td>${esc(orderText(o))}</td>
          <td class="col-cal">🔥 ${itemCal}</td>
          <td class="col-price">฿${itemPrice}</td>
          <td class="col-action">
            <button class="del-btn" data-id="${o.id}" title="ลบรายการ">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }).join('');

  tbody.querySelectorAll('.del-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const ok = await customConfirm('คุณต้องการลบรายการนี้ใช่หรือไม่?', 'ยืนยันการลบ', '🗑️');
      if (!ok) return;
      try {
        await api(`/api/orders/${b.dataset.id}`, { method: 'DELETE' });
        await openSummary(date);
        await renderHistoryChips();
      } catch (err) { customAlert(err.message, 'เกิดข้อผิดพลาด', '❌'); }
    });
  });
}

$('#historyDate').addEventListener('change', (e) => {
  if (e.target.value) openSummary(e.target.value);
});
$('#todayBtn').addEventListener('click', () => openSummary(todayBKK()));

// ===== Popup Export & Print Modal =====
function openExportPopup() {
  const date = state.currentDate || todayBKK();
  const orders = state.ordersByDate[date] || [];
  const isToday = date === todayBKK();
  const timeLabel = isToday
    ? new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    : (orders[0] ? bkkTime(orders[0].created_at) : '—');

  const byPerson = new Map();
  let grandTotal = 0;
  for (const o of orders) {
    if (!byPerson.has(o.person_id)) byPerson.set(o.person_id, []);
    byPerson.get(o.person_id).push(o);
    grandTotal += calcOrderPrice(o, o.base_price);
  }

  const ordered = state.people.filter((p) => byPerson.has(p.id));

  if (ordered.length === 0 || orders.length === 0) {
    customAlert('ยังไม่มีข้อมูลการสั่งอาหารในวันที่เลือกครับ', 'สรุปออเดอร์', '📋');
    return;
  }

  const lines = [
    `🍱 สรุปออเดอร์ข้าวเที่ยง - ${thaiDateLabel(date)} (${timeLabel})`,
    `----------------------------------------`,
  ];

  let seq = 1;
  ordered.forEach((p) => {
    const list = byPerson.get(p.id) || [];
    list.forEach((o) => {
      const pAmt = calcOrderPrice(o, o.base_price);
      lines.push(`${seq}. ${p.name} - ${orderText(o)} [฿${pAmt}]`);
      seq++;
    });
  });

  lines.push(`----------------------------------------`);
  lines.push(`รวมเฉพาะผู้สั่ง: ${ordered.length} คน (${orders.length} จาน)`);
  lines.push(`ยอดรวมเงินสุทธิ: ฿${grandTotal.toLocaleString()}`);

  const exportText = lines.join('\n');

  $('#exportMetaBadge').innerHTML = `
    <span>📅 ${thaiDateLabel(date)} (${timeLabel})</span>
    <span>👥 ผู้สั่งทั้งหมด: ${ordered.length} คน (${orders.length} จาน)</span>
  `;

  let cardSeq = 1;
  let visualHtml = '';
  ordered.forEach((p) => {
    const list = byPerson.get(p.id) || [];
    list.forEach((o) => {
      const pAmt = calcOrderPrice(o, o.base_price);
      const pCal = calcOrderCalories(o, o.base_calories);
      visualHtml += `
        <div class="export-item-card">
          <div class="export-item-left">
            <div class="export-item-num">${cardSeq}</div>
            <div class="export-person-pill">👤 ${esc(p.name)}</div>
            <div class="export-dish-name">${esc(orderText(o))}</div>
          </div>
          <div class="export-item-right">
            <div class="export-price-pill">฿${pAmt}</div>
            <div class="export-cal-tag">🔥 ${pCal} kcal</div>
          </div>
        </div>
      `;
      cardSeq++;
    });
  });

  visualHtml += `
    <div class="export-total-banner">
      <div class="export-total-label">
        <div>ยอดรวมเงินสุทธิ (${ordered.length} คน / ${orders.length} จาน)</div>
        <div style="font-size:12px;color:#f59e0b;font-weight:500;margin-top:2px;">🔥 พลังงานรวม: ${grandCal.toLocaleString()} kcal</div>
      </div>
      <div class="export-total-value">฿${grandTotal.toLocaleString()}</div>
    </div>
  `;

  $('#exportVisualList').innerHTML = visualHtml;
  state.currentExportText = exportText;

  $('#summaryExportModal').classList.remove('hidden');
}

$('#copySummaryBtn')?.addEventListener('click', openExportPopup);
$('#printSummaryBtn')?.addEventListener('click', openExportPopup);

$('#closeExportModal')?.addEventListener('click', () => $('#summaryExportModal').classList.add('hidden'));
$('#summaryExportModal')?.addEventListener('click', (e) => {
  if (e.target === $('#summaryExportModal')) $('#summaryExportModal').classList.add('hidden');
});

$('#confirmCopyLineBtn')?.addEventListener('click', () => {
  if (state.currentExportText) {
    navigator.clipboard.writeText(state.currentExportText);
    showToast('คัดลอกข้อความ LINE เรียบร้อย! 📋');
    $('#summaryExportModal').classList.add('hidden');
  }
});

$('#confirmPrintBtn')?.addEventListener('click', () => {
  window.print();
});

// ===== Settings (QR & Payee) =====
async function getAdminHeader() {
  if (!state.adminRequired) return {};
  let pw = sessionStorage.getItem('adminPw');
  if (!pw) {
    pw = await customPrompt('กรุณาระบุรหัสผ่านแอดมิน:', '', '******', 'เข้าสู่ระบบแอดมิน', '🔐');
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
    if (file.size > 4 * 1024 * 1024) { customAlert('ไฟล์ใหญ่เกิน 4MB กรุณาย่อขนาดไฟล์', 'ข้อผิดพลาดไฟล์', '⚠️'); return; }
    if (!/^image\//.test(file.type)) { customAlert('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'ข้อผิดพลาดไฟล์', '🖼️'); return; }
    payload.qr_image = await fileToDataUrl(file);
  }
  try {
    const adminHdr = await getAdminHeader();
    await api('/api/settings', {
      method: 'PUT',
      headers: adminHdr,
      body: JSON.stringify(payload),
    });
    $('#qrFileInput').value = '';
    await loadSettings();
    showToast('บันทึกข้อมูลการชำระเงินเรียบร้อย 💾');
  } catch (err) {
    if (/รหัสผ่าน/.test(err.message)) sessionStorage.removeItem('adminPw');
    customAlert('ผิดพลาด: ' + err.message, 'เกิดข้อผิดพลาด', '❌');
  }
});

// ===== Admin: Menu & Price & Calories Management =====
async function loadAdminMenu() {
  try {
    const cfg = await api('/api/settings');
    state.adminRequired = !!cfg.admin_required;

    const items = await api('/api/menu?all=true');
    const countBadge = $('#adminMenuCount');
    if (countBadge) countBadge.textContent = `${items.length} รายการ`;

    const list = $('#adminMenuList');
    list.innerHTML = items.map((m) => `
      <div class="admin-menu-row ${m.is_active ? '' : 'inactive'}" data-id="${m.id}">
        <div class="thumb">
          ${safeUrl(m.image_url)
            ? `<img src="${esc(m.image_url)}" alt="" onerror="this.outerHTML='${esc(m.emoji || '🍽️')}'" />`
            : esc(m.emoji || '🍽️')}
        </div>
        <div class="info">
          <div class="row-name">${esc(m.name_th)}</div>
          <div class="row-meta">
            ${esc(m.category || 'ทั่วไป')}
            ${!m.is_active ? '<span style="color:var(--danger)"> · ปิดใช้งาน</span>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <div><input type="number" class="admin-price-input" value="${m.price || 50}" min="0" data-id="${m.id}" title="แก้ไขราคา" /> ฿</div>
          <div><input type="number" class="admin-cal-input" value="${m.calories || 450}" min="0" data-id="${m.id}" title="แก้ไขแคลอรี" /> kcal</div>
        </div>
        <div class="actions">
          <button data-action="toggle" data-id="${m.id}" data-active="${m.is_active}">
            ${m.is_active ? '⏸ ปิด' : '▶ เปิด'}
          </button>
          <button data-action="delete" data-id="${m.id}" class="danger">🗑️ ลบ</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('button[data-action]').forEach((b) => {
      b.addEventListener('click', () => handleAdminAction(b.dataset.action, Number(b.dataset.id), b.dataset.active === 'true'));
    });

    list.querySelectorAll('.admin-price-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const id = Number(input.dataset.id);
        const newPrice = Number(input.value);
        if (!Number.isFinite(newPrice) || newPrice < 0) return;
        try {
          const adminHdr = await getAdminHeader();
          await api(`/api/menu/${id}`, {
            method: 'PATCH',
            headers: adminHdr,
            body: JSON.stringify({ price: newPrice }),
          });
          showToast(`อัปเดตราคาเป็น ฿${newPrice} แล้ว`);
          await loadMenu();
        } catch (err) {
          if (/รหัสผ่าน/.test(err.message)) sessionStorage.removeItem('adminPw');
          customAlert('ผิดพลาด: ' + err.message, 'เกิดข้อผิดพลาด', '❌');
        }
      });
    });

    list.querySelectorAll('.admin-cal-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const id = Number(input.dataset.id);
        const newCal = Number(input.value);
        if (!Number.isFinite(newCal) || newCal < 0) return;
        try {
          const adminHdr = await getAdminHeader();
          await api(`/api/menu/${id}`, {
            method: 'PATCH',
            headers: adminHdr,
            body: JSON.stringify({ calories: newCal }),
          });
          showToast(`อัปเดตพลังงานเป็น ${newCal} kcal แล้ว`);
          await loadMenu();
        } catch (err) {
          if (/รหัสผ่าน/.test(err.message)) sessionStorage.removeItem('adminPw');
          customAlert('ผิดพลาด: ' + err.message, 'เกิดข้อผิดพลาด', '❌');
        }
      });
    });
  } catch (err) {
    customAlert('โหลดข้อมูลล้มเหลว: ' + err.message, 'ข้อผิดพลาดระบบ', '❌');
  }
}

async function handleAdminAction(action, id, isActive) {
  try {
    const adminHdr = await getAdminHeader();
    if (action === 'toggle') {
      await api(`/api/menu/${id}`, {
        method: 'PATCH',
        headers: adminHdr,
        body: JSON.stringify({ is_active: !isActive }),
      });
      showToast(isActive ? 'ปิดเมนูแล้ว' : 'เปิดเมนูแล้ว');
    } else if (action === 'delete') {
      const ok = await customConfirm('หากมีออเดอร์เก่าอ้างอิง ระบบจะทำการปิดใช้งานแทนเพื่อรักษาประวัติ คุณต้องการลบเมนูนี้ใช่หรือไม่?', 'ยืนยันลบเมนู', '🗑️');
      if (!ok) return;
      const r = await api(`/api/menu/${id}`, {
        method: 'DELETE',
        headers: adminHdr,
      });
      showToast(r.soft_deleted ? `ปิดเมนูแล้ว (มีประวัติ ${r.order_count} รายการ)` : 'ลบเมนูเรียบร้อย');
    }
    await loadAdminMenu();
    await loadMenu();
    await loadPopular();
  } catch (err) {
    if (/รหัสผ่าน/.test(err.message)) sessionStorage.removeItem('adminPw');
    customAlert('ผิดพลาด: ' + err.message, 'เกิดข้อผิดพลาด', '❌');
  }
}

$('#addMenuBtn').addEventListener('click', async () => {
  const payload = {
    name_th:     $('#newMenuName').value.trim(),
    emoji:       $('#newMenuEmoji').value.trim(),
    price:       Number($('#newMenuPrice').value) || 50,
    calories:    Number($('#newMenuCalories').value) || 450,
    image_url:   $('#newMenuImage').value.trim(),
    category:    $('#newMenuCategory').value.trim(),
    has_protein: $('#newMenuProtein').checked,
    has_style:   $('#newMenuStyle').checked,
  };
  if (!payload.name_th) { customAlert('กรุณาระบุชื่อเมนูครับ', 'ข้อมูลไม่ครบถ้วน', '⚠️'); return; }

  try {
    const adminHdr = await getAdminHeader();
    await api('/api/menu', {
      method: 'POST',
      headers: adminHdr,
      body: JSON.stringify(payload),
    });
    // Clear Form
    $('#newMenuName').value = '';
    $('#newMenuEmoji').value = '';
    $('#newMenuPrice').value = '50';
    $('#newMenuCalories').value = '550';
    $('#newMenuImage').value = '';
    $('#newMenuCategory').value = '';
    $('#newMenuProtein').checked = false;
    $('#newMenuStyle').checked = false;

    await loadAdminMenu();
    await loadMenu();
    showToast(`เพิ่มเมนู "${payload.name_th}" (฿${payload.price}, ${payload.calories} kcal) เรียบร้อย 🎉`);
  } catch (err) {
    if (/รหัสผ่าน/.test(err.message)) sessionStorage.removeItem('adminPw');
    customAlert('ผิดพลาด: ' + err.message, 'เกิดข้อผิดพลาด', '❌');
  }
});

// ===== AI Cartoon Mascot Chef Simulation =====
let currentAiRecommendation = null;

const AI_CHEF_QUOTES = [
  "สวัสดีครับ! เที่ยงนี้เชฟน้องหมีขอแนะนำ <strong>{name}</strong> อร่อยกลมกล่อมลงตัว พลังงาน 🔥 {cal} kcal ราคาเพียง ฿{price} ครับ!",
  "หิวยามเที่ยงใช่ไหมครับ? เชฟน้องหมีคัดสรร <strong>{name}</strong> มาให้คุณโดยเฉพาะ! (🔥 {cal} kcal | ฿{price})",
  "เมนูยอดนิยมวันนี้! ลองสั่ง <strong>{name}</strong> ดูสิครับ รับรองอร่อยติดใจแน่นอน! (🔥 {cal} kcal | ฿{price})",
  "สายกินต้องไม่พลาด! เชฟหมีเชียร์ <strong>{name}</strong> มื้อนี้จัดเต็มพลังงาน 🔥 {cal} kcal ในราคา ฿{price} เท่านั้นครับ!",
];

function generateAiRecommendation(mode = 'random') {
  if (!state.menu || state.menu.length === 0) return;

  let pool = [...state.menu];
  if (mode === 'lowcal') {
    pool = pool.filter((m) => (m.calories || 450) <= 500);
  } else if (mode === 'popular') {
    pool = state.popular.length > 0 ? state.popular : pool;
  }

  if (pool.length === 0) pool = state.menu;

  const item = pool[Math.floor(Math.random() * pool.length)];
  currentAiRecommendation = item;

  const quoteTemplate = AI_CHEF_QUOTES[Math.floor(Math.random() * AI_CHEF_QUOTES.length)];
  const speechText = quoteTemplate
    .replace('{name}', `${item.emoji || '🍽️'} ${esc(item.name_th)}`)
    .replace('{cal}', item.calories || 450)
    .replace('{price}', item.price || 50);

  const container = $('#aiRecommendationText');
  if (container) {
    container.innerHTML = speechText;
  }
}

$('#aiRefreshBtn')?.addEventListener('click', () => generateAiRecommendation('random'));
$('#aiFilterLowCalBtn')?.addEventListener('click', () => generateAiRecommendation('lowcal'));
$('#aiFilterPopularBtn')?.addEventListener('click', () => generateAiRecommendation('popular'));

$('#aiOrderRecommendedBtn')?.addEventListener('click', () => {
  if (!currentAiRecommendation) return;
  if (!state.myPersonId) {
    customAlert('กรุณาเลือกชื่อผู้สั่งที่มุมบนก่อนสั่งอาหารครับ', 'แจ้งเตือน', '👤');
    $('#personSelect')?.focus();
    return;
  }
  openOrderModal(currentAiRecommendation.id);
});

// ===== CUTOFF COUNTDOWN TIMER LOGIC =====
function updateCutoffTimer() {
  const now = new Date();
  const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const cutoff = new Date(bkkNow);
  cutoff.setUTCHours(11, 30, 0, 0); // 11:30 AM Cutoff

  const badge = $('#cutoffStatusBadge');
  const textContainer = $('#cutoffText');

  const diffMs = cutoff - bkkNow;

  if (diffMs > 0) {
    const totalSec = Math.floor(diffMs / 1000);
    const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    if (badge) {
      badge.textContent = '🟢 เปิดรับออเดอร์';
      badge.className = 'cutoff-status-badge open';
    }
    if (textContainer) textContainer.innerHTML = `เหลือเวลาอีก <strong id="cutoffTimerValue">${mins}:${secs}</strong> นาที (ตัดรอบ 11:30 น.)`;
    state.isOrderOpen = true;
  } else {
    if (badge) {
      badge.textContent = '🔴 ปิดรับออเดอร์แล้ว';
      badge.className = 'cutoff-status-badge closed';
    }
    if (textContainer) textContainer.innerHTML = 'ปิดรับออเดอร์ประจำวันเรียบร้อยแล้ว (ตัดรอบ 11:30 น.)';
    state.isOrderOpen = false;
  }
}
setInterval(updateCutoffTimer, 1000);

// ===== LUCKY FOOD WHEEL =====
let wheelItems = [];
let currentRotation = 0;
let selectedWheelItem = null;

function drawWheel() {
  const canvas = $('#wheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const numSlices = wheelItems.length;
  if (numSlices === 0) return;

  const radius = canvas.width / 2;
  const sliceAngle = (2 * Math.PI) / numSlices;
  const colors = ['#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < numSlices; i++) {
    const startAngle = i * sliceAngle;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius, startAngle, endAngle);
    ctx.closePath();

    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Prompt, sans-serif';
    const name = (wheelItems[i].emoji || '🍽️') + ' ' + wheelItems[i].name_th.slice(0, 9);
    ctx.fillText(name, radius - 15, 4);
    ctx.restore();
  }
}

function openWheelModal() {
  wheelItems = state.menu.slice(0, 10);
  if (wheelItems.length === 0) return;
  $('#wheelResultText').innerHTML = 'กดปุ่ม <strong>"🎯 หมุนเสี่ยงทาย!"</strong> เพื่อสุ่มเมนูมื้อนี้! ✨';
  $('#orderWheelResultBtn')?.classList.add('hidden');
  $('#spinWheelBtn')?.classList.remove('hidden');
  $('#wheelModal')?.classList.remove('hidden');
  drawWheel();
}

$('#openWheelBtn')?.addEventListener('click', openWheelModal);
$('#closeWheelModal')?.addEventListener('click', () => $('#wheelModal')?.classList.add('hidden'));

$('#spinWheelBtn')?.addEventListener('click', () => {
  if (wheelItems.length === 0) return;
  const spinBtn = $('#spinWheelBtn');
  spinBtn.disabled = true;

  const canvas = $('#wheelCanvas');
  const numSlices = wheelItems.length;
  const winningIndex = Math.floor(Math.random() * numSlices);
  selectedWheelItem = wheelItems[winningIndex];

  const sliceDegrees = 360 / numSlices;
  const targetDegrees = 360 - (winningIndex * sliceDegrees) - (sliceDegrees / 2) + 270;
  const extraRotations = 5 * 360;
  currentRotation += extraRotations + (targetDegrees - (currentRotation % 360));

  if (canvas) canvas.style.transform = `rotate(${currentRotation}deg)`;

  setTimeout(() => {
    spinBtn.disabled = false;
    $('#wheelResultText').innerHTML = `🎉 ยินดีด้วย! วงล้อเสี่ยงทายได้เมนู: <strong style="color:var(--primary);">${selectedWheelItem.emoji || '🍽️'} ${esc(selectedWheelItem.name_th)}</strong> (฿${selectedWheelItem.price || 50}, 🔥 ${selectedWheelItem.calories || 450} kcal)`;
    $('#orderWheelResultBtn')?.classList.remove('hidden');
  }, 4000);
});

$('#orderWheelResultBtn')?.addEventListener('click', () => {
  if (!selectedWheelItem) return;
  $('#wheelModal')?.classList.add('hidden');
  if (!state.myPersonId) {
    customAlert('กรุณาเลือกชื่อผู้สั่งที่มุมบนก่อนสั่งอาหารครับ', 'แจ้งเตือน', '👤');
    return;
  }
  openOrderModal(selectedWheelItem.id);
});

// ===== TEAM LEADERBOARD =====
async function loadLeaderboard() {
  try {
    const data = await api('/api/leaderboard');
    const topFoodiesList = $('#topFoodiesList');
    const topMenuList = $('#topMenuList');

    if (topFoodiesList) {
      if (data.top_foodies && data.top_foodies.length > 0) {
        const medals = ['🏆', '🥈', '🥉', '4', '5'];
        topFoodiesList.innerHTML = data.top_foodies.map((f, i) => `
          <div class="lb-item">
            <span class="lb-rank">${medals[i] || i + 1}</span>
            <span class="lb-name">👤 ${esc(f.name)}</span>
            <span class="lb-stat">${f.order_count} จาน (฿${Number(f.total_spent).toLocaleString()})</span>
          </div>
        `).join('');
      } else {
        topFoodiesList.innerHTML = '<div style="color:var(--ink-muted);font-size:13px;padding:8px;">ยังไม่มีข้อมูลออเดอร์</div>';
      }
    }

    if (topMenuList) {
      if (data.top_menu && data.top_menu.length > 0) {
        topMenuList.innerHTML = data.top_menu.map((m, i) => `
          <div class="lb-item">
            <span class="lb-rank">#${i + 1}</span>
            <span class="lb-name">${m.emoji || '🍽️'} ${esc(m.name_th)}</span>
            <span class="lb-stat">${m.order_count} ครั้ง</span>
          </div>
        `).join('');
      } else {
        topMenuList.innerHTML = '<div style="color:var(--ink-muted);font-size:13px;padding:8px;">ยังไม่มีข้อมูลออเดอร์</div>';
      }
    }
  } catch {}
}

// ===== Boot =====
if ($('#datePill')) $('#datePill').textContent = thaiDateLabel(todayBKK());
(async () => {
  try {
    updateCutoffTimer();
    await loadPeople();
    await Promise.all([loadMenu(), loadPopular(), loadFavorites(), loadLeaderboard()]);
    renderMenu();
    generateAiRecommendation();
    await loadTodayOrders();
  } catch (err) {
    customAlert('โหลดข้อมูลเริ่มต้นล้มเหลว: ' + err.message, 'ข้อผิดพลาดระบบ', '❌');
  }
})();
