/* =====================================================
   PHILYSHOP ENGINE™ — CORE MODULE (PRO LEVEL)
   Author: PHILYBOTICS™
   ===================================================== */

const PhilyShop = (() => {

  /* =========================
     CONFIG
  ========================= */
  const DB_NAME = "philyshop_db";
  const DB_VERSION = 1;

  const BASE_CURRENCY = "USD";

  const CURRENCY_RATES = {
    USD: 1,
    GHS: 15.5,
    EUR: 0.92
  };

  /* =========================
     DATABASE INIT
  ========================= */
  let db;

  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = e => {
        db = e.target.result;

        if (!db.objectStoreNames.contains("products")) {
          db.createObjectStore("products", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("orders")) {
          db.createObjectStore("orders", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("cart")) {
          db.createObjectStore("cart", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };

      request.onsuccess = e => {
        db = e.target.result;
        resolve();
      };

      request.onerror = e => reject(e);
    });
  }

  /* =========================
     GENERIC DB HELPERS
  ========================= */
  function put(store, data) {
    return new Promise(res => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(data);
      tx.oncomplete = () => res(true);
    });
  }

  function getAll(store) {
    return new Promise(res => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
    });
  }

  function get(store, key) {
    return new Promise(res => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => res(req.result);
    });
  }

  function remove(store, key) {
    return new Promise(res => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => res(true);
    });
  }

  /* =========================
     CURRENCY ENGINE
  ========================= */
  let currentCurrency = "USD";

  async function setCurrency(cur) {
    currentCurrency = cur;
    await put("settings", { key: "currency", value: cur });
  }

  async function loadCurrency() {
    const s = await get("settings", "currency");
    if (s) currentCurrency = s.value;
  }

  function convert(price, from = BASE_CURRENCY) {
    const usd = price / CURRENCY_RATES[from];
    return usd * CURRENCY_RATES[currentCurrency];
  }

  function format(price) {
    const symbols = {
      USD: "$",
      GHS: "₵",
      EUR: "€"
    };
    return symbols[currentCurrency] + price.toFixed(2);
  }

  /* =========================
     PRODUCT SYSTEM
  ========================= */
  async function createProduct(data) {
    const product = {
      id: Date.now(),
      name: data.name,
      slug: data.name.toLowerCase().replace(/\s+/g, "-"),
      description: data.description || "",
      category: data.category || "general",
      price: +data.price,
      currency: data.currency || BASE_CURRENCY,
      images: data.images || [],
      fileUrl: data.fileUrl,
      previewUrl: data.previewUrl || "",
      variants: data.variants || [],
      status: "active",
      createdAt: new Date().toISOString()
    };

    await put("products", product);
    return product;
  }

  async function getProducts() {
    const p = await getAll("products");
    return p.filter(x => x.status === "active").reverse();
  }

  async function deleteProduct(id) {
    await remove("products", id);
  }

  /* =========================
     CART SYSTEM
  ========================= */
  async function getCart() {
    let c = await get("cart", "main");
    if (!c) {
      c = { id: "main", items: [] };
      await put("cart", c);
    }
    return c;
  }

  async function addToCart(productId, qty = 1) {
    const cart = await getCart();
    const item = cart.items.find(i => i.productId === productId);

    if (item) item.qty += qty;
    else cart.items.push({ productId, qty });

    await put("cart", cart);
    return cart;
  }

  async function updateQty(productId, qty) {
    const cart = await getCart();
    const item = cart.items.find(i => i.productId === productId);
    if (item) item.qty = qty;
    await put("cart", cart);
  }

  async function removeFromCart(productId) {
    const cart = await getCart();
    cart.items = cart.items.filter(i => i.productId !== productId);
    await put("cart", cart);
  }

  async function clearCart() {
    await put("cart", { id: "main", items: [] });
  }

  async function getCartDetailed() {
    const cart = await getCart();
    const products = await getAll("products");

    let total = 0;

    const items = cart.items.map(i => {
      const p = products.find(x => x.id === i.productId);
      if (!p) return null;

      const converted = convert(p.price, p.currency);
      total += converted * i.qty;

      return {
        ...p,
        qty: i.qty,
        priceConverted: converted
      };
    }).filter(Boolean);

    return { items, total };
  }

  /* =========================
     ORDER SYSTEM
  ========================= */
  async function createOrder(customer) {
    const cart = await getCartDetailed();

    const order = {
      id: Date.now(),
      customer,
      items: cart.items.map(i => ({
        productId: i.id,
        name: i.name,
        price: i.priceConverted,
        qty: i.qty
      })),
      total: cart.total,
      currency: currentCurrency,
      paymentStatus: "pending",
      delivery: {
        downloadLinks: cart.items.map(i => i.fileUrl)
      },
      createdAt: new Date().toISOString()
    };

    await put("orders", order);
    await clearCart();

    return order;
  }

  async function getOrders() {
    return (await getAll("orders")).reverse();
  }

  /* =========================
     PUBLIC API
  ========================= */
  return {
    initDB,

    // currency
    setCurrency,
    loadCurrency,
    convert,
    format,

    // products
    createProduct,
    getProducts,
    deleteProduct,

    // cart
    addToCart,
    getCartDetailed,
    updateQty,
    removeFromCart,

    // orders
    createOrder,
    getOrders
  };

})();
