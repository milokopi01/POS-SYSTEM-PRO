/* =========================================================================
   UNIVERSAL POS 3D PRO v3 — JUALAN + PEMBELIAN STOK + SAAS MULTI-KEDAI
   - Master Admin Password: 101010 (Jana URL kedai & kawal langganan)
   - Owner Kedai Password: Unik bagi setiap URL kedai (Auto / Manual)
   ========================================================================= */

const urlParams = new URLSearchParams(window.location.search);
const CURRENT_SHOP_ID = (urlParams.get('kedai') || 'DEMO01').trim().toUpperCase();
const INITIAL_MODE = (urlParams.get('mod') || '').trim().toLowerCase();
const STORAGE_KEY = 'UNIVERSAL_POS_3D_V3_' + CURRENT_SHOP_ID;
const MASTER_ADMIN_PASS = '101010';

const IS_CLOUD_ENABLED = typeof WEB_APP_URL === 'string' && WEB_APP_URL.startsWith('https://script.google.com/');

const DEFAULT_PRODUCTS = [
  { id: 'P001', barcode: '8880001', name: 'Nasi Lemak Ayam', category: 'Makanan', costPrice: 4.50, price: 9.50, stock: 50, minStock: 10, icon: '🍛' },
  { id: 'P002', barcode: '8880002', name: 'Teh Tarik Kaw', category: 'Minuman', costPrice: 1.00, price: 3.00, stock: 100, minStock: 15, icon: '☕' },
  { id: 'P003', barcode: '9556001', name: 'Air Mineral 500ml', category: 'Runcit', costPrice: 0.80, price: 1.50, stock: 120, minStock: 20, icon: '💧' },
  { id: 'P004', barcode: '9556002', name: 'Minyak Masak 1kg', category: 'Runcit', costPrice: 5.80, price: 6.90, stock: 30, minStock: 8, icon: '🧴' },
  { id: 'P005', barcode: '7770001', name: 'Baju T-Shirt Cotton', category: 'Pakaian', costPrice: 15.00, price: 35.00, stock: 25, minStock: 5, icon: '👕' },
  { id: 'P006', barcode: '6660001', name: 'Minyak Enjin 4T 1L', category: 'Servis', costPrice: 22.00, price: 38.00, stock: 18, minStock: 5, icon: '🛢️' }
];

const DEFAULT_STATE = {
  settings: {
    shopId: CURRENT_SHOP_ID,
    shopName: 'KEDAI UNIVERSAL DEMO PRO',
    shopType: 'UNIVERSAL',
    shopAddress: 'No. 12, Jalan Utama, Selama, Perak',
    shopPhone: '012-3456789',
    paperSize: '80',
    taxRate: 0,
    serviceRate: 0,
    tableCount: 12,
    receiptFooter: 'Terima kasih! Sila datang lagi.',
    ownerPassword: '888888',
    qrImage: '',
    isSetupDone: true
  },
  products: DEFAULT_PRODUCTS,
  purchases: [],
  tables: {},
  kdsOrders: [],
  sales: []
};

let state = loadLocalState();
let activeCategory = 'Semua';
let activeTable = null;
let cart = [];
let purchaseCart = [];
let selectedPaymentMethod = 'Tunai';

// Kawalan Akses Berasingan: Owner Kedai vs Master Admin
let isOwnerUnlocked = false;
let isMasterUnlocked = false;
let pendingAuthMode = 'owner'; // 'owner' | 'master'
let pendingAuthCallback = null;

let selectedTableForModal = null;
let passGenMode = 'auto';
let lastGeneratedLinksText = '';
let lastGeneratedPhone = '';

// --- Storage ---
function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}), shopId: CURRENT_SHOP_ID }
    };
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Cloud API ---
function setSyncStatus(mode, text) {
  const pill = document.getElementById('syncStatusPill');
  pill.className = 'sync-pill ' + mode;
  pill.textContent = text;
}

async function apiGet(params) {
  if (!IS_CLOUD_ENABLED) return null;
  const res = await fetch(`${WEB_APP_URL}?${new URLSearchParams(params).toString()}`);
  return await res.json();
}

async function apiPost(payload) {
  if (!IS_CLOUD_ENABLED) return null;
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ shopId: CURRENT_SHOP_ID, ...payload })
  });
  return await res.json();
}

async function syncFromCloud(silent = false) {
  if (!IS_CLOUD_ENABLED) {
    setSyncStatus('offline', '⚡ Mod Lokal (Belum Link Sheet)');
    return;
  }
  try {
    if (!silent) setSyncStatus('', '⏳ Menyegerak...');
    const res = await apiGet({ action: 'getShopData', shopId: CURRENT_SHOP_ID });
    if (!res) return;

    if (res.notFound || res.suspended) {
      document.getElementById('lockoutMessage').textContent = res.error || 'Akses kedai disekat.';
      document.getElementById('lockoutModal').classList.add('open');
      setSyncStatus('offline', '⛔ Disekat');
      return;
    }

    if (res.ok) {
      state.settings = { ...state.settings, ...res.settings };
      if (Array.isArray(res.products) && res.products.length > 0) state.products = res.products;
      state.purchases = res.purchases || [];
      state.tables = res.tables || {};
      state.kdsOrders = res.kdsOrders || [];
      state.sales = res.sales || [];
      saveLocalState();
      refreshAllUI();
      setSyncStatus('online', '☁️ Google Sheets Aktif');

      if (state.settings.isSetupDone === false) {
        openSetupWizard();
      }
    }
  } catch (_) {
    setSyncStatus('offline', '⚠️ Luar Talian');
    if (!silent) showToast('Gagal sambung ke Google Sheets. Guna data lokal.');
  }
}

// --- Helpers ---
function playBeep(freq = 880, duration = 0.07) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function formatRM(num) {
  return 'RM ' + (Number(num) || 0).toFixed(2);
}

function generateRandomPass(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

// --- Penyesuaian Mod Universal (F&B vs Runcit/Butik/Bengkel) ---
function applyShopTypeUI() {
  const type = (state.settings.shopType || 'UNIVERSAL').toUpperCase();
  const isFnb = type === 'UNIVERSAL' || type === 'FNB';
  document.getElementById('headerShopType').textContent = type;
  document.getElementById('navWaiterBtn').style.display = isFnb ? 'inline-flex' : 'none';
  document.getElementById('navKdsBtn').style.display = isFnb ? 'inline-flex' : 'none';
  document.getElementById('sendToKitchenBtn').style.display = isFnb ? 'inline-flex' : 'none';
}

// --- Wizard Setup Pantas (Mesti Sahkan Password Owner) ---
function openSetupWizard() {
  document.getElementById('wizOwnerPass').value = '';
  document.getElementById('wizShopName').value = state.settings.shopName || '';
  document.getElementById('wizShopAddress').value = state.settings.shopAddress || '';
  document.getElementById('wizShopPhone').value = state.settings.shopPhone || '';
  document.getElementById('wizTableCount').value = state.settings.tableCount || 12;
  document.getElementById('setupWizardModal').classList.add('open');
}

document.getElementById('finishSetupBtn').addEventListener('click', async () => {
  const enteredPass = document.getElementById('wizOwnerPass').value.trim();
  if (enteredPass !== state.settings.ownerPassword && enteredPass !== MASTER_ADMIN_PASS) {
    playBeep(260, 0.18);
    return showToast('❌ Password Pemilik salah! Sila masukkan kata laluan URL kedai anda.');
  }

  state.settings.shopName = document.getElementById('wizShopName').value.trim() || state.settings.shopName;
  state.settings.shopAddress = document.getElementById('wizShopAddress').value.trim() || 'Malaysia';
  state.settings.shopPhone = document.getElementById('wizShopPhone').value.trim();
  state.settings.tableCount = Math.max(1, parseInt(document.getElementById('wizTableCount').value) || 12);
  state.settings.isSetupDone = true;
  isOwnerUnlocked = true;

  saveLocalState();
  document.getElementById('setupWizardModal').classList.remove('open');
  refreshAllUI();
  showToast('🎉 Setup kedai selesai & disahkan! Selamat berniaga!');
  try { await apiPost({ action: 'saveSettings', settings: state.settings }); } catch (_) {}
});

// --- Navigation & Auth Gate ---
function requireAuth(mode, callback) {
  if (mode === 'master' && isMasterUnlocked) return callback();
  if (mode === 'owner' && (isOwnerUnlocked || isMasterUnlocked)) return callback();

  pendingAuthMode = mode;
  pendingAuthCallback = callback;
  document.getElementById('pinDisplay').value = '';

  if (mode === 'master') {
    document.getElementById('pinModalTitle').textContent = '🔐 Pengesahan Master Admin';
    document.getElementById('pinModalSubtitle').textContent = 'Masukkan kata laluan Master Admin untuk urus jualan app & jana link kedai.';
  } else {
    document.getElementById('pinModalTitle').textContent = `🔑 Kata Laluan Pemilik (${CURRENT_SHOP_ID})`;
    document.getElementById('pinModalSubtitle').textContent = 'Masukkan password khas URL kedai ini untuk edit produk, tetapan & belian stok.';
  }

  document.getElementById('pinModal').classList.add('open');
  setTimeout(() => document.getElementById('pinDisplay').focus(), 100);
}

function verifyPin() {
  const entered = document.getElementById('pinDisplay').value.trim();
  let ok = false;

  if (pendingAuthMode === 'master') {
    if (entered === MASTER_ADMIN_PASS) {
      isMasterUnlocked = true;
      ok = true;
    }
  } else {
    if (entered === state.settings.ownerPassword || entered === MASTER_ADMIN_PASS) {
      isOwnerUnlocked = true;
      ok = true;
    }
  }

  if (ok) {
    document.getElementById('pinModal').classList.remove('open');
    playBeep(1200, 0.08);
    showToast(pendingAuthMode === 'master' ? 'Akses Master Admin disahkan!' : 'Akses Pemilik Kedai disahkan!');
    if (pendingAuthCallback) {
      const fn = pendingAuthCallback;
      pendingAuthCallback = null;
      fn();
    }
  } else {
    playBeep(260, 0.18);
    showToast('❌ Kata laluan salah!');
    document.getElementById('pinDisplay').value = '';
  }
}

document.getElementById('adminNumpad').addEventListener('click', (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  const disp = document.getElementById('pinDisplay');
  if (key === 'C') disp.value = '';
  else if (key === 'OK') verifyPin();
  else disp.value += key;
});
document.getElementById('pinDisplay').addEventListener('keydown', e => e.key === 'Enter' && verifyPin());
document.getElementById('closePinModalBtn').addEventListener('click', () => document.getElementById('pinModal').classList.remove('open'));

function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');

  const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if (btn) btn.classList.add('active');
  if (viewId === 'purchaseView') document.getElementById('openPurchaseNavBtn').classList.add('active');
  if (viewId === 'ownerView') document.getElementById('openOwnerNavBtn').classList.add('active');
  if (viewId === 'masterView') document.getElementById('openMasterNavBtn').classList.add('active');

  if (viewId === 'waiterView') renderTables();
  if (viewId === 'kdsView') renderKDS();
  if (viewId === 'purchaseView') renderPurchaseView();
  if (viewId === 'reportView') renderReports();
  if (viewId === 'ownerView') renderOwnerPanel();
  if (viewId === 'masterView') {
    initMasterFormDefaults();
    loadSaasShopsList();
  }
}

document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
document.getElementById('openPurchaseNavBtn').addEventListener('click', () => requireAuth('owner', () => switchView('purchaseView')));
document.getElementById('openOwnerNavBtn').addEventListener('click', () => requireAuth('owner', () => switchView('ownerView')));
document.getElementById('openMasterNavBtn').addEventListener('click', () => requireAuth('master', () => switchView('masterView')));

document.getElementById('lockOwnerBtn').addEventListener('click', () => {
  isOwnerUnlocked = false;
  switchView('posView');
  showToast('Akses Pemilik Kedai dikunci.');
});
document.getElementById('lockMasterBtn').addEventListener('click', () => {
  isMasterUnlocked = false;
  switchView('posView');
  showToast('Akses Master Admin dikunci.');
});

// --- Catalog & Cart (Jualan) ---
function renderCategories() {
  const cats = ['Semua', ...new Set(state.products.map(p => p.category || 'Umum'))];
  document.getElementById('categoryBar').innerHTML = cats.map(c =>
    `<button class="cat-pill ${c === activeCategory ? 'active' : ''}" onclick="selectCategory('${c.replace(/'/g, "\\'")}')">${c}</button>`
  ).join('');
}

window.selectCategory = function(cat) {
  activeCategory = cat;
  renderCategories();
  renderProducts();
};

function renderProducts() {
  const q = document.getElementById('barcodeSearchInput').value.trim().toLowerCase();
  const grid = document.getElementById('productGrid');
  const filtered = state.products.filter(p => {
    const matchCat = activeCategory === 'Semua' || p.category === activeCategory;
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px;font-weight:700;">Tiada produk ditemui.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="product-card" onclick="addToCart('${p.id}')">
      <div class="product-emoji">${p.icon || '📦'}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-meta">
        <span class="product-price">${formatRM(p.price)}</span>
        <span class="stock-badge ${p.stock <= (p.minStock || 5) ? 'low' : ''}">Stok: ${p.stock}</span>
      </div>
    </div>
  `).join('');
}

window.addToCart = function(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  if (prod.stock <= 0) {
    showToast(`Stok "${prod.name}" habis! Sila buat Belian Stok.`);
    playBeep(300, 0.14);
    return;
  }
  const existing = cart.find(c => c.id === prod.id);
  if (existing) existing.qty += 1;
  else cart.push({ id: prod.id, name: prod.name, costPrice: Number(prod.costPrice) || 0, price: Number(prod.price), qty: 1, note: '' });
  playBeep(940, 0.06);
  renderCart();
};

window.changeQty = function(idx, delta) {
  if (!cart[idx]) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  renderCart();
};

window.updateItemNote = function(idx, val) {
  if (cart[idx]) cart[idx].note = val;
};

function calculateTotals() {
  const subtotal = cart.reduce((acc, it) => acc + it.price * it.qty, 0);
  const totalCost = cart.reduce((acc, it) => acc + (Number(it.costPrice) || 0) * it.qty, 0);
  const discount = Math.max(0, parseFloat(document.getElementById('discountInput').value) || 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = afterDiscount * ((Number(state.settings.taxRate) || 0) / 100);
  const service = afterDiscount * ((Number(state.settings.serviceRate) || 0) / 100);
  const grandTotal = afterDiscount + tax + service;
  const profit = afterDiscount - totalCost;
  return { subtotal, totalCost, discount, tax, service, grandTotal, profit };
}

function renderCart() {
  document.getElementById('activeOrderLabel').textContent = activeTable ? `🍽️ Pesanan Aktif: ${activeTable}` : '🛍️ Jualan Kaunter / Walk-In';
  const list = document.getElementById('cartList');
  if (!cart.length) {
    list.innerHTML = `<div class="cart-empty">Troli kosong.<br>Imbas kod bar atau sentuh produk untuk mula.</div>`;
  } else {
    list.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <div class="cart-item-top">
          <div>
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-sub">${formatRM(item.price)} x ${item.qty}</div>
          </div>
          <strong style="color:#0369a1;">${formatRM(item.price * item.qty)}</strong>
        </div>
        <div class="cart-item-controls">
          <div class="qty-group">
            <button class="qty-btn" onclick="changeQty(${idx}, -1)">-</button>
            <strong style="min-width:22px;text-align:center;">${item.qty}</strong>
            <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
          </div>
          <input type="text" class="note-input" placeholder="Nota item..." value="${item.note || ''}" onchange="updateItemNote(${idx}, this.value)" />
        </div>
      </div>
    `).join('');
  }

  const t = calculateTotals();
  document.getElementById('sumSubtotal').textContent = formatRM(t.subtotal);
  document.getElementById('labelTax').textContent = `SST (${state.settings.taxRate}%)`;
  document.getElementById('sumTax').textContent = formatRM(t.tax);
  document.getElementById('labelService').textContent = `Caj Perkhidmatan (${state.settings.serviceRate}%)`;
  document.getElementById('sumService').textContent = formatRM(t.service);
  document.getElementById('sumGrandTotal').textContent = formatRM(t.grandTotal);
}

document.getElementById('barcodeSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const code = e.target.value.trim();
    if (!code) return;
    const exact = state.products.find(p => (p.barcode || '').toLowerCase() === code.toLowerCase());
    if (exact) { addToCart(exact.id); e.target.value = ''; renderProducts(); }
  }
});
document.getElementById('barcodeSearchInput').addEventListener('input', renderProducts);
document.getElementById('clearSearchBtn').addEventListener('click', () => { document.getElementById('barcodeSearchInput').value = ''; renderProducts(); });
document.getElementById('discountInput').addEventListener('input', renderCart);
document.getElementById('clearCartBtn').addEventListener('click', () => { cart = []; document.getElementById('discountInput').value = 0; renderCart(); });
document.getElementById('switchWalkInBtn').addEventListener('click', () => { activeTable = null; cart = []; document.getElementById('discountInput').value = 0; renderCart(); });

// =========================================================================
// MODUL PEMBELIAN STOK (STOCK PURCHASE / RESTOCK)
// =========================================================================
function renderPurchaseView() {
  // Amaran Stok Rendah
  const lowItems = state.products.filter(p => p.stock <= (p.minStock || 5));
  const banner = document.getElementById('lowStockBanner');
  if (lowItems.length) {
    banner.style.display = 'block';
    banner.innerHTML = `⚠️ AMARAN STOK RENDAH (${lowItems.length} produk): ` + lowItems.map(p => `${p.name} (Baki: ${p.stock})`).join(' • ');
  } else {
    banner.style.display = 'none';
  }

  // Dropdown Produk
  const sel = document.getElementById('purProductSelect');
  sel.innerHTML = state.products.map(p =>
    `<option value="${p.id}" data-cost="${p.costPrice || 0}">${p.icon || '📦'} ${p.name} (Stok: ${p.stock} | Modal: ${formatRM(p.costPrice || 0)})</option>`
  ).join('');
  updateSelectedPurCost();
  renderPurchaseCart();

  // Sejarah Belian
  const tbody = document.getElementById('purchaseHistoryBody');
  if (!state.purchases.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);">Belum ada rekod pembelian stok.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.purchases.map(p => `
    <tr>
      <td><strong>${p.purchaseNo}</strong></td>
      <td>${p.date}</td>
      <td><strong>${p.supplierName}</strong><br><small style="color:var(--muted);">Ruj: ${p.refNo}</small></td>
      <td>${(p.items || []).map(it => `${it.name} (+${it.qty})`).join('<br>')}</td>
      <td>${p.paymentMethod}</td>
      <td><strong style="color:#b45309;">${formatRM(p.totalCost)}</strong></td>
    </tr>
  `).join('');
}

function updateSelectedPurCost() {
  const sel = document.getElementById('purProductSelect');
  const opt = sel.options[sel.selectedIndex];
  if (opt) document.getElementById('purUnitCost').value = Number(opt.dataset.cost || 0).toFixed(2);
}
document.getElementById('purProductSelect').addEventListener('change', updateSelectedPurCost);

document.getElementById('addPurItemBtn').addEventListener('click', () => {
  const prodId = document.getElementById('purProductSelect').value;
  const prod = state.products.find(p => p.id === prodId);
  const qty = Math.max(1, parseInt(document.getElementById('purQty').value) || 1);
  const unitCost = Math.max(0, parseFloat(document.getElementById('purUnitCost').value) || 0);
  if (!prod) return;

  const existing = purchaseCart.find(x => x.id === prod.id);
  if (existing) {
    existing.qty += qty;
    existing.unitCost = unitCost;
  } else {
    purchaseCart.push({ id: prod.id, name: prod.name, qty, unitCost });
  }
  renderPurchaseCart();
});

function renderPurchaseCart() {
  const list = document.getElementById('purCartList');
  if (!purchaseCart.length) {
    list.innerHTML = `<small style="color:var(--muted);text-align:center;padding:8px;">Belum ada item dalam senarai belian.</small>`;
    document.getElementById('purGrandTotal').textContent = 'RM 0.00';
    return;
  }
  let total = 0;
  list.innerHTML = purchaseCart.map((it, idx) => {
    const lineTotal = it.qty * it.unitCost;
    total += lineTotal;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f0f9ff;padding:7px 10px;border-radius:9px;border:1px solid #bae6fd;font-size:12.5px;">
        <span><strong>${it.name}</strong> (+${it.qty} x ${formatRM(it.unitCost)})</span>
        <span><strong>${formatRM(lineTotal)}</strong> <button onclick="removePurItem(${idx})" style="border:none;background:none;color:var(--danger);cursor:pointer;font-weight:900;margin-left:6px;">✕</button></span>
      </div>
    `;
  }).join('');
  document.getElementById('purGrandTotal').textContent = formatRM(total);
}

window.removePurItem = function(idx) {
  purchaseCart.splice(idx, 1);
  renderPurchaseCart();
};

document.getElementById('savePurchaseBtn').addEventListener('click', async () => {
  if (!purchaseCart.length) return showToast('Sila tambah sekurang-kurangnya 1 produk belian!');
  const supplierName = document.getElementById('purSupplier').value.trim() || 'Pembekal Umum';
  const refNo = document.getElementById('purRefNo').value.trim() || '-';
  const paymentMethod = document.getElementById('purPayMethod').value;
  const notes = document.getElementById('purNotes').value.trim();
  const totalCost = purchaseCart.reduce((s, it) => s + it.qty * it.unitCost, 0);

  const stockUpdates = [];
  purchaseCart.forEach(it => {
    const prod = state.products.find(p => p.id === it.id);
    if (prod) {
      prod.stock = (Number(prod.stock) || 0) + it.qty;
      if (it.unitCost > 0) prod.costPrice = it.unitCost;
      stockUpdates.push({ id: prod.id, newStock: prod.stock, newCostPrice: prod.costPrice });
    }
  });

  const purchaseRec = {
    purchaseNo: 'PO-' + Date.now().toString().slice(-6),
    date: new Date().toLocaleString('ms-MY'),
    supplierName, refNo, paymentMethod, totalCost, notes,
    items: structuredClone(purchaseCart)
  };

  state.purchases.unshift(purchaseRec);
  purchaseCart = [];
  document.getElementById('purSupplier').value = '';
  document.getElementById('purRefNo').value = '';
  document.getElementById('purNotes').value = '';
  saveLocalState();
  renderPurchaseView();
  renderProducts();
  playBeep(1100, 0.1);
  showToast(`✅ Belian ${purchaseRec.purchaseNo} disimpan & stok berjaya ditambah!`);

  try { await apiPost({ action: 'savePurchase', purchase: purchaseRec, stockUpdates }); } catch (_) {}
});

document.getElementById('exportPurchaseCsvBtn').addEventListener('click', () => {
  if (!state.purchases.length) return showToast('Tiada rekod belian stok.');
  const rows = [['No Belian', 'Tarikh', 'Pembekal', 'No Rujukan', 'Kaedah Bayaran', 'Jumlah Kos (RM)', 'Item']];
  state.purchases.forEach(p => {
    const itemsStr = (p.items || []).map(i => `${i.name} x${i.qty} @${i.unitCost}`).join(' | ');
    rows.push([p.purchaseNo, `"${p.date}"`, `"${p.supplierName}"`, `"${p.refNo}"`, `"${p.paymentMethod}"`, p.totalCost.toFixed(2), `"${itemsStr}"`]);
  });
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Rekod_Belian_Stok_${CURRENT_SHOP_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

// =========================================================================
// MOD PELAYAN & DAPUR (KDS)
// =========================================================================
document.getElementById('sendToKitchenBtn').addEventListener('click', async () => {
  if (!cart.length) return showToast('Sila pilih menu dahulu.');
  const targetName = activeTable || prompt('Masukkan Nombor Meja / Nama Pelanggan (cth: Meja 1):', 'Meja 1');
  if (!targetName) return;

  activeTable = targetName.trim();
  const nowStr = new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
  const kdsId = 'KDS-' + Date.now().toString().slice(-5);

  state.tables[activeTable] = { status: 'occupied', items: structuredClone(cart), updatedAt: nowStr };
  state.kdsOrders.unshift({ id: kdsId, table: activeTable, items: structuredClone(cart), time: nowStr, status: 'pending' });
  saveLocalState();
  updateKdsBadge();
  playBeep(1100, 0.12);
  try { await apiPost({ action: 'saveTableAndKds', tableName: activeTable, items: cart, time: nowStr, kdsId }); } catch (_) {}

  showToast(`Pesanan ${activeTable} dihantar ke Dapur & Kaunter!`);
  if (confirm(`Mahu cetak Tiket Dapur (KOT) untuk ${activeTable}?`)) printKOT(activeTable, cart);

  activeTable = null;
  cart = [];
  renderCart();
  renderTables();
});

function renderTables() {
  const grid = document.getElementById('tablesGrid');
  const count = Number(state.settings.tableCount) || 12;
  let html = '';
  for (let i = 1; i <= count; i++) {
    const tName = `Meja ${i}`;
    const data = state.tables[tName];
    const status = data ? data.status : 'free';
    const itemCount = data ? data.items.reduce((s, it) => s + it.qty, 0) : 0;
    const total = data ? data.items.reduce((s, it) => s + it.qty * it.price, 0) : 0;
    const statusLabel = status === 'free' ? 'Kosong' : (status === 'billing' ? 'Sedia Bayar' : 'Ada Pesanan');
    html += `
      <div class="table-card ${status}" onclick="openTableModal('${tName}')">
        <div class="table-num">🍽️ ${tName}</div>
        <div class="table-status">${statusLabel}</div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;">
          ${data ? `${itemCount} item • <strong>${formatRM(total)}</strong><br>Masa: ${data.updatedAt}` : 'Sentuh untuk ambil pesanan'}
        </div>
      </div>
    `;
  }
  grid.innerHTML = html;
}

window.openTableModal = function(tName) {
  selectedTableForModal = tName;
  const data = state.tables[tName];
  document.getElementById('tableModalTitle').textContent = `🍽️ ${tName}`;
  if (data && data.items.length) {
    const total = data.items.reduce((s, it) => s + it.qty * it.price, 0);
    document.getElementById('tableModalSummary').innerHTML =
      `<strong>${data.items.length} menu</strong> (${formatRM(total)})<br>` +
      data.items.map(it => `• ${it.name} x${it.qty}`).join('<br>');
  } else {
    document.getElementById('tableModalSummary').textContent = 'Meja ini masih kosong.';
  }
  document.getElementById('tableActionModal').classList.add('open');
};

document.getElementById('tableTakeOrderBtn').addEventListener('click', () => {
  activeTable = selectedTableForModal;
  cart = state.tables[activeTable] ? structuredClone(state.tables[activeTable].items) : [];
  document.getElementById('tableActionModal').classList.remove('open');
  switchView('posView');
  renderCart();
});
document.getElementById('tablePrintKotBtn').addEventListener('click', () => {
  const data = state.tables[selectedTableForModal];
  if (!data || !data.items.length) return showToast('Tiada pesanan.');
  printKOT(selectedTableForModal, data.items);
});
document.getElementById('tableGoPayBtn').addEventListener('click', () => {
  const data = state.tables[selectedTableForModal];
  if (!data || !data.items.length) return showToast('Tiada pesanan.');
  activeTable = selectedTableForModal;
  cart = structuredClone(data.items);
  document.getElementById('tableActionModal').classList.remove('open');
  switchView('posView');
  renderCart();
  openPaymentModal();
});
document.getElementById('tableClearBtn').addEventListener('click', async () => {
  if (!confirm(`Kosongkan ${selectedTableForModal}?`)) return;
  delete state.tables[selectedTableForModal];
  saveLocalState();
  document.getElementById('tableActionModal').classList.remove('open');
  renderTables();
  try { await apiPost({ action: 'clearTable', tableName: selectedTableForModal }); } catch (_) {}
});
document.getElementById('closeTableModalBtn').addEventListener('click', () => document.getElementById('tableActionModal').classList.remove('open'));

function updateKdsBadge() {
  const pending = state.kdsOrders.filter(o => o.status === 'pending').length;
  document.getElementById('kdsBadge').textContent = pending > 0 ? `(${pending})` : '';
}

function renderKDS() {
  const grid = document.getElementById('kdsGrid');
  const activeOrders = state.kdsOrders.filter(o => o.status === 'pending');
  if (!activeOrders.length) {
    grid.innerHTML = `<div class="card-box" style="grid-column:1/-1;text-align:center;color:var(--muted);">🎉 Semua pesanan dapur telah disiapkan!</div>`;
    return;
  }
  grid.innerHTML = activeOrders.map(o => `
    <div class="kds-card">
      <div style="display:flex;justify-content:space-between;">
        <strong style="font-size:16px;color:#0369a1;">🍽️ ${o.table}</strong>
        <small style="color:var(--muted);font-weight:700;">${o.id} • ${o.time}</small>
      </div>
      <div>${o.items.map(it => `<div class="kds-item"><span><strong>${it.qty}x</strong> ${it.name} ${it.note ? `<br><small style="color:#b45309;">Nota: ${it.note}</small>` : ''}</span></div>`).join('')}</div>
      <button class="btn btn-success" onclick="completeKdsOrder('${o.id}', '${o.table.replace(/'/g, "\\'")}')">✅ Siap Dihidang</button>
    </div>
  `).join('');
}

window.completeKdsOrder = async function(orderId, tableName) {
  const ord = state.kdsOrders.find(o => o.id === orderId);
  if (ord) {
    ord.status = 'done';
    if (state.tables[ord.table]) state.tables[ord.table].status = 'billing';
    saveLocalState();
    updateKdsBadge();
    renderKDS();
    try { await apiPost({ action: 'completeKds', orderId, tableName }); } catch (_) {}
  }
};
document.getElementById('refreshKdsBtn').addEventListener('click', () => syncFromCloud(false));

// =========================================================================
// PEMBAYARAN & CETAKAN RESIT
// =========================================================================
function openPaymentModal() {
  if (!cart.length) return showToast('Troli kosong!');
  const t = calculateTotals();
  document.getElementById('payModalTotal').textContent = formatRM(t.grandTotal);
  document.getElementById('cashReceivedInput').value = t.grandTotal.toFixed(2);
  updateCashChange();

  const qrImg = document.getElementById('shopQrImage');
  const noQr = document.getElementById('noQrMsg');
  if (state.settings.qrImage) { qrImg.src = state.settings.qrImage; qrImg.style.display = 'block'; noQr.style.display = 'none'; }
  else { qrImg.style.display = 'none'; noQr.style.display = 'block'; }
  document.getElementById('payModal').classList.add('open');
}

document.getElementById('checkoutBtn').addEventListener('click', openPaymentModal);
document.getElementById('closePayModalBtn').addEventListener('click', () => document.getElementById('payModal').classList.remove('open'));
document.querySelectorAll('.pay-method-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedPaymentMethod = btn.dataset.method;
    document.getElementById('cashSection').style.display = selectedPaymentMethod === 'Tunai' ? 'block' : 'none';
    document.getElementById('qrPreviewSection').style.display = selectedPaymentMethod.includes('QR') ? 'block' : 'none';
  });
});

function updateCashChange() {
  const t = calculateTotals();
  const recv = parseFloat(document.getElementById('cashReceivedInput').value) || 0;
  const change = recv - t.grandTotal;
  const disp = document.getElementById('cashChangeDisplay');
  disp.textContent = formatRM(Math.max(0, change));
  disp.style.color = change < 0 ? 'var(--danger)' : 'var(--success-deep)';
}
document.getElementById('cashReceivedInput').addEventListener('input', updateCashChange);
document.querySelectorAll('.quick-cash button').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = calculateTotals();
    document.getElementById('cashReceivedInput').value = (btn.dataset.cash === 'exact' ? t.grandTotal : parseFloat(btn.dataset.cash)).toFixed(2);
    updateCashChange();
  });
});

document.getElementById('confirmPayBtn').addEventListener('click', async () => {
  const t = calculateTotals();
  const cashReceived = selectedPaymentMethod === 'Tunai' ? (parseFloat(document.getElementById('cashReceivedInput').value) || 0) : t.grandTotal;
  if (selectedPaymentMethod === 'Tunai' && cashReceived < t.grandTotal - 0.001) return showToast('Wang diterima tidak mencukupi!');

  const stockUpdates = [];
  cart.forEach(item => {
    const prod = state.products.find(p => p.id === item.id);
    if (prod && prod.stock > 0) {
      prod.stock = Math.max(0, prod.stock - item.qty);
      stockUpdates.push({ id: prod.id, newStock: prod.stock });
    }
  });

  const receipt = {
    receiptNo: 'INV-' + Date.now().toString().slice(-6),
    date: new Date().toLocaleString('ms-MY'),
    orderType: activeTable || 'Walk-In / Kaunter',
    paymentMethod: selectedPaymentMethod,
    subtotal: t.subtotal,
    discount: t.discount,
    tax: t.tax,
    service: t.service,
    total: t.grandTotal,
    totalCost: t.totalCost,
    profit: t.profit,
    cashReceived,
    change: Math.max(0, cashReceived - t.grandTotal),
    items: structuredClone(cart)
  };

  state.sales.unshift(receipt);
  if (activeTable && state.tables[activeTable]) delete state.tables[activeTable];
  saveLocalState();
  document.getElementById('payModal').classList.remove('open');

  printReceipt(receipt);
  try { await apiPost({ action: 'saveSale', receipt, stockUpdates }); } catch (_) {}

  activeTable = null;
  cart = [];
  document.getElementById('discountInput').value = 0;
  renderCart();
  renderProducts();
  showToast(`Transaksi ${receipt.receiptNo} selesai!`);
});

function printReceipt(r) {
  const s = state.settings;
  const area = document.getElementById('printArea');
  area.className = s.paperSize === '58' ? 'paper-58' : '';
  area.innerHTML = `
    <div class="rc-center rc-bold" style="font-size:14px;">${s.shopName}</div>
    <div class="rc-center">${s.shopAddress}</div>
    <div class="rc-center">Tel: ${s.shopPhone}</div>
    <div class="rc-line"></div>
    <div>No Resit : ${r.receiptNo}</div>
    <div>Tarikh   : ${r.date}</div>
    <div>Jenis    : ${r.orderType}</div>
    <div class="rc-line"></div>
    ${r.items.map(it => `<div class="rc-row"><span>${it.name} x${it.qty}</span><span>${(it.price * it.qty).toFixed(2)}</span></div>`).join('')}
    <div class="rc-line"></div>
    <div class="rc-row"><span>Subjumlah</span><span>${formatRM(r.subtotal)}</span></div>
    ${r.discount > 0 ? `<div class="rc-row"><span>Diskaun</span><span>-${formatRM(r.discount)}</span></div>` : ''}
    ${r.tax > 0 ? `<div class="rc-row"><span>SST (${s.taxRate}%)</span><span>${formatRM(r.tax)}</span></div>` : ''}
    ${r.service > 0 ? `<div class="rc-row"><span>Caj Perkhidmatan</span><span>${formatRM(r.service)}</span></div>` : ''}
    <div class="rc-row rc-bold" style="font-size:14px;"><span>JUMLAH</span><span>${formatRM(r.total)}</span></div>
    <div class="rc-line"></div>
    <div class="rc-row"><span>Bayaran (${r.paymentMethod})</span><span>${formatRM(r.cashReceived)}</span></div>
    <div class="rc-row"><span>Baki</span><span>${formatRM(r.change)}</span></div>
    <div class="rc-line"></div>
    <div class="rc-center" style="margin-top:6px;">${s.receiptFooter}</div>
  `;
  window.print();
}

function printKOT(tableName, items) {
  const area = document.getElementById('printArea');
  area.className = state.settings.paperSize === '58' ? 'paper-58' : '';
  area.innerHTML = `
    <div class="rc-center rc-bold" style="font-size:15px;">*** TIKET DAPUR (KOT) ***</div>
    <div class="rc-center rc-bold" style="font-size:14px;margin:4px 0;">${tableName}</div>
    <div class="rc-center">${new Date().toLocaleString('ms-MY')}</div>
    <div class="rc-line"></div>
    ${items.map(it => `<div style="font-size:13px;margin:4px 0;"><strong>[ ${it.qty}x ] ${it.name}</strong>${it.note ? `<div>--> NOTA: ${it.note}</div>` : ''}</div>`).join('')}
    <div class="rc-line"></div>
  `;
  window.print();
}

// =========================================================================
// LAPORAN BERSEPADU (JUALAN + BELIAN STOK + UNTUNG KASAR)
// =========================================================================
function renderReports() {
  const totalSales = state.sales.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const totalGrossProfit = state.sales.reduce((s, r) => s + (Number(r.profit) || 0), 0);
  const totalPurchases = state.purchases.reduce((s, p) => s + (Number(p.totalCost) || 0), 0);
  const netCashFlow = totalSales - totalPurchases;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><small>Jumlah Jualan (${state.sales.length} resit)</small><h2>${formatRM(totalSales)}</h2></div>
    <div class="stat-card"><small>Jumlah Belian Stok (${state.purchases.length} bil)</small><h2 style="color:#b45309;">${formatRM(totalPurchases)}</h2></div>
    <div class="stat-card"><small>Anggaran Untung Kasar Jualan</small><h2 class="profit-positive">${formatRM(totalGrossProfit)}</h2></div>
    <div class="stat-card"><small>Aliran Tunai Bersih (Jualan - Belian)</small><h2 class="${netCashFlow >= 0 ? 'profit-positive' : 'profit-negative'}">${formatRM(netCashFlow)}</h2></div>
  `;

  const tbody = document.getElementById('salesTableBody');
  if (!state.sales.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);">Belum ada rekod jualan.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.sales.map((r, idx) => `
    <tr>
      <td><strong>${r.receiptNo}</strong></td>
      <td>${r.date}</td>
      <td>${r.orderType}</td>
      <td>${r.paymentMethod}</td>
      <td><strong>${formatRM(r.total)}</strong></td>
      <td class="profit-positive"><strong>${formatRM(r.profit || 0)}</strong></td>
      <td>
        <button class="btn btn-outline" style="padding:5px 8px;font-size:11px;" onclick="reprintSale(${idx})">🖨️</button>
        <button class="btn btn-danger" style="padding:5px 8px;font-size:11px;" onclick="voidSale(${idx})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

window.reprintSale = idx => state.sales[idx] && printReceipt(state.sales[idx]);
window.voidSale = idx => {
  requireAuth('owner', async () => {
    if (!confirm('Padam/Void transaksi ini?')) return;
    const rec = state.sales[idx];
    state.sales.splice(idx, 1);
    saveLocalState();
    renderReports();
    try { await apiPost({ action: 'voidSale', receiptNo: rec.receiptNo }); } catch (_) {}
    showToast('Transaksi dibatalkan.');
  });
};

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!state.sales.length) return showToast('Tiada data jualan.');
  const rows = [['No Resit', 'Tarikh', 'Jenis/Meja', 'Kaedah Bayaran', 'Jualan (RM)', 'Kos Modal (RM)', 'Untung Kasar (RM)']];
  state.sales.forEach(r => rows.push([r.receiptNo, `"${r.date}"`, `"${r.orderType}"`, `"${r.paymentMethod}"`, r.total.toFixed(2), (r.totalCost || 0).toFixed(2), (r.profit || 0).toFixed(2)]));
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Laporan_Jualan_${CURRENT_SHOP_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

// =========================================================================
// PANEL PEMILIK KEDAI (DILINDUNGI PASSWORD OWNER)
// =========================================================================
function renderOwnerPanel() {
  const s = state.settings;
  document.getElementById('setShopName').value = s.shopName;
  document.getElementById('setShopType').value = s.shopType || 'UNIVERSAL';
  document.getElementById('setShopAddress').value = s.shopAddress;
  document.getElementById('setShopPhone').value = s.shopPhone;
  document.getElementById('setPaperSize').value = s.paperSize;
  document.getElementById('setTaxRate').value = s.taxRate;
  document.getElementById('setServiceRate').value = s.serviceRate;
  document.getElementById('setTableCount').value = s.tableCount;
  document.getElementById('setReceiptFooter').value = s.receiptFooter;

  document.getElementById('adminProductTable').innerHTML = state.products.map(p => `
    <tr>
      <td style="font-size:20px;">${p.icon || '📦'}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.barcode || '-'}</td>
      <td>${p.category}</td>
      <td>${formatRM(p.costPrice || 0)}</td>
      <td><strong>${formatRM(p.price)}</strong></td>
      <td><span class="stock-badge ${p.stock <= (p.minStock || 5) ? 'low' : ''}">${p.stock}</span></td>
      <td>
        <button class="btn btn-outline" style="padding:4px 8px;font-size:11px;" onclick="editProduct('${p.id}')">✏️</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="deleteProduct('${p.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('setQrUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { state.settings.qrImage = reader.result; saveLocalState(); showToast('QR dimuat naik! Klik Simpan Tetapan.'); };
  reader.readAsDataURL(file);
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  state.settings.shopName = document.getElementById('setShopName').value.trim() || 'POS 3D PRO';
  state.settings.shopType = document.getElementById('setShopType').value;
  state.settings.shopAddress = document.getElementById('setShopAddress').value.trim();
  state.settings.shopPhone = document.getElementById('setShopPhone').value.trim();
  state.settings.paperSize = document.getElementById('setPaperSize').value;
  state.settings.taxRate = parseFloat(document.getElementById('setTaxRate').value) || 0;
  state.settings.serviceRate = parseFloat(document.getElementById('setServiceRate').value) || 0;
  state.settings.tableCount = Math.max(1, parseInt(document.getElementById('setTableCount').value) || 12);
  state.settings.receiptFooter = document.getElementById('setReceiptFooter').value.trim();
  saveLocalState();
  refreshAllUI();
  try { await apiPost({ action: 'saveSettings', settings: state.settings }); } catch (_) {}
  showToast('✅ Tetapan kedai disimpan!');
});

document.getElementById('saveProductBtn').addEventListener('click', async () => {
  const editId = document.getElementById('prodEditId').value;
  const name = document.getElementById('prodName').value.trim();
  const barcode = document.getElementById('prodBarcode').value.trim();
  const category = document.getElementById('prodCategory').value.trim() || 'Umum';
  const costPrice = parseFloat(document.getElementById('prodCostPrice').value) || 0;
  const price = parseFloat(document.getElementById('prodPrice').value) || 0;
  const stock = parseInt(document.getElementById('prodStock').value) || 0;
  const minStock = parseInt(document.getElementById('prodMinStock').value) || 5;
  const icon = document.getElementById('prodIcon').value.trim() || '📦';
  if (!name) return showToast('Sila masukkan nama produk!');

  let prodObj;
  if (editId) {
    prodObj = state.products.find(x => x.id === editId);
    if (prodObj) Object.assign(prodObj, { name, barcode, category, costPrice, price, stock, minStock, icon });
  } else {
    prodObj = { id: 'P' + Date.now().toString().slice(-5), name, barcode, category, costPrice, price, stock, minStock, icon };
    state.products.push(prodObj);
  }
  saveLocalState();
  resetProductForm();
  renderOwnerPanel();
  renderCategories();
  renderProducts();
  try { await apiPost({ action: 'saveProduct', product: prodObj }); } catch (_) {}
  showToast('✅ Produk disimpan!');
});

window.editProduct = function(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('prodEditId').value = p.id;
  document.getElementById('prodName').value = p.name;
  document.getElementById('prodBarcode').value = p.barcode || '';
  document.getElementById('prodCategory').value = p.category;
  document.getElementById('prodCostPrice').value = p.costPrice || 0;
  document.getElementById('prodPrice').value = p.price;
  document.getElementById('prodStock').value = p.stock;
  document.getElementById('prodMinStock').value = p.minStock || 5;
  document.getElementById('prodIcon').value = p.icon || '📦';
};

window.deleteProduct = async function(id) {
  if (!confirm('Padam produk ini?')) return;
  state.products = state.products.filter(p => p.id !== id);
  saveLocalState();
  renderOwnerPanel();
  renderCategories();
  renderProducts();
  try { await apiPost({ action: 'deleteProduct', productId: id }); } catch (_) {}
  showToast('Produk dipadam.');
};

function resetProductForm() {
  ['prodEditId', 'prodName', 'prodBarcode', 'prodCategory', 'prodCostPrice', 'prodPrice'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('prodStock').value = '50';
  document.getElementById('prodMinStock').value = '5';
  document.getElementById('prodIcon').value = '📦';
}
document.getElementById('resetProdFormBtn').addEventListener('click', resetProductForm);

document.getElementById('exportBackupBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `POS_Backup_${CURRENT_SHOP_ID}.json`;
  a.click();
});
document.getElementById('importBackupInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imp = JSON.parse(reader.result);
      if (!imp.settings || !imp.products) throw new Error();
      state = imp; saveLocalState(); refreshAllUI(); showToast('Backup dipulihkan!');
    } catch (_) { showToast('Fail backup tidak sah!'); }
  };
  reader.readAsText(file);
});

// =========================================================================
// PANEL MASTER ADMIN SAAS (JANA URL + PASSWORD AUTO / MANUAL)
// =========================================================================
function initMasterFormDefaults() {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  if (!document.getElementById('newShopExpiry').value) {
    document.getElementById('newShopExpiry').value = nextYear.toISOString().slice(0, 10);
  }
  if (passGenMode === 'auto' && !document.getElementById('newShopOwnerPass').value) {
    document.getElementById('newShopOwnerPass').value = generateRandomPass(6);
  }
}

document.getElementById('passModeAutoBtn').addEventListener('click', () => {
  passGenMode = 'auto';
  document.getElementById('passModeAutoBtn').classList.add('active');
  document.getElementById('passModeManualBtn').classList.remove('active');
  const inp = document.getElementById('newShopOwnerPass');
  inp.readOnly = true;
  inp.value = generateRandomPass(6);
  document.getElementById('regenPassBtn').style.display = 'inline-flex';
});

document.getElementById('passModeManualBtn').addEventListener('click', () => {
  passGenMode = 'manual';
  document.getElementById('passModeManualBtn').classList.add('active');
  document.getElementById('passModeAutoBtn').classList.remove('active');
  const inp = document.getElementById('newShopOwnerPass');
  inp.readOnly = false;
  inp.value = '';
  inp.placeholder = 'Taip kata laluan pemilik...';
  inp.focus();
  document.getElementById('regenPassBtn').style.display = 'none';
});

document.getElementById('regenPassBtn').addEventListener('click', () => {
  document.getElementById('newShopOwnerPass').value = generateRandomPass(6);
});

function buildShopLinks(shopCode) {
  const base = window.location.origin + window.location.pathname;
  return {
    main: `${base}?kedai=${encodeURIComponent(shopCode)}`,
    waiter: `${base}?kedai=${encodeURIComponent(shopCode)}&mod=pelayan`,
    kds: `${base}?kedai=${encodeURIComponent(shopCode)}&mod=dapur`
  };
}

document.getElementById('generateShopLinkBtn').addEventListener('click', async () => {
  const rawCode = document.getElementById('newShopCode').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const shopCode = rawCode || ('KEDAI' + Date.now().toString().slice(-4));
  const shopType = document.getElementById('newShopType').value;
  const shopName = document.getElementById('newShopName').value.trim() || 'KEDAI BARU';
  const ownerName = document.getElementById('newShopOwner').value.trim();
  const phone = document.getElementById('newShopPhone').value.trim().replace(/[^0-9]/g, '');
  const expiryDate = document.getElementById('newShopExpiry').value || '2027-12-31';
  const ownerPassword = document.getElementById('newShopOwnerPass').value.trim() || generateRandomPass(6);

  if (ownerPassword.length < 4) return showToast('Kata laluan pemilik mesti sekurang-kurangnya 4 aksara.');

  if (IS_CLOUD_ENABLED) {
    showToast('Mendaftar kedai baru ke Google Sheets...');
    try {
      const res = await apiPost({
        action: 'registerShop',
        masterPass: MASTER_ADMIN_PASS,
        newShopId: shopCode,
        shopType, shopName, ownerName, phone, expiryDate, ownerPassword
      });
      if (res && !res.ok) return showToast('❌ ' + (res.error || 'Gagal daftar kedai.'));
    } catch (_) {
      return showToast('❌ Gagal sambung Google Sheets.');
    }
  }

  const links = buildShopLinks(shopCode);
  const isFnb = shopType === 'UNIVERSAL' || shopType === 'FNB';
  document.getElementById('resOwnerPass').textContent = ownerPassword;
  document.getElementById('resMainLink').textContent = links.main;
  document.getElementById('resWaiterLink').textContent = links.waiter;
  document.getElementById('resKdsLink').textContent = links.kds;
  document.getElementById('resFnbLinksWrap').style.display = isFnb ? 'block' : 'none';
  document.getElementById('generatedLinkResult').style.display = 'flex';

  lastGeneratedPhone = phone;
  lastGeneratedLinksText =
    `🎉 *SISTEM UNIVERSAL POS 3D PRO — ${shopName.toUpperCase()}*\n` +
    `Jenis Kedai: *${shopType}*\n` +
    `Kod Kedai: *${shopCode}*\n` +
    `🔑 *Password Edit Pemilik:* *${ownerPassword}*\n` +
    `Sah Sehingga: *${expiryDate}*\n\n` +
    `🛒 *Link Utama POS & Setup Kedai:*\n${links.main}\n` +
    (isFnb ? `\n🍽️ *Link Telefon Pelayan (Waiter):*\n${links.waiter}\n\n👨‍🍳 *Link Skrin Dapur (KDS):*\n${links.kds}\n` : '') +
    `\nGunakan Password Pemilik di atas untuk lengkapkan setup kedai, tambah produk & rekod belian stok!`;

  showToast(`✅ URL & Password kedai ${shopCode} berjaya dijana!`);
  if (passGenMode === 'auto') document.getElementById('newShopOwnerPass').value = generateRandomPass(6);
  loadSaasShopsList();
});

document.getElementById('copyMainLinkBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(lastGeneratedLinksText).then(() => showToast('📋 Mesej, URL & Password disalin!'));
});
document.getElementById('whatsappLinkBtn').addEventListener('click', () => {
  const num = lastGeneratedPhone ? (lastGeneratedPhone.startsWith('6') ? lastGeneratedPhone : '6' + lastGeneratedPhone) : '';
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(lastGeneratedLinksText)}`, '_blank');
});

async function loadSaasShopsList() {
  const tbody = document.getElementById('saasShopsTable');
  if (!IS_CLOUD_ENABLED) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#b45309;font-weight:700;">Masukkan WEB_APP_URL pada Baris ke-5 index.html untuk paparkan kedai daripada Google Sheets.</td></tr>`;
    return;
  }
  try {
    const res = await apiGet({ action: 'getAllShops', masterPass: MASTER_ADMIN_PASS });
    if (!res || !res.ok) return;
    tbody.innerHTML = res.shops.map(s => {
      const link = buildShopLinks(s.shopId).main;
      const isAktif = s.status === 'AKTIF';
      return `
        <tr>
          <td><strong>${s.shopId}</strong><br><small style="color:#0369a1;font-weight:700;">${s.shopType || 'UNIVERSAL'}</small></td>
          <td>${s.shopName}<br><small style="color:var(--muted);">Luput: ${String(s.expiryDate || '').slice(0, 10)}</small></td>
          <td><code style="background:#e0f2fe;padding:2px 6px;border-radius:5px;font-weight:800;">${s.ownerPassword || '-'}</code></td>
          <td><span class="stock-badge ${isAktif ? '' : 'low'}">${s.status}</span></td>
          <td style="display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn btn-outline" style="padding:4px 7px;font-size:11px;" onclick="copyQuickInfo('${link}', '${s.ownerPassword || ''}')">📋</button>
            <button class="btn ${isAktif ? 'btn-danger' : 'btn-success'}" style="padding:4px 7px;font-size:11px;" onclick="toggleShopStatus('${s.shopId}', '${isAktif ? 'GANTUNG' : 'AKTIF'}')">${isAktif ? 'Gantung' : 'Aktif'}</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (_) {}
}

window.copyQuickInfo = function(link, pass) {
  navigator.clipboard.writeText(`Link POS: ${link}\nPassword Pemilik: ${pass}`).then(() => showToast('📋 Link & Password pemilik disalin!'));
};

window.toggleShopStatus = async function(targetShopId, newStatus) {
  if (!confirm(`Tukar status kedai ${targetShopId} kepada ${newStatus}?`)) return;
  try {
    await apiPost({ action: 'updateShopStatus', masterPass: MASTER_ADMIN_PASS, targetShopId, status: newStatus });
    showToast(`Status ${targetShopId} ditukar ke ${newStatus}`);
    loadSaasShopsList();
  } catch (_) { showToast('Gagal kemas kini status.'); }
};
document.getElementById('refreshShopsBtn').addEventListener('click', loadSaasShopsList);

// --- Init ---
function updateClock() {
  document.getElementById('headerClock').textContent = new Date().toLocaleString('ms-MY', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function refreshAllUI() {
  document.getElementById('headerShopName').textContent = state.settings.shopName;
  document.getElementById('headerShopId').textContent = CURRENT_SHOP_ID;
  applyShopTypeUI();
  renderCategories();
  renderProducts();
  renderCart();
  updateKdsBadge();
}

document.getElementById('manualSyncBtn').addEventListener('click', () => syncFromCloud(false));
setInterval(updateClock, 1000);
updateClock();
refreshAllUI();
syncFromCloud(false);

setInterval(() => { if (IS_CLOUD_ENABLED) syncFromCloud(true); }, 15000);

if (INITIAL_MODE === 'pelayan') switchView('waiterView');
else if (INITIAL_MODE === 'dapur') switchView('kdsView');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
