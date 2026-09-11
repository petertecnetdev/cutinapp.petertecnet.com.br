import commerceService from "../services/CommerceService";
import {
  CHECKOUT_RECOVERY_CHANGE_EVENT,
  CHECKOUT_RECOVERY_TTL_MS,
  clearCheckoutRecovery,
  readCheckoutRecovery,
  writeCheckoutRecovery,
} from "./checkoutRecovery";
import { clearEventCart, readEventCart, writeEventCart } from "./eventCartStorage";
import { trackTelemetry } from "./telemetry";
import "../styles/persistent-cart.css";

const CART_PREFIX = "cutinapp_checkout_";
const RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
const CART_ID = "cutinapp-persistent-cart";
const CART_CHANGE_EVENT = "cutinapp-cart-updated";
const CART_BODY_CLASS = "cut-has-persistent-cart";
const SHEET_BODY_CLASS = "cut-cart-sheet-open";
const CART_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

let openedSlug = null;
let renderSequence = 0;

const parse = (storage, key) => {
  try { return JSON.parse(storage?.getItem?.(key) || "null"); } catch (_) { return null; }
};

const quantity = (value = {}) => [...(value.tickets || []), ...(value.items || [])]
  .reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);

const normalizedSelection = (value = {}) => ({
  tickets: (value.tickets || [])
    .map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) }))
    .filter((item) => item.id > 0 && item.quantity > 0),
  items: (value.items || [])
    .map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) }))
    .filter((item) => item.id > 0 && item.quantity > 0),
});

const sameSelection = (a, b) => JSON.stringify(normalizedSelection(a)) === JSON.stringify(normalizedSelection(b));
const set = (storage, key, value) => {
  try { storage?.setItem?.(key, JSON.stringify(value)); return true; } catch (_) { return false; }
};

const money = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const syncCart = (now = Date.now()) => {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(CART_PREFIX) || key.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(CART_PREFIX.length);
      const cart = parse(window.localStorage, key);
      const savedAt = Number(cart?.savedAt || 0);
      if (!slug || quantity(cart) <= 0) continue;
      if (savedAt > 0 && now - savedAt > CART_MAX_AGE_MS) {
        clearEventCart(slug);
        clearCheckoutRecovery(slug);
        continue;
      }
      const sessionKey = `${CART_PREFIX}${slug}`;
      if (quantity(parse(window.sessionStorage, sessionKey)) <= 0) set(window.sessionStorage, sessionKey, cart);
    }

    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (!key?.startsWith(CART_PREFIX) || key.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(CART_PREFIX.length);
      const cart = parse(window.sessionStorage, key);
      if (!slug || quantity(cart) <= 0) continue;

      const savedAt = Number(cart?.savedAt || 0);
      const recovery = readCheckoutRecovery(slug, now);
      if (savedAt > 0 && now - savedAt > CART_MAX_AGE_MS && !recovery?.orderPublicId) {
        clearEventCart(slug);
        clearCheckoutRecovery(slug);
        continue;
      }

      if (!recovery?.orderPublicId && (!recovery?.selection || !sameSelection(recovery.selection, cart))) {
        writeCheckoutRecovery(slug, { selection: cart, couponCode: recovery?.couponCode || null }, now);
      }
    }

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(RECOVERY_PREFIX.length);
      const recovery = readCheckoutRecovery(slug, now);
      if (!slug || !recovery?.selection || quantity(recovery.selection) <= 0) continue;
      const sessionKey = `${CART_PREFIX}${slug}`;
      if (quantity(parse(window.sessionStorage, sessionKey)) <= 0) set(window.sessionStorage, sessionKey, recovery.selection);
    }
  } catch (_) {
    // Checkout remains usable when browser storage is unavailable.
  }
};

const pendingCart = (now = Date.now()) => {
  const bySlug = new Map();

  const collectSelectionStorage = (storage) => {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key?.startsWith(CART_PREFIX) || key.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(CART_PREFIX.length);
      const cart = parse(storage, key);
      const count = quantity(cart);
      const eventAt = cart?.eventDate ? new Date(cart.eventDate).getTime() : null;
      const savedAt = Number(cart?.savedAt || 0);
      if (!slug || count <= 0 || (savedAt > 0 && now - savedAt > CART_MAX_AGE_MS)) continue;

      const existing = bySlug.get(slug);
      bySlug.set(slug, {
        slug,
        eventId: Number(cart?.eventId || existing?.eventId || 0) || null,
        quantity: Math.max(count, existing?.quantity || 0),
        eventAt: eventAt ?? existing?.eventAt ?? null,
        hasOrder: Boolean(existing?.hasOrder),
        savedAt: Math.max(savedAt, existing?.savedAt || 0),
      });
    }
  };

  try {
    collectSelectionStorage(window.sessionStorage);
    collectSelectionStorage(window.localStorage);

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(RECOVERY_PREFIX.length);
      const recovery = parse(window.localStorage, key);
      const savedAt = Number(recovery?.savedAt || 0);
      if (!slug || !savedAt || now - savedAt > CHECKOUT_RECOVERY_TTL_MS) continue;

      const existing = bySlug.get(slug);
      const count = quantity(recovery?.selection || {});
      const hasOrder = Boolean(String(recovery?.orderPublicId || "").trim());
      if (!existing && count <= 0 && !hasOrder) continue;

      bySlug.set(slug, {
        slug,
        eventId: existing?.eventId || Number(recovery?.selection?.eventId || 0) || null,
        quantity: Math.max(existing?.quantity || 0, count),
        eventAt: existing?.eventAt ?? null,
        hasOrder,
        savedAt,
      });
    }
  } catch (_) {
    return null;
  }

  return [...bySlug.values()].sort((a, b) => {
    if (a.hasOrder !== b.hasOrder) return a.hasOrder ? -1 : 1;
    if (a.eventAt !== b.eventAt) return (a.eventAt || Number.MAX_SAFE_INTEGER) - (b.eventAt || Number.MAX_SAFE_INTEGER);
    return b.savedAt - a.savedAt;
  })[0] || null;
};

const skipRoute = () => /^\/(?:checkout|login|cadastro|register|auth)(?:\/|$)/i.test(window.location.pathname);

const removeCartUi = () => {
  document.getElementById(CART_ID)?.remove();
  document.body.classList.remove(CART_BODY_CLASS);
  document.documentElement.classList.remove(SHEET_BODY_CLASS);
};

const createIcon = (className) => {
  const icon = document.createElement("i");
  icon.className = className;
  icon.setAttribute("aria-hidden", "true");
  return icon;
};

const button = ({ className, label, ariaLabel, onClick }) => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  if (ariaLabel) element.setAttribute("aria-label", ariaLabel);
  if (label) element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
};

const currentSelection = (cart) => {
  const stored = readEventCart(cart.slug);
  if (stored && quantity(stored) > 0) return stored;
  const recovery = readCheckoutRecovery(cart.slug);
  return recovery?.selection || { tickets: [], items: [] };
};

const hydrateCart = async (cart) => {
  const selection = currentSelection(cart);
  let catalog = null;
  try {
    catalog = await commerceService.catalog(cart.slug);
  } catch (_) {
    // The compact cart remains usable offline or during a transient API failure.
  }

  const lineFor = (kind, chosen) => {
    const source = (kind === "ticket" ? catalog?.tickets : catalog?.items) || [];
    const item = source.find((entry) => Number(entry.id) === Number(chosen.id));
    const unitPrice = item && Number.isFinite(Number(item.price)) ? Number(item.price) : null;
    const remainingRaw = item?.remaining ?? item?.quantity;
    const remaining = remainingRaw == null ? null : Math.max(0, Number(remainingRaw || 0));

    return {
      kind,
      id: Number(chosen.id),
      quantity: Math.max(1, Number(chosen.quantity || 1)),
      name: item?.name || (kind === "ticket" ? "Ingresso" : "Item do evento"),
      unitPrice,
      remaining,
      available: item?.available !== false && !item?.expired,
    };
  };

  const lines = [
    ...(selection?.tickets || []).map((item) => lineFor("ticket", item)),
    ...(selection?.items || []).map((item) => lineFor("item", item)),
  ];

  const priced = lines.every((line) => line.unitPrice !== null);
  const total = priced
    ? lines.reduce((sum, line) => sum + (line.unitPrice * line.quantity), 0)
    : null;

  return {
    ...cart,
    selection,
    catalog,
    lines,
    quantity: quantity(selection),
    total,
    eventTitle: catalog?.event?.title || "Evento selecionado",
  };
};

const updateLineQuantity = (cart, line, nextQuantity) => {
  if (cart.hasOrder) return;
  const selection = currentSelection(cart);
  const key = line.kind === "ticket" ? "tickets" : "items";
  const currentLines = Array.isArray(selection?.[key]) ? selection[key] : [];
  const max = line.remaining == null ? (line.kind === "ticket" ? 20 : 50) : Math.max(line.quantity, line.remaining);
  const normalized = Math.max(0, Math.min(max, Number(nextQuantity || 0)));
  const nextLines = normalized === 0
    ? currentLines.filter((item) => Number(item.id) !== line.id)
    : currentLines.map((item) => Number(item.id) === line.id ? { ...item, quantity: normalized } : item);
  const nextSelection = { ...selection, [key]: nextLines };
  const recovery = readCheckoutRecovery(cart.slug);

  if (quantity(nextSelection) <= 0) {
    clearEventCart(cart.slug);
    clearCheckoutRecovery(cart.slug);
    openedSlug = null;
  } else {
    writeEventCart(cart.slug, nextSelection);
    writeCheckoutRecovery(cart.slug, {
      selection: nextSelection,
      orderPublicId: null,
      couponCode: recovery?.couponCode || null,
    });
  }

  trackTelemetry("persistent_cart_quantity_changed", {
    target: cart.slug,
    event_id: cart.eventId,
    item_type: line.kind,
    item_id: line.id,
    previous_quantity: line.quantity,
    quantity: normalized,
  });
};

const goToCheckout = (cart) => {
  trackTelemetry("checkout_cart_opened", {
    event_id: cart.eventId,
    quantity: cart.quantity,
    target: cart.slug,
    has_pending_order: cart.hasOrder,
  });
  window.location.assign(`/checkout/${encodeURIComponent(cart.slug)}`);
};

const clearCart = (cart) => {
  clearEventCart(cart.slug);
  clearCheckoutRecovery(cart.slug);
  openedSlug = null;
  trackTelemetry("checkout_cart_cleared", {
    event_id: cart.eventId,
    quantity: cart.quantity,
    target: cart.slug,
  });
};

const closeSheet = () => {
  openedSlug = null;
  document.documentElement.classList.remove(SHEET_BODY_CLASS);
  document.querySelector(".cut-persistent-cart__sheet-layer")?.remove();
  document.querySelector(".cut-persistent-cart__bar")?.focus?.();
};

const renderBar = (host, cart) => {
  const bar = button({
    className: `cut-persistent-cart__bar${cart.hasOrder ? " is-pending" : ""}`,
    ariaLabel: cart.hasOrder
      ? "Abrir pagamento pendente"
      : `Abrir carrinho com ${cart.quantity} item${cart.quantity === 1 ? "" : "s"}`,
    onClick: () => {
      openedSlug = cart.slug;
      render();
    },
  });

  const iconWrap = document.createElement("span");
  iconWrap.className = "cut-persistent-cart__icon";
  iconWrap.appendChild(createIcon(cart.hasOrder ? "fa-solid fa-clock-rotate-left" : "fa-solid fa-bag-shopping"));
  const badge = document.createElement("b");
  badge.textContent = String(cart.quantity);
  iconWrap.appendChild(badge);

  const copy = document.createElement("span");
  copy.className = "cut-persistent-cart__copy";
  const eyebrow = document.createElement("small");
  eyebrow.textContent = cart.hasOrder ? "Pagamento pendente" : "Carrinho do evento";
  const title = document.createElement("strong");
  title.textContent = cart.eventTitle;
  const detail = document.createElement("span");
  detail.textContent = cart.hasOrder
    ? "Toque para retomar com segurança"
    : `${cart.quantity} item${cart.quantity === 1 ? "" : "s"} selecionado${cart.quantity === 1 ? "" : "s"}`;
  copy.append(eyebrow, title, detail);

  const amount = document.createElement("span");
  amount.className = "cut-persistent-cart__amount";
  if (cart.total !== null && !cart.hasOrder) {
    const label = document.createElement("small");
    label.textContent = "Total";
    const value = document.createElement("strong");
    value.textContent = money(cart.total);
    amount.append(label, value);
  }
  amount.appendChild(createIcon("fa-solid fa-chevron-up"));

  bar.append(iconWrap, copy, amount);
  host.appendChild(bar);
};

const renderLine = (cart, line) => {
  const row = document.createElement("article");
  row.className = "cut-persistent-cart__line";

  const icon = document.createElement("span");
  icon.className = "cut-persistent-cart__line-icon";
  icon.appendChild(createIcon(line.kind === "ticket" ? "fa-solid fa-ticket" : "fa-solid fa-bag-shopping"));

  const info = document.createElement("div");
  info.className = "cut-persistent-cart__line-info";
  const kind = document.createElement("small");
  kind.textContent = line.kind === "ticket" ? "Ingresso" : "Item do evento";
  const name = document.createElement("strong");
  name.textContent = line.name;
  const price = document.createElement("span");
  price.textContent = line.unitPrice === null ? "Preço confirmado no checkout" : money(line.unitPrice);
  info.append(kind, name, price);

  const controls = document.createElement("div");
  controls.className = "cut-persistent-cart__stepper";
  const minus = button({
    className: "cut-persistent-cart__stepper-btn",
    ariaLabel: `Diminuir quantidade de ${line.name}`,
    onClick: () => updateLineQuantity(cart, line, line.quantity - 1),
  });
  minus.appendChild(createIcon(line.quantity === 1 ? "fa-regular fa-trash-can" : "fa-solid fa-minus"));

  const count = document.createElement("output");
  count.textContent = String(line.quantity);
  count.setAttribute("aria-live", "polite");

  const plus = button({
    className: "cut-persistent-cart__stepper-btn",
    ariaLabel: `Aumentar quantidade de ${line.name}`,
    onClick: () => updateLineQuantity(cart, line, line.quantity + 1),
  });
  plus.appendChild(createIcon("fa-solid fa-plus"));
  if (!line.available || (line.remaining !== null && line.quantity >= line.remaining)) plus.disabled = true;

  controls.append(minus, count, plus);

  const lineTotal = document.createElement("strong");
  lineTotal.className = "cut-persistent-cart__line-total";
  lineTotal.textContent = line.unitPrice === null ? "" : money(line.unitPrice * line.quantity);

  row.append(icon, info);
  if (!cart.hasOrder) row.appendChild(controls);
  row.appendChild(lineTotal);
  return row;
};

const renderSheet = (host, cart) => {
  document.documentElement.classList.add(SHEET_BODY_CLASS);

  const layer = document.createElement("div");
  layer.className = "cut-persistent-cart__sheet-layer";

  const backdrop = button({
    className: "cut-persistent-cart__backdrop",
    ariaLabel: "Fechar carrinho",
    onClick: closeSheet,
  });

  const sheet = document.createElement("section");
  sheet.className = "cut-persistent-cart__sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "cut-cart-sheet-title");

  const handle = button({
    className: "cut-persistent-cart__handle",
    ariaLabel: "Fechar carrinho",
    onClick: closeSheet,
  });
  handle.appendChild(document.createElement("span"));

  const header = document.createElement("header");
  header.className = "cut-persistent-cart__sheet-header";
  const heading = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = cart.hasOrder ? "Compra em andamento" : "Revise antes de pagar";
  const title = document.createElement("h2");
  title.id = "cut-cart-sheet-title";
  title.textContent = cart.hasOrder ? "Pagamento pendente" : "Seu carrinho";
  const event = document.createElement("p");
  event.textContent = cart.eventTitle;
  heading.append(eyebrow, title, event);

  const close = button({
    className: "cut-persistent-cart__close",
    ariaLabel: "Fechar carrinho",
    onClick: closeSheet,
  });
  close.appendChild(createIcon("fa-solid fa-xmark"));
  header.append(heading, close);

  const body = document.createElement("div");
  body.className = "cut-persistent-cart__sheet-body";

  if (cart.hasOrder) {
    const pending = document.createElement("div");
    pending.className = "cut-persistent-cart__pending";
    pending.appendChild(createIcon("fa-solid fa-shield-halved"));
    const pendingCopy = document.createElement("div");
    const pendingTitle = document.createElement("strong");
    pendingTitle.textContent = "Sua cobrança já foi criada";
    const pendingText = document.createElement("span");
    pendingText.textContent = "Retome a mesma compra para acompanhar a confirmação. Não gere uma segunda cobrança.";
    pendingCopy.append(pendingTitle, pendingText);
    pending.appendChild(pendingCopy);
    body.appendChild(pending);
  }

  const list = document.createElement("div");
  list.className = "cut-persistent-cart__lines";
  cart.lines.forEach((line) => list.appendChild(renderLine(cart, line)));
  if (cart.lines.length) body.appendChild(list);

  const footer = document.createElement("footer");
  footer.className = "cut-persistent-cart__sheet-footer";

  if (!cart.hasOrder && cart.total !== null) {
    const summary = document.createElement("div");
    summary.className = "cut-persistent-cart__summary";
    const summaryCopy = document.createElement("span");
    const summaryLabel = document.createElement("small");
    summaryLabel.textContent = `${cart.quantity} item${cart.quantity === 1 ? "" : "s"} no carrinho`;
    const summaryTitle = document.createElement("strong");
    summaryTitle.textContent = "Total";
    summaryCopy.append(summaryLabel, summaryTitle);
    const summaryValue = document.createElement("strong");
    summaryValue.textContent = money(cart.total);
    summary.append(summaryCopy, summaryValue);
    footer.appendChild(summary);
  }

  const checkout = button({
    className: "cut-persistent-cart__checkout",
    onClick: () => goToCheckout(cart),
    ariaLabel: cart.hasOrder ? "Retomar pagamento" : "Finalizar compra",
  });
  const checkoutCopy = document.createElement("span");
  checkoutCopy.textContent = cart.hasOrder ? "Retomar pagamento" : "Finalizar compra";
  checkout.append(checkoutCopy, createIcon("fa-solid fa-arrow-right"));
  footer.appendChild(checkout);

  if (!cart.hasOrder) {
    const clear = button({
      className: "cut-persistent-cart__clear",
      onClick: () => clearCart(cart),
      ariaLabel: "Esvaziar carrinho",
    });
    clear.append(createIcon("fa-regular fa-trash-can"), document.createTextNode("Esvaziar carrinho"));
    footer.appendChild(clear);
  }

  sheet.append(handle, header, body, footer);
  layer.append(backdrop, sheet);
  host.appendChild(layer);

  window.setTimeout(() => close.focus(), 0);
};

const render = async () => {
  const sequence = ++renderSequence;
  syncCart();
  const cart = pendingCart();

  if (!cart || skipRoute()) {
    openedSlug = null;
    removeCartUi();
    return;
  }

  const hydrated = await hydrateCart(cart);
  if (sequence !== renderSequence) return;

  if (hydrated.catalog?.sales_closed && !hydrated.hasOrder) {
    clearEventCart(hydrated.slug);
    clearCheckoutRecovery(hydrated.slug);
    openedSlug = null;
    removeCartUi();
    return;
  }

  removeCartUi();
  document.body.classList.add(CART_BODY_CLASS);

  const host = document.createElement("div");
  host.id = CART_ID;
  host.className = "cut-persistent-cart-host";
  document.body.appendChild(host);

  renderBar(host, hydrated);
  if (openedSlug === hydrated.slug) renderSheet(host, hydrated);
};

export const installPersistentCart = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let timer = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(render, 40);
  };
  const visible = () => {
    if (document.visibilityState === "visible") schedule();
  };

  [
    "cutinapp:route-change",
    CHECKOUT_RECOVERY_CHANGE_EVENT,
    CART_CHANGE_EVENT,
    "popstate",
    "pageshow",
    "focus",
    "storage",
  ].forEach((event) => window.addEventListener(event, schedule));
  document.addEventListener("visibilitychange", visible);

  schedule();

  return () => {
    window.clearTimeout(timer);
    [
      "cutinapp:route-change",
      CHECKOUT_RECOVERY_CHANGE_EVENT,
      CART_CHANGE_EVENT,
      "popstate",
      "pageshow",
      "focus",
      "storage",
    ].forEach((event) => window.removeEventListener(event, schedule));
    document.removeEventListener("visibilitychange", visible);
    openedSlug = null;
    removeCartUi();
  };
};
