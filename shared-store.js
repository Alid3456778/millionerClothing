(function () {
  const TOKEN_KEY = "m_brand_token";
  const GUEST_CART_KEY = "m_brand_guest_cart";
  let cachedSession = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    cachedSession = null;
  }

  function getGuestCart() {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (_error) {
      return [];
    }
  }

  function saveGuestCart(items) {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  }

  async function api(path, options) {
    const token = getToken();
    const headers = Object.assign({ "Content-Type": "application/json" }, options && options.headers ? options.headers : {});
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, Object.assign({}, options, { headers }));
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const message = payload && payload.message ? payload.message : "Request failed";
      throw new Error(message);
    }

    return payload;
  }

  async function getSession(force) {
    if (cachedSession && !force) return cachedSession;
    if (!getToken()) return null;
    try {
      cachedSession = await api("/api/auth/session");
      return cachedSession;
    } catch (_error) {
      clearToken();
      return null;
    }
  }

  async function mergeGuestCart() {
    const items = getGuestCart();
    if (!items.length || !getToken()) return;
    await api("/api/cart/merge", {
      method: "POST",
      body: JSON.stringify({ items })
    });
    saveGuestCart([]);
  }

  async function login(payload) {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setToken(result.token);
    cachedSession = result.user;
    await mergeGuestCart();
    cachedSession = await getSession(true);
    return cachedSession;
  }

  async function register(payload) {
    const result = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setToken(result.token);
    cachedSession = result.user;
    await mergeGuestCart();
    cachedSession = await getSession(true);
    return cachedSession;
  }

  async function logout() {
    clearToken();
  }

  async function addToCart(productId, quantity) {
    const qty = Math.max(1, Number(quantity || 1));
    if (getToken()) {
      const result = await api("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({ productId, quantity: qty })
      });
      return result.cart;
    }

    const next = getGuestCart();
    const existing = next.find((item) => item.productId === productId);
    if (existing) existing.quantity += qty;
    else next.push({ productId, quantity: qty });
    saveGuestCart(next);
    return next;
  }

  async function getGuestCartDetailed() {
    const items = getGuestCart();
    if (!items.length) return { items: [], count: 0, subtotal: 0 };
    const ids = items.map((item) => item.productId).join(",");
    const payload = await api(`/api/products?ids=${encodeURIComponent(ids)}&limit=50`);
    const products = payload.products || [];
    const mapped = items.map((item) => {
      const product = products.find((entry) => entry._id === item.productId);
      if (!product) return null;
      return {
        product,
        quantity: item.quantity,
        lineTotal: item.quantity * product.price
      };
    }).filter(Boolean);
    return {
      items: mapped,
      count: mapped.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: mapped.reduce((sum, item) => sum + item.lineTotal, 0)
    };
  }

  async function getCart() {
    if (getToken()) return api("/api/cart");
    return getGuestCartDetailed();
  }

  async function updateCartItem(productId, quantity) {
    const qty = Math.max(0, Number(quantity || 0));
    if (getToken()) {
      return api(`/api/cart/items/${productId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: qty })
      });
    }

    let items = getGuestCart();
    if (qty <= 0) items = items.filter((item) => item.productId !== productId);
    else {
      items = items.map((item) => item.productId === productId ? Object.assign({}, item, { quantity: qty }) : item);
    }
    saveGuestCart(items);
    return getGuestCartDetailed();
  }

  async function removeCartItem(productId) {
    if (getToken()) {
      return api(`/api/cart/items/${productId}`, { method: "DELETE" });
    }
    saveGuestCart(getGuestCart().filter((item) => item.productId !== productId));
    return getGuestCartDetailed();
  }

  async function getCartCount() {
    if (getToken()) {
      const payload = await api("/api/cart");
      return payload.count || 0;
    }
    return getGuestCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function ensureToastRoot() {
    let root = document.querySelector(".toast-stack");
    if (!root) {
      root = document.createElement("div");
      root.className = "toast-stack";
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(options) {
    const root = ensureToastRoot();
    const tone = options && options.tone ? options.tone : "info";
    const title = options && options.title ? options.title : "Notice";
    const message = options && options.message ? options.message : "";
    const timeout = options && options.timeout ? Number(options.timeout) : 2800;

    const node = document.createElement("div");
    node.className = `toast ${tone}`;
    node.innerHTML = `<div><strong>${title}</strong><p>${message}</p></div>`;
    root.appendChild(node);

    window.setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(-6px)";
      node.style.transition = "opacity .2s ease, transform .2s ease";
      window.setTimeout(() => node.remove(), 220);
    }, timeout);
  }

  function hydrateNav(targets) {
    Promise.all([getSession(), getCartCount()])
      .then(([session, cartCount]) => {
        (targets.cart || []).forEach((node) => { node.textContent = cartCount; });
        (targets.authLabel || []).forEach((node) => {
          node.textContent = session ? session.name.split(" ")[0] : "Sign In";
        });
        (targets.avatar || []).forEach((node) => {
          node.textContent = session ? session.name.trim().charAt(0).toUpperCase() : "G";
        });
        (targets.admin || []).forEach((node) => {
          node.hidden = !(session && session.isAdmin);
        });
      })
      .catch(() => {
        (targets.cart || []).forEach((node) => { node.textContent = "0"; });
      });
  }

  window.MStore = {
    api,
    getToken,
    getSession,
    login,
    register,
    logout,
    addToCart,
    getCart,
    updateCartItem,
    removeCartItem,
    getCartCount,
    hydrateNav,
    mergeGuestCart,
    toast: showToast
  };
})();
