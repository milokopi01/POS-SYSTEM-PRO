/**
 * =========================================================================
 * UNIVERSAL POS 3D PRO v3 (SAAS MULTI-KEDAI + BELIAN STOK & JUALAN)
 * =========================================================================
 * Pangkalan Data Utama: Google Sheets
 *
 * CARA PASANG:
 * 1. Buka Google Sheets baru -> Extensions -> Apps Script.
 * 2. Padam kod asal dan tampal seluruh kod Code.gs ini.
 * 3. Klik Save, pilih fungsi 'setupDatabase' di bar atas, dan klik Run.
 * 4. Klik Deploy -> New deployment -> Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Salin Web App URL dan tampal tepat pada BARIS KE-5 dalam fail index.html.
 * =========================================================================
 */

const MASTER_PASS = '101010';

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schemas = {
    'Shops': [
      'shopId', 'shopName', 'shopType', 'ownerName', 'phone', 'address',
      'status', 'expiryDate', 'ownerPassword', 'paperSize', 'taxRate',
      'serviceRate', 'tableCount', 'receiptFooter', 'qrImage', 'isSetupDone', 'createdAt'
    ],
    'Products': [
      'shopId', 'id', 'barcode', 'name', 'category', 'costPrice', 'price', 'stock', 'minStock', 'icon'
    ],
    'Purchases': [
      'shopId', 'purchaseNo', 'date', 'supplierName', 'refNo', 'paymentMethod', 'totalCost', 'notes', 'itemsJson'
    ],
    'Tables': [
      'shopId', 'tableName', 'status', 'itemsJson', 'updatedAt'
    ],
    'KDS': [
      'shopId', 'orderId', 'tableName', 'itemsJson', 'time', 'status'
    ],
    'Sales': [
      'shopId', 'receiptNo', 'date', 'orderType', 'paymentMethod',
      'subtotal', 'discount', 'tax', 'service', 'total', 'totalCost',
      'profit', 'cashReceived', 'change', 'itemsJson'
    ]
  };

  Object.keys(schemas).forEach(function(sheetName) {
    let sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);
    if (sh.getLastRow() === 0) {
      sh.appendRow(schemas[sheetName]);
      sh.getRange(1, 1, 1, schemas[sheetName].length)
        .setBackground('#0284c7')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });

  // Cipta Kedai Demo lalai jika belum ada
  const shopSheet = ss.getSheetByName('Shops');
  if (shopSheet.getLastRow() === 1) {
    shopSheet.appendRow([
      'DEMO01', 'KEDAI UNIVERSAL DEMO PRO', 'UNIVERSAL', 'Pemilik Demo', '012-3456789',
      'No. 12, Jalan Utama, Selama, Perak', 'AKTIF', '2099-12-31',
      '888888', '80', 0, 0, 12, 'Terima kasih! Sila datang lagi.', '', true,
      new Date().toISOString()
    ]);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetSafe(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    setupDatabase();
    sh = ss.getSheetByName(name);
  }
  return sh;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    obj._row = i + 1;
    rows.push(obj);
  }
  return rows;
}

function doGet(e) {
  try {
    const action = (e.parameter.action || 'ping').trim();
    const shopId = (e.parameter.shopId || 'DEMO01').trim().toUpperCase();

    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'Universal POS v3 API Aktif', time: new Date().toISOString() });
    }

    if (action === 'getShopData') {
      return jsonResponse(handleGetShopData(shopId));
    }

    if (action === 'getAllShops') {
      const masterPass = (e.parameter.masterPass || '').trim();
      if (masterPass !== MASTER_PASS) {
        return jsonResponse({ ok: false, error: 'Akses Master Admin tidak sah.' });
      }
      const shops = sheetToObjects(getSheetSafe('Shops'));
      return jsonResponse({ ok: true, shops: shops });
    }

    return jsonResponse({ ok: false, error: 'Tindakan GET tidak dikenali: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action || '';
    const shopId = (body.shopId || 'DEMO01').trim().toUpperCase();

    switch (action) {
      case 'registerShop':
        return jsonResponse(handleRegisterShop(body));
      case 'updateShopStatus':
        return jsonResponse(handleUpdateShopStatus(body));
      case 'saveSettings':
        return jsonResponse(handleSaveSettings(shopId, body.settings || {}));
      case 'saveProduct':
        return jsonResponse(handleSaveProduct(shopId, body.product || {}));
      case 'deleteProduct':
        return jsonResponse(handleDeleteProduct(shopId, body.productId));
      case 'savePurchase':
        return jsonResponse(handleSavePurchase(shopId, body.purchase, body.stockUpdates || []));
      case 'saveTableAndKds':
        return jsonResponse(handleSaveTableAndKds(shopId, body));
      case 'completeKds':
        return jsonResponse(handleCompleteKds(shopId, body.orderId, body.tableName));
      case 'clearTable':
        return jsonResponse(handleClearTable(shopId, body.tableName));
      case 'saveSale':
        return jsonResponse(handleSaveSale(shopId, body.receipt, body.stockUpdates || []));
      case 'voidSale':
        return jsonResponse(handleVoidSale(shopId, body.receiptNo));
      default:
        return jsonResponse({ ok: false, error: 'Tindakan POST tidak dikenali: ' + action });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function handleGetShopData(shopId) {
  const shops = sheetToObjects(getSheetSafe('Shops'));
  const shop = shops.find(s => String(s.shopId || '').trim().toUpperCase() === shopId);

  if (!shop) {
    return { ok: false, notFound: true, error: 'Kod Kedai "' + shopId + '" tidak ditemui dalam pangkalan data.' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const exp = shop.expiryDate ? String(shop.expiryDate).slice(0, 10) : '2099-12-31';
  const isExpired = exp < today;
  if (shop.status !== 'AKTIF' || isExpired) {
    return {
      ok: false,
      suspended: true,
      shopName: shop.shopName,
      error: isExpired
        ? 'Tempoh langganan kedai ini telah tamat (' + exp + '). Sila hubungi Master Admin.'
        : 'Akaun kedai ini digantung sementara. Sila hubungi Master Admin.'
    };
  }

  const products = sheetToObjects(getSheetSafe('Products'))
    .filter(p => String(p.shopId || '').trim().toUpperCase() === shopId)
    .map(p => ({
      id: String(p.id),
      barcode: String(p.barcode || ''),
      name: String(p.name),
      category: String(p.category || 'Umum'),
      costPrice: Number(p.costPrice) || 0,
      price: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
      minStock: Number(p.minStock) || 5,
      icon: String(p.icon || '📦')
    }));

  const purchases = sheetToObjects(getSheetSafe('Purchases'))
    .filter(p => String(p.shopId || '').trim().toUpperCase() === shopId)
    .map(p => ({
      purchaseNo: String(p.purchaseNo),
      date: String(p.date),
      supplierName: String(p.supplierName || ''),
      refNo: String(p.refNo || ''),
      paymentMethod: String(p.paymentMethod || 'Tunai'),
      totalCost: Number(p.totalCost) || 0,
      notes: String(p.notes || ''),
      items: JSON.parse(p.itemsJson || '[]')
    }))
    .reverse();

  const tablesArr = sheetToObjects(getSheetSafe('Tables'))
    .filter(t => String(t.shopId || '').trim().toUpperCase() === shopId);
  const tables = {};
  tablesArr.forEach(t => {
    try {
      tables[t.tableName] = {
        status: t.status || 'occupied',
        items: JSON.parse(t.itemsJson || '[]'),
        updatedAt: t.updatedAt || ''
      };
    } catch (_) {}
  });

  const kdsOrders = sheetToObjects(getSheetSafe('KDS'))
    .filter(k => String(k.shopId || '').trim().toUpperCase() === shopId && k.status === 'pending')
    .map(k => ({
      id: String(k.orderId),
      table: String(k.tableName),
      items: JSON.parse(k.itemsJson || '[]'),
      time: String(k.time || ''),
      status: String(k.status)
    }))
    .reverse();

  const sales = sheetToObjects(getSheetSafe('Sales'))
    .filter(r => String(r.shopId || '').trim().toUpperCase() === shopId)
    .map(r => ({
      receiptNo: String(r.receiptNo),
      date: String(r.date),
      orderType: String(r.orderType),
      paymentMethod: String(r.paymentMethod),
      subtotal: Number(r.subtotal) || 0,
      discount: Number(r.discount) || 0,
      tax: Number(r.tax) || 0,
      service: Number(r.service) || 0,
      total: Number(r.total) || 0,
      totalCost: Number(r.totalCost) || 0,
      profit: Number(r.profit) || 0,
      cashReceived: Number(r.cashReceived) || 0,
      change: Number(r.change) || 0,
      items: JSON.parse(r.itemsJson || '[]')
    }))
    .reverse();

  return {
    ok: true,
    settings: {
      shopId: shop.shopId,
      shopName: shop.shopName,
      shopType: shop.shopType || 'UNIVERSAL',
      ownerName: shop.ownerName || '',
      shopPhone: shop.phone || '',
      shopAddress: shop.address || '',
      status: shop.status,
      expiryDate: exp,
      ownerPassword: String(shop.ownerPassword || '888888'),
      paperSize: String(shop.paperSize || '80'),
      taxRate: Number(shop.taxRate) || 0,
      serviceRate: Number(shop.serviceRate) || 0,
      tableCount: Number(shop.tableCount) || 12,
      receiptFooter: shop.receiptFooter || 'Terima kasih! Sila datang lagi.',
      qrImage: shop.qrImage || '',
      isSetupDone: shop.isSetupDone === true || String(shop.isSetupDone).toUpperCase() === 'TRUE'
    },
    products: products,
    purchases: purchases,
    tables: tables,
    kdsOrders: kdsOrders,
    sales: sales
  };
}

function getStarterProductsByType(shopId, shopType) {
  const ts = Date.now();
  if (shopType === 'FNB') {
    return [
      [shopId, 'P' + ts + '1', '888001', 'Nasi Lemak Ayam', 'Makanan', 4.50, 9.50, 50, 10, '🍛'],
      [shopId, 'P' + ts + '2', '888002', 'Mee Goreng Mamak', 'Makanan', 3.50, 7.50, 50, 10, '🍜'],
      [shopId, 'P' + ts + '3', '888003', 'Teh Tarik Kaw', 'Minuman', 1.00, 3.00, 100, 15, '☕']
    ];
  }
  if (shopType === 'RUNCIT') {
    return [
      [shopId, 'P' + ts + '1', '955001', 'Air Mineral 500ml', 'Minuman', 0.80, 1.50, 120, 20, '💧'],
      [shopId, 'P' + ts + '2', '955002', 'Beras Super 5kg', 'Barangan Dapur', 16.50, 21.00, 30, 5, '🌾'],
      [shopId, 'P' + ts + '3', '955003', 'Minyak Masak 1kg', 'Barangan Dapur', 5.80, 6.90, 40, 10, '🧴']
    ];
  }
  if (shopType === 'BUTIK') {
    return [
      [shopId, 'P' + ts + '1', '777001', 'Baju T-Shirt Cotton (M)', 'Pakaian', 15.00, 35.00, 25, 5, '👕'],
      [shopId, 'P' + ts + '2', '777002', 'Tudung Bawal Premium', 'Aksesori', 12.00, 29.00, 40, 5, '🧣'],
      [shopId, 'P' + ts + '3', '777003', 'Beg Tangan Kasual', 'Beg', 35.00, 79.00, 15, 3, '👜']
    ];
  }
  if (shopType === 'BENGKEL') {
    return [
      [shopId, 'P' + ts + '1', '666001', 'Minyak Enjin 4T 1L', 'Alat Ganti', 22.00, 38.00, 30, 5, '🛢️'],
      [shopId, 'P' + ts + '2', '666002', 'Servis Tukar Minyak Hitam', 'Upah Servis', 0.00, 15.00, 999, 1, '🔧'],
      [shopId, 'P' + ts + '3', '666003', 'Palam Pencucuh (Spark Plug)', 'Alat Ganti', 8.00, 18.00, 40, 5, '⚡']
    ];
  }
  return [
    [shopId, 'P' + ts + '1', '888001', 'Produk Contoh A', 'Umum', 5.00, 10.00, 50, 5, '📦'],
    [shopId, 'P' + ts + '2', '888002', 'Nasi Lemak Istimewa', 'Makanan', 4.50, 9.00, 40, 5, '🍛'],
    [shopId, 'P' + ts + '3', '955001', 'Air Mineral 500ml', 'Minuman', 0.80, 1.50, 100, 15, '💧']
  ];
}

function handleRegisterShop(body) {
  if (String(body.masterPass || '') !== MASTER_PASS) {
    return { ok: false, error: 'Kata laluan Master Admin tidak sah.' };
  }
  const sh = getSheetSafe('Shops');
  const shops = sheetToObjects(sh);
  const newId = String(body.newShopId || ('KEDAI' + Date.now().toString().slice(-4)))
    .trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

  if (shops.some(s => String(s.shopId || '').trim().toUpperCase() === newId)) {
    return { ok: false, error: 'Kod Kedai "' + newId + '" sudah wujud. Sila guna kod lain.' };
  }

  const shopType = String(body.shopType || 'UNIVERSAL').toUpperCase();
  const ownerPassword = String(body.ownerPassword || Math.floor(100000 + Math.random() * 900000));

  sh.appendRow([
    newId,
    body.shopName || 'KEDAI BARU',
    shopType,
    body.ownerName || '',
    body.phone || '',
    body.address || 'Malaysia',
    'AKTIF',
    body.expiryDate || '2027-12-31',
    ownerPassword,
    '80', 0, 0, 12,
    'Terima kasih! Sila datang lagi.',
    '',
    false,
    new Date().toISOString()
  ]);

  const prodSheet = getSheetSafe('Products');
  getStarterProductsByType(newId, shopType).forEach(r => prodSheet.appendRow(r));

  return { ok: true, shopId: newId, ownerPassword: ownerPassword };
}

function handleUpdateShopStatus(body) {
  if (String(body.masterPass || '') !== MASTER_PASS) {
    return { ok: false, error: 'Kata laluan Master Admin tidak sah.' };
  }
  const sh = getSheetSafe('Shops');
  const shops = sheetToObjects(sh);
  const target = shops.find(s => String(s.shopId || '').trim().toUpperCase() === String(body.targetShopId || '').trim().toUpperCase());
  if (!target) return { ok: false, error: 'Kedai tidak ditemui.' };

  if (body.status) sh.getRange(target._row, 7).setValue(body.status);
  if (body.expiryDate) sh.getRange(target._row, 8).setValue(body.expiryDate);
  if (body.ownerPassword) sh.getRange(target._row, 9).setValue(body.ownerPassword);
  return { ok: true };
}

function handleSaveSettings(shopId, s) {
  const sh = getSheetSafe('Shops');
  const shops = sheetToObjects(sh);
  const target = shops.find(x => String(x.shopId || '').trim().toUpperCase() === shopId);
  if (!target) return { ok: false, error: 'Kedai tidak ditemui.' };

  const row = target._row;
  if (s.shopName !== undefined) sh.getRange(row, 2).setValue(s.shopName);
  if (s.shopType !== undefined) sh.getRange(row, 3).setValue(s.shopType);
  if (s.ownerName !== undefined) sh.getRange(row, 4).setValue(s.ownerName);
  if (s.shopPhone !== undefined) sh.getRange(row, 5).setValue(s.shopPhone);
  if (s.shopAddress !== undefined) sh.getRange(row, 6).setValue(s.shopAddress);
  if (s.ownerPassword !== undefined) sh.getRange(row, 9).setValue(s.ownerPassword);
  if (s.paperSize !== undefined) sh.getRange(row, 10).setValue(s.paperSize);
  if (s.taxRate !== undefined) sh.getRange(row, 11).setValue(s.taxRate);
  if (s.serviceRate !== undefined) sh.getRange(row, 12).setValue(s.serviceRate);
  if (s.tableCount !== undefined) sh.getRange(row, 13).setValue(s.tableCount);
  if (s.receiptFooter !== undefined) sh.getRange(row, 14).setValue(s.receiptFooter);
  if (s.qrImage !== undefined) sh.getRange(row, 15).setValue(s.qrImage);
  if (s.isSetupDone !== undefined) sh.getRange(row, 16).setValue(s.isSetupDone);

  return { ok: true };
}

function handleSaveProduct(shopId, p) {
  const sh = getSheetSafe('Products');
  const rows = sheetToObjects(sh);
  const existing = rows.find(x => String(x.shopId || '').trim().toUpperCase() === shopId && String(x.id) === String(p.id));
  const rowVals = [
    shopId, p.id, p.barcode || '', p.name, p.category || 'Umum',
    Number(p.costPrice) || 0, Number(p.price) || 0, Number(p.stock) || 0,
    Number(p.minStock) || 5, p.icon || '📦'
  ];
  if (existing) {
    sh.getRange(existing._row, 1, 1, rowVals.length).setValues([rowVals]);
  } else {
    sh.appendRow(rowVals);
  }
  return { ok: true };
}

function handleDeleteProduct(shopId, productId) {
  const sh = getSheetSafe('Products');
  const rows = sheetToObjects(sh);
  const target = rows.find(x => String(x.shopId || '').trim().toUpperCase() === shopId && String(x.id) === String(productId));
  if (target) sh.deleteRow(target._row);
  return { ok: true };
}

function handleSavePurchase(shopId, pur, stockUpdates) {
  const purSh = getSheetSafe('Purchases');
  purSh.appendRow([
    shopId, pur.purchaseNo, pur.date, pur.supplierName || 'Pembekal Umum',
    pur.refNo || '-', pur.paymentMethod || 'Tunai', Number(pur.totalCost) || 0,
    pur.notes || '', JSON.stringify(pur.items || [])
  ]);

  if (stockUpdates && stockUpdates.length) {
    const prodSh = getSheetSafe('Products');
    const prodRows = sheetToObjects(prodSh);
    stockUpdates.forEach(u => {
      const target = prodRows.find(p => String(p.shopId || '').trim().toUpperCase() === shopId && String(p.id) === String(u.id));
      if (target) {
        if (u.newCostPrice !== undefined) prodSh.getRange(target._row, 6).setValue(u.newCostPrice);
        prodSh.getRange(target._row, 8).setValue(u.newStock);
      }
    });
  }
  return { ok: true };
}

function handleSaveTableAndKds(shopId, body) {
  const tblSh = getSheetSafe('Tables');
  const tblRows = sheetToObjects(tblSh);
  const existing = tblRows.find(t => String(t.shopId || '').trim().toUpperCase() === shopId && String(t.tableName) === String(body.tableName));
  const tblVals = [shopId, body.tableName, 'occupied', JSON.stringify(body.items || []), body.time || ''];
  if (existing) tblSh.getRange(existing._row, 1, 1, tblVals.length).setValues([tblVals]);
  else tblSh.appendRow(tblVals);

  const kdsSh = getSheetSafe('KDS');
  kdsSh.appendRow([shopId, body.kdsId || ('KDS-' + Date.now().toString().slice(-5)), body.tableName, JSON.stringify(body.items || []), body.time || '', 'pending']);
  return { ok: true };
}

function handleCompleteKds(shopId, orderId, tableName) {
  const kdsSh = getSheetSafe('KDS');
  const kdsRows = sheetToObjects(kdsSh);
  const target = kdsRows.find(k => String(k.shopId || '').trim().toUpperCase() === shopId && String(k.orderId) === String(orderId));
  if (target) kdsSh.getRange(target._row, 6).setValue('done');

  if (tableName) {
    const tblSh = getSheetSafe('Tables');
    const tblRows = sheetToObjects(tblSh);
    const t = tblRows.find(x => String(x.shopId || '').trim().toUpperCase() === shopId && String(x.tableName) === String(tableName));
    if (t) tblSh.getRange(t._row, 3).setValue('billing');
  }
  return { ok: true };
}

function handleClearTable(shopId, tableName) {
  const tblSh = getSheetSafe('Tables');
  const tblRows = sheetToObjects(tblSh);
  const t = tblRows.find(x => String(x.shopId || '').trim().toUpperCase() === shopId && String(x.tableName) === String(tableName));
  if (t) tblSh.deleteRow(t._row);
  return { ok: true };
}

function handleSaveSale(shopId, r, stockUpdates) {
  const salesSh = getSheetSafe('Sales');
  salesSh.appendRow([
    shopId, r.receiptNo, r.date, r.orderType, r.paymentMethod,
    r.subtotal, r.discount, r.tax, r.service, r.total,
    r.totalCost || 0, r.profit || 0, r.cashReceived, r.change,
    JSON.stringify(r.items || [])
  ]);

  if (r.orderType && r.orderType !== 'Walk-In / Kaunter') {
    handleClearTable(shopId, r.orderType);
  }

  if (stockUpdates && stockUpdates.length) {
    const prodSh = getSheetSafe('Products');
    const prodRows = sheetToObjects(prodSh);
    stockUpdates.forEach(u => {
      const target = prodRows.find(p => String(p.shopId || '').trim().toUpperCase() === shopId && String(p.id) === String(u.id));
      if (target) prodSh.getRange(target._row, 8).setValue(u.newStock);
    });
  }
  return { ok: true };
}

function handleVoidSale(shopId, receiptNo) {
  const salesSh = getSheetSafe('Sales');
  const rows = sheetToObjects(salesSh);
  const target = rows.find(r => String(r.shopId || '').trim().toUpperCase() === shopId && String(r.receiptNo) === String(receiptNo));
  if (target) salesSh.deleteRow(target._row);
  return { ok: true };
}
