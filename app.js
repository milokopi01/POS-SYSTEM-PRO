/* =========================================================
   UNIVERSAL POS PRO — KAUNTER RUNCIT & MOD PELAYAN RESTORAN
   Kata Laluan Lalai Master Admin: 101010
   ========================================================= */

const STORAGE_KEY = 'UNIVERSAL_POS_PRO_DATA_V1';

const DEFAULT_PRODUCTS = [
  { id: 'P001', barcode: '8880001', name: 'Nasi Lemak Ayam Berempah', category: 'Makanan', price: 9.50, stock: 50, icon: '🍛' },
  { id: 'P002', barcode: '8880002', name: 'Mee Goreng Mamak', category: 'Makanan', price: 7.50, stock: 50, icon: '🍜' },
  { id: 'P003', barcode: '8880003', name: 'Nasi Goreng Kampung', category: 'Makanan', price: 8.00, stock: 50, icon: '🍚' },
  { id: 'P004', barcode: '8880004', name: 'Roti Canai Kosong', category: 'Makanan', price: 2.00, stock: 100, icon: '🫓' },
  { id: 'P005', barcode: '8880005', name: 'Teh Tarik Kaw', category: 'Minuman', price: 3.00, stock: 100, icon: '☕' },
  { id: 'P006', barcode: '8880006', name: 'Milo Ais Dinosaur', category: 'Minuman', price: 5.50, stock: 80, icon: '🧋' },
  { id: 'P007', barcode: '8880007', name: 'Sirap Limau Ais', category: 'Minuman', price: 2.80, stock: 100, icon: '🍹' },
  { id: 'P008', barcode: '9556001', name: 'Air Mineral 500ml', category: 'Runcit', price: 1.50, stock: 120, icon: '💧' },
  { id: 'P009', barcode: '9556002', name: 'Roti Gardenia Krim', category: 'Runcit', price: 1.80, stock: 60, icon: '🍞' },
  { id: 'P010', barcode: '9556003', name: 'Biskut Crackers Pek', category: 'Runcit', price: 4.90, stock: 40, icon: '🍪' },
  { id: 'P011', barcode: '9556004', name: 'Minyak Masak 1kg', category: 'Runcit', price: 6.90, stock: 30, icon: '🧴' },
  { id: 'P012', barcode: '9556005', name: 'Gula Pasir 1kg', category: 'Runcit', price: 2.85, stock: 45, icon: '🛍️' }
];

const DEFAULT_STATE = {
  settings: {
    shopName: 'KEDAI SERBANEKA & KAFE PRO',
    shopAddress: 'No. 12, Jalan Utama, Selama, Perak',
    shopPhone: '012-3456789',
    paperSize: '80',
    taxRate: 0,
    serviceRate: 0,
    tableCount: 12,
    receiptFooter: 'Terima kasih! Sila datang lagi.',
    adminPassword: '101010',
    qrImage: '',
    syncUrl: '',
    darkMode: false
  },
  products: DEFAULT_PRODUCTS,
  tables: {},   // { "Meja 1": { status: 'occupied'|'billing', items: [...], updatedAt: '...' } }
  kdsOrders: [], // [{ id, table, items, time, status }]
  sales: []      // [{ receiptNo, date, orderType, paymentMethod, subtotal, discount, tax, service, total, cashReceived, change, items }]
};

let state = loadState();
let activeCategory = 'Semua';
let activeTable = null; // null = Walk-In, or "Meja X"
let cart = [];
let selectedPaymentMethod = 'Tunai';
let isAdminUnlocked = false;
let pendingAdminAction = null;
let selectedTableForModal = null;

// --- Storage Helpers ---
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
    };
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Audio Beep (Barcode & Notification) ---
function playBeep(freq = 880, duration = 0.08) {
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
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function formatRM(num) {
  return 'RM ' + (Number(num) || 0).toFixed(2);
}

// --- Clock & Theme ---
function updateClock() {
  const now = new Date();
  document.getElementById('headerClock').textContent = now.toLocaleString('ms-MY', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function applyTheme() {
  document.body.classList.toggle('dark-mode', !!state.settings.darkMode);
  document.getElementById('toggleThemeBtn').textContent = state.settings.darkMode ? '☀️ Cerah' : '🌙 Gelap';
}

// --- Navigation ---
function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if (btn) btn.classList.add('active');
  if (viewId === 'adminView') document.getElementById('openAdminNavBtn').classList.add('active');

  if (viewId === 'waiterView') renderTables();
  if (viewId === 'kdsView') renderKDS();
  if (viewId === 'reportView') renderReports();
  if (viewId === 'adminView') renderAdminPanel();
}

// --- Categories & Products ---
function renderCategories() {
  const cats = ['Semua', ...new Set(state.products.map(p => p.category || 'Lain-lain'))];
  const bar = document.getElementById('categoryBar');
  bar.innerHTML = cats.map(c =>
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
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px;">Tiada produk ditemui.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="product-card" onclick="addToCart('${p.id}')">
      <div class="product-emoji">${p.icon || '📦'}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-meta">
        <span class="product-price">${formatRM(p.price)}</span>
        <span class="stock-badge ${p.stock <= 5 ? 'low' : ''}">Stok: ${p.stock}</span>
      </div>
    </div>
  `).join('');
}

// --- Cart Logic ---
window.addToCart = function(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  if (prod.stock <= 0) {
    showToast(`Stok "${prod.name}" telah habis!`);
    playBeep(300, 0.15);
    return;
  }
  const existing = cart.find(c => c.id === prod.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: prod.id, name: prod.name, price: Number(prod.price), qty: 1, note: '' });
  }
  playBeep(920, 0.06);
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
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const discount = Math.max(0, parseFloat(document.getElementById('discountInput').value) || 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = afterDiscount * ((Number(state.settings.taxRate) || 0) / 100);
  const service = afterDiscount * ((Number(state.settings.serviceRate) || 0) / 100);
  const grandTotal = afterDiscount + tax + service;
  return { subtotal, discount, tax, service, grandTotal };
}

function renderCart() {
  const label = document.getElementById('activeOrderLabel');
  label.textContent = activeTable ? `🍽️ Pesanan Aktif: ${activeTable}` : '🛍️ Jualan Kaunter / Walk-In';

  const list = document.getElementById('cartList');
  if (!cart.length) {
    list.innerHTML = `<div class="cart-empty">Troli kosong.<br>Imbas kod bar atau klik produk untuk mula.</div>`;
  } else {
    list.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <div class="cart-item-top">
          <div>
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-sub">${formatRM(item.price)} x ${item.qty}</div>
          </div>
          <strong>${formatRM(item.price * item.qty)}</strong>
        </div>
        <div class="cart-item-controls">
          <div class="qty-group">
            <button class="qty-btn" onclick="changeQty(${idx}, -1)">-</button>
            <strong style="min-width:20px;text-align:center;">${item.qty}</strong>
            <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
          </div>
          <input type="text" class="note-input" placeholder="Nota (cth: kurang manis)" value="${item.note || ''}" onchange="updateItemNote(${idx}, this.value)" />
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

// --- Barcode Scanner Handling ---
document.getElementById('barcodeSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const code = e.target.value.trim();
    if (!code) return;
    const exact = state.products.find(p => (p.barcode || '').toLowerCase() === code.toLowerCase());
    if (exact) {
      addToCart(exact.id);
      e.target.value = '';
      renderProducts();
    }
  }
});

document.getElementById('barcodeSearchInput').addEventListener('input', renderProducts);
document.getElementById('clearSearchBtn').addEventListener('click', () => {
  document.getElementById('barcodeSearchInput').value = '';
  renderProducts();
});
document.getElementById('discountInput').addEventListener('input', renderCart);

document.getElementById('clearCartBtn').addEventListener('click', () => {
  cart = [];
  document.getElementById('discountInput').value = 0;
  renderCart();
});

document.getElementById('switchWalkInBtn').addEventListener('click', () => {
  activeTable = null;
  cart = [];
  document.getElementById('discountInput').value = 0;
  renderCart();
  showToast('Ditukar kepada mod Jualan Kaunter (Walk-In).');
});

// --- Waiter Mode & Kitchen (KDS) ---
document.getElementById('sendToKitchenBtn').addEventListener('click', () => {
  if (!cart.length) {
    showToast('Sila pilih menu dahulu sebelum hantar ke dapur.');
    return;
  }
  const targetName = activeTable || prompt('Masukkan Nombor Meja / Nama Pelanggan (cth: Meja 1 atau Bungkus):', 'Meja 1');
  if (!targetName) return;

  activeTable = targetName.trim();
  const nowStr = new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });

  state.tables[activeTable] = {
    status: 'occupied',
    items: structuredClone(cart),
    updatedAt: nowStr
  };

  state.kdsOrders.unshift({
    id: 'KDS-' + Date.now().toString().slice(-5),
    table: activeTable,
    items: structuredClone(cart),
    time: nowStr,
    status: 'pending'
  });

  saveState();
  updateKdsBadge();
  syncToCloudOptional('kds_order', { table: activeTable, items: cart, time: nowStr });
  showToast(`Pesanan ${activeTable} berjaya dihantar ke Dapur & Kaunter!`);
  playBeep(1100, 0.12);

  if (confirm(`Pesanan ${activeTable} disimpan. Mahu cetak Tiket Dapur (KOT) sekarang?`)) {
    printKOT(activeTable, cart);
  }

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
        <div style="font-size:12px;color:var(--muted);">
          ${data ? `${itemCount} item • <strong>${formatRM(total)}</strong><br>Kemaskini: ${data.updatedAt}` : 'Klik untuk ambil pesanan'}
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
      `<strong>${data.items.length} jenis menu</strong> (Anggaran: <strong>${formatRM(total)}</strong>)<br>` +
      data.items.map(it => `• ${it.name} x${it.qty} ${it.note ? `(${it.note})` : ''}`).join('<br>');
  } else {
    document.getElementById('tableModalSummary').textContent = 'Meja ini masih kosong. Klik "Ambil Pesanan" untuk mula.';
  }
  document.getElementById('tableActionModal').classList.add('open');
};

document.getElementById('tableTakeOrderBtn').addEventListener('click', () => {
  activeTable = selectedTableForModal;
  const existing = state.tables[activeTable];
  cart = existing ? structuredClone(existing.items) : [];
  document.getElementById('tableActionModal').classList.remove('open');
  switchView('posView');
  renderCart();
  showToast(`Mod ambil pesanan aktif untuk ${activeTable}`);
});

document.getElementById('tablePrintKotBtn').addEventListener('click', () => {
  const data = state.tables[selectedTableForModal];
  if (!data || !data.items.length) return showToast('Tiada pesanan pada meja ini.');
  printKOT(selectedTableForModal, data.items);
});

document.getElementById('tableGoPayBtn').addEventListener('click', () => {
  const data = state.tables[selectedTableForModal];
  if (!data || !data.items.length) return showToast('Tiada pesanan untuk dibayar.');
  activeTable = selectedTableForModal;
  cart = structuredClone(data.items);
  document.getElementById('tableActionModal').classList.remove('open');
  switchView('posView');
  renderCart();
  openPaymentModal();
});

document.getElementById('tableClearBtn').addEventListener('click', () => {
  if (!confirm(`Kosongkan pesanan untuk ${selectedTableForModal}?`)) return;
  delete state.tables[selectedTableForModal];
  saveState();
  document.getElementById('tableActionModal').classList.remove('open');
  renderTables();
  showToast(`${selectedTableForModal} telah dikosongkan.`);
});

document.getElementById('closeTableModalBtn').addEventListener('click', () => {
  document.getElementById('tableActionModal').classList.remove('open');
});

// --- KDS Logic ---
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
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>🍽️ ${o.table}</strong>
        <small style="color:var(--muted);">${o.id} • ${o.time}</small>
      </div>
      <div>
        ${o.items.map(it => `
          <div class="kds-item">
            <span><strong>${it.qty}x</strong> ${it.name} ${it.note ? `<br><small style="color:var(--warning);">Nota: ${it.note}</small>` : ''}</span>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-success" onclick="completeKdsOrder('${o.id}')">✅ Tandakan Siap Dihidang</button>
    </div>
  `).join('');
}

window.completeKdsOrder = function(orderId) {
  const ord = state.kdsOrders.find(o => o.id === orderId);
  if (ord) {
    ord.status = 'done';
    if (state.tables[ord.table]) state.tables[ord.table].status = 'billing';
    saveState();
    updateKdsBadge();
    renderKDS();
    showToast(`Pesanan ${ord.table} ditandakan siap!`);
  }
};
document.getElementById('refreshKdsBtn').addEventListener('click', renderKDS);

// --- Checkout & Payment Modal ---
function openPaymentModal() {
  if (!cart.length) {
    showToast('Troli kosong! Sila pilih produk terlebih dahulu.');
    return;
  }
  const t = calculateTotals();
  document.getElementById('payModalTotal').textContent = formatRM(t.grandTotal);
  document.getElementById('cashReceivedInput').value = t.grandTotal.toFixed(2);
  updateCashChange();

  // QR preview check
  const qrImg = document.getElementById('shopQrImage');
  const noQr = document.getElementById('noQrMsg');
  if (state.settings.qrImage) {
    qrImg.src = state.settings.qrImage;
    qrImg.style.display = 'block';
    noQr.style.display = 'none';
  } else {
    qrImg.style.display = 'none';
    noQr.style.display = 'block';
  }

  document.getElementById('payModal').classList.add('open');
}

document.getElementById('checkoutBtn').addEventListener('click', openPaymentModal);
document.getElementById('closePayModalBtn').addEventListener('click', () => {
  document.getElementById('payModal').classList.remove('open');
});

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
  disp.style.color = change < 0 ? 'var(--danger)' : 'var(--success)';
}

document.getElementById('cashReceivedInput').addEventListener('input', updateCashChange);
document.querySelectorAll('.quick-cash button').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = calculateTotals();
    const val = btn.dataset.cash === 'exact' ? t.grandTotal : parseFloat(btn.dataset.cash);
    document.getElementById('cashReceivedInput').value = val.toFixed(2);
    updateCashChange();
  });
});

document.getElementById('confirmPayBtn').addEventListener('click', () => {
  const t = calculateTotals();
  const cashReceived = selectedPaymentMethod === 'Tunai'
    ? (parseFloat(document.getElementById('cashReceivedInput').value) || 0)
    : t.grandTotal;

  if (selectedPaymentMethod === 'Tunai' && cashReceived < t.grandTotal - 0.001) {
    showToast('Jumlah wang diterima tidak mencukupi!');
    return;
  }

  // Deduct stock
  cart.forEach(item => {
    const prod = state.products.find(p => p.id === item.id);
    if (prod && prod.stock > 0) prod.stock = Math.max(0, prod.stock - item.qty);
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
    cashReceived,
    change: Math.max(0, cashReceived - t.grandTotal),
    items: structuredClone(cart)
  };

  state.sales.unshift(receipt);
  if (activeTable && state.tables[activeTable]) {
    delete state.tables[activeTable];
  }

  saveState();
  syncToCloudOptional('sale', receipt);
  document.getElementById('payModal').classList.remove('open');

  printReceipt(receipt);

  activeTable = null;
  cart = [];
  document.getElementById('discountInput').value = 0;
  renderCart();
  renderProducts();
  showToast(`Transaksi ${receipt.receiptNo} selesai!`);
});

// --- Thermal 80mm / 58mm Printing ---
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
    ${r.items.map(it => `
      <div class="rc-row">
        <span>${it.name} x${it.qty}</span>
        <span>${(it.price * it.qty).toFixed(2)}</span>
      </div>
      ${it.note ? `<div style="font-size:10px;">  * ${it.note}</div>` : ''}
    `).join('')}
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
    ${items.map(it => `
      <div style="font-size:13px;margin:4px 0;">
        <strong>[ ${it.qty}x ] ${it.name}</strong>
        ${it.note ? `<div>--> NOTA: ${it.note}</div>` : ''}
      </div>
    `).join('')}
    <div class="rc-line"></div>
  `;
  window.print();
}

// --- Reports & CSV Export ---
function renderReports() {
  const totalSales = state.sales.reduce((s, r) => s + r.total, 0);
  const cashTotal = state.sales.filter(r => r.paymentMethod === 'Tunai').reduce((s, r) => s + r.total, 0);
  const cashlessTotal = totalSales - cashTotal;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><small>Jumlah Jualan Keseluruhan</small><h2>${formatRM(totalSales)}</h2></div>
    <div class="stat-card"><small>Jumlah Transaksi</small><h2>${state.sales.length}</h2></div>
    <div class="stat-card"><small>Jualan Tunai</small><h2>${formatRM(cashTotal)}</h2></div>
    <div class="stat-card"><small>Jualan Tanpa Tunai (QR/Kad)</small><h2>${formatRM(cashlessTotal)}</h2></div>
  `;

  const tbody = document.getElementById('salesTableBody');
  if (!state.sales.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);">Belum ada rekod jualan.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.sales.map((r, idx) => `
    <tr>
      <td><strong>${r.receiptNo}</strong></td>
      <td>${r.date}</td>
      <td>${r.orderType}</td>
      <td>${r.paymentMethod}</td>
      <td><strong>${formatRM(r.total)}</strong></td>
      <td>
        <button class="btn btn-outline" style="padding:5px 8px;font-size:11px;" onclick="reprintSale(${idx})">🖨️ Cetak</button>
        <button class="btn btn-danger" style="padding:5px 8px;font-size:11px;" onclick="voidSale(${idx})">🗑️ Void</button>
      </td>
    </tr>
  `).join('');
}

window.reprintSale = function(idx) {
  if (state.sales[idx]) printReceipt(state.sales[idx]);
};

window.voidSale = function(idx) {
  requireAdmin(() => {
    if (!confirm('Padam/Void rekod transaksi ini?')) return;
    state.sales.splice(idx, 1);
    saveState();
    renderReports();
    showToast('Transaksi telah dibatalkan (Void).');
  });
};

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!state.sales.length) return showToast('Tiada data jualan untuk dieksport.');
  const rows = [['No Resit', 'Tarikh', 'Jenis/Meja', 'Kaedah Bayaran', 'Subjumlah', 'Diskaun', 'SST', 'Caj Perkhidmatan', 'Jumlah']];
  state.sales.forEach(r => {
    rows.push([r.receiptNo, `"${r.date}"`, `"${r.orderType}"`, `"${r.paymentMethod}"`, r.subtotal.toFixed(2), r.discount.toFixed(2), r.tax.toFixed(2), r.service.toFixed(2), r.total.toFixed(2)]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Laporan_Jualan_POS_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

// --- Master Admin Authentication (Password: 101010) ---
function requireAdmin(callback) {
  if (isAdminUnlocked) {
    callback();
    return;
  }
  pendingAdminAction = callback;
  document.getElementById('pinDisplay').value = '';
  document.getElementById('pinModal').classList.add('open');
  setTimeout(() => document.getElementById('pinDisplay').focus(), 100);
}

function verifyAdminPin() {
  const entered = document.getElementById('pinDisplay').value.trim();
  if (entered === state.settings.adminPassword) {
    isAdminUnlocked = true;
    document.getElementById('pinModal').classList.remove('open');
    showToast('Akses Master Admin berjaya disahkan!');
    playBeep(1200, 0.08);
    if (pendingAdminAction) {
      const fn = pendingAdminAction;
      pendingAdminAction = null;
      fn();
    }
  } else {
    showToast('Kata laluan Master Admin salah!');
    playBeep(260, 0.2);
    document.getElementById('pinDisplay').value = '';
  }
}

document.getElementById('openAdminNavBtn').addEventListener('click', () => {
  requireAdmin(() => switchView('adminView'));
});

document.getElementById('lockAdminBtn').addEventListener('click', () => {
  isAdminUnlocked = false;
  switchView('posView');
  showToast('Panel Master Admin telah dikunci.');
});

document.getElementById('adminNumpad').addEventListener('click', (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  const disp = document.getElementById('pinDisplay');
  if (key === 'C') disp.value = '';
  else if (key === 'OK') verifyAdminPin();
  else disp.value += key;
});

document.getElementById('pinDisplay').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') verifyAdminPin();
});

document.getElementById('closePinModalBtn').addEventListener('click', () => {
  document.getElementById('pinModal').classList.remove('open');
});

// --- Master Admin Panel Controls ---
function renderAdminPanel() {
  const s = state.settings;
  document.getElementById('setShopName').value = s.shopName;
  document.getElementById('setShopAddress').value = s.shopAddress;
  document.getElementById('setShopPhone').value = s.shopPhone;
  document.getElementById('setPaperSize').value = s.paperSize;
  document.getElementById('setTaxRate').value = s.taxRate;
  document.getElementById('setServiceRate').value = s.serviceRate;
  document.getElementById('setTableCount').value = s.tableCount;
  document.getElementById('setReceiptFooter').value = s.receiptFooter;
  document.getElementById('setSyncUrl').value = s.syncUrl || '';

  const tbody = document.getElementById('adminProductTable');
  tbody.innerHTML = state.products.map(p => `
    <tr>
      <td style="font-size:20px;">${p.icon || '📦'}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.barcode || '-'}</td>
      <td>${p.category}</td>
      <td>${formatRM(p.price)}</td>
      <td>${p.stock}</td>
      <td>
        <button class="btn btn-outline" style="padding:4px 8px;font-size:11px;" onclick="editProduct('${p.id}')">✏️ Edit</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="deleteProduct('${p.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('setQrUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.settings.qrImage = reader.result;
    saveState();
    showToast('Gambar DuitNow QR berjaya dimuat naik!');
  };
  reader.readAsDataURL(file);
});

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  state.settings.shopName = document.getElementById('setShopName').value.trim() || 'POS PRO';
  state.settings.shopAddress = document.getElementById('setShopAddress').value.trim();
  state.settings.shopPhone = document.getElementById('setShopPhone').value.trim();
  state.settings.paperSize = document.getElementById('setPaperSize').value;
  state.settings.taxRate = parseFloat(document.getElementById('setTaxRate').value) || 0;
  state.settings.serviceRate = parseFloat(document.getElementById('setServiceRate').value) || 0;
  state.settings.tableCount = Math.max(1, parseInt(document.getElementById('setTableCount').value) || 12);
  state.settings.receiptFooter = document.getElementById('setReceiptFooter').value.trim();
  state.settings.syncUrl = document.getElementById('setSyncUrl').value.trim();
  saveState();
  document.getElementById('headerShopName').textContent = state.settings.shopName;
  renderCart();
  showToast('Tetapan kedai berjaya disimpan!');
});

document.getElementById('saveProductBtn').addEventListener('click', () => {
  const editId = document.getElementById('prodEditId').value;
  const name = document.getElementById('prodName').value.trim();
  const barcode = document.getElementById('prodBarcode').value.trim();
  const category = document.getElementById('prodCategory').value.trim() || 'Umum';
  const price = parseFloat(document.getElementById('prodPrice').value) || 0;
  const stock = parseInt(document.getElementById('prodStock').value) || 0;
  const icon = document.getElementById('prodIcon').value.trim() || '📦';

  if (!name) return showToast('Sila masukkan nama produk!');

  if (editId) {
    const p = state.products.find(x => x.id === editId);
    if (p) Object.assign(p, { name, barcode, category, price, stock, icon });
  } else {
    state.products.push({ id: 'P' + Date.now().toString().slice(-5), name, barcode, category, price, stock, icon });
  }

  saveState();
  resetProductForm();
  renderAdminPanel();
  renderCategories();
  renderProducts();
  showToast('Produk berjaya disimpan!');
});

window.editProduct = function(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('prodEditId').value = p.id;
  document.getElementById('prodName').value = p.name;
  document.getElementById('prodBarcode').value = p.barcode || '';
  document.getElementById('prodCategory').value = p.category;
  document.getElementById('prodPrice').value = p.price;
  document.getElementById('prodStock').value = p.stock;
  document.getElementById('prodIcon').value = p.icon || '📦';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteProduct = function(id) {
  if (!confirm('Padam produk ini daripada sistem?')) return;
  state.products = state.products.filter(p => p.id !== id);
  saveState();
  renderAdminPanel();
  renderCategories();
  renderProducts();
  showToast('Produk dipadam.');
};

function resetProductForm() {
  document.getElementById('prodEditId').value = '';
  document.getElementById('prodName').value = '';
  document.getElementById('prodBarcode').value = '';
  document.getElementById('prodCategory').value = '';
  document.getElementById('prodPrice').value = '';
  document.getElementById('prodStock').value = '99';
  document.getElementById('prodIcon').value = '📦';
}
document.getElementById('resetProdFormBtn').addEventListener('click', resetProductForm);

document.getElementById('changePassBtn').addEventListener('click', () => {
  const np = document.getElementById('newAdminPass').value.trim();
  if (np.length < 4) return showToast('Kata laluan mesti sekurang-kurangnya 4 aksara.');
  state.settings.adminPassword = np;
  saveState();
  document.getElementById('newAdminPass').value = '';
  showToast('Kata laluan Master Admin berjaya dikemas kini!');
});

document.getElementById('exportBackupBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `POS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

document.getElementById('importBackupInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.settings || !imported.products) throw new Error('Format tidak sah');
      state = imported;
      saveState();
      initApp();
      showToast('Data sandaran berjaya dipulihkan!');
    } catch (err) {
      showToast('Fail sandaran tidak sah!');
    }
  };
  reader.readAsText(file);
});

document.getElementById('factoryResetBtn').addEventListener('click', () => {
  if (!confirm('AMARAN: Semua produk, jualan dan tetapan akan dipadam dan dikembalikan ke asal. Teruskan?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(DEFAULT_STATE);
  saveState();
  initApp();
  showToast('Sistem telah ditetapkan semula ke tetapan asal.');
});

// --- Optional Cloud Sync Hook ---
function syncToCloudOptional(action, payload) {
  if (!state.settings.syncUrl) return;
  fetch(state.settings.syncUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload, timestamp: new Date().toISOString() })
  }).catch(() => {});
}

// --- Init Events ---
document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('toggleThemeBtn').addEventListener('click', () => {
  state.settings.darkMode = !state.settings.darkMode;
  saveState();
  applyTheme();
});

function initApp() {
  document.getElementById('headerShopName').textContent = state.settings.shopName;
  applyTheme();
  renderCategories();
  renderProducts();
  renderCart();
  updateKdsBadge();
  updateClock();
}

setInterval(updateClock, 1000);
initApp();

// Register Service Worker only on http/https
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
