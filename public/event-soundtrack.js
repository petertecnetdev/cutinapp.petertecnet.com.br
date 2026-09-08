(() => {
  "use strict";

  const API = "https://api.petertecnet.com.br/api/v1/apps/cutinapp";
  const ROOT_EMAIL = "petertecnet@gmail.com";
  const state = {
    slug: null,
    event: null,
    soundtrack: null,
    index: 0,
    audio: null,
    shell: null,
    expanded: false,
    managerOpen: false,
    canManage: false,
    routeTimer: null,
  };

  const headers = (json = false) => {
    const value = { Accept: "application/json", "X-Peter-App": "cutinapp" };
    const token = localStorage.getItem("token");
    if (token) value.Authorization = `Bearer ${token}`;
    if (json) value["Content-Type"] = "application/json";
    return value;
  };

  const request = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || data?.error || "Não foi possível concluir a operação.");
    return data;
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const currentSlug = () => {
    const match = window.location.pathname.match(/^\/event\/([^/]+)\/?$/);
    if (!match) return null;
    const segment = decodeURIComponent(match[1]);
    if (/^\d+$/.test(segment)) return null;
    return segment;
  };

  const normalize = (value) => ({
    enabled: Boolean(value?.enabled),
    autoplay: value?.autoplay !== false,
    shuffle: Boolean(value?.shuffle),
    loop: value?.loop !== false,
    volume: Math.max(0, Math.min(1, Number(value?.volume ?? 0.35))),
    items: Array.isArray(value?.items) ? value.items.filter((item) => item?.url) : [],
  });

  const detectProvider = (raw) => {
    let url;
    try { url = new URL(String(raw).trim()); } catch (_) { return null; }
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      return { type: url.searchParams.get("list") ? "youtube_playlist" : "youtube", url: url.toString() };
    }
    if (host.endsWith("spotify.com")) return { type: "spotify", url: url.toString() };
    if (host.endsWith("soundcloud.com")) return { type: "soundcloud", url: url.toString() };
    if (/\.(mp3|m4a|aac|ogg|oga|wav|webm|opus)(\?|#|$)/i.test(url.pathname + url.search + url.hash)) {
      return { type: "audio", url: url.toString() };
    }
    return { type: "url", url: url.toString() };
  };

  const youtubeEmbed = (item) => {
    try {
      const url = new URL(item.url);
      const list = url.searchParams.get("list");
      if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1&rel=0`;
      let id = url.searchParams.get("v");
      if (!id && url.hostname.includes("youtu.be")) id = url.pathname.split("/").filter(Boolean)[0];
      if (!id && url.pathname.includes("/shorts/")) id = url.pathname.split("/shorts/")[1]?.split("/")[0];
      if (!id && url.pathname.includes("/embed/")) id = url.pathname.split("/embed/")[1]?.split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0` : null;
    } catch (_) { return null; }
  };

  const spotifyEmbed = (item) => {
    try {
      const url = new URL(item.url);
      const parts = url.pathname.split("/").filter(Boolean);
      const offset = parts[0]?.startsWith("intl-") ? 1 : 0;
      const type = parts[offset];
      const id = parts[offset + 1];
      if (!type || !id || !["track", "playlist", "album", "episode", "show"].includes(type)) return null;
      return `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}?utm_source=generator`;
    } catch (_) { return null; }
  };

  const itemTitle = (item, index) => item?.title?.trim() || ({
    youtube: "YouTube",
    youtube_playlist: "Playlist do YouTube",
    spotify: "Spotify",
    soundcloud: "SoundCloud",
    audio: "Áudio do evento",
    url: "Link de áudio",
  }[item?.type] || `Faixa ${index + 1}`);

  const injectStyles = () => {
    if (document.getElementById("cutinapp-soundtrack-styles")) return;
    const style = document.createElement("style");
    style.id = "cutinapp-soundtrack-styles";
    style.textContent = `
      #cutinapp-soundtrack-root{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);z-index:2147483000;width:min(680px,calc(100vw - 24px));font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}
      .cs-card{background:rgba(6,16,30,.94);border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 55px rgba(0,0,0,.38);border-radius:18px;overflow:hidden;backdrop-filter:blur(18px)}
      .cs-row{display:flex;align-items:center;gap:10px;padding:10px 12px}.cs-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(135deg,#6d5dfc,#1ac8ff);font-size:18px;flex:0 0 auto}.cs-meta{min-width:0;flex:1}.cs-kicker{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#8ba2c7}.cs-title{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cs-actions{display:flex;gap:6px;align-items:center}.cs-btn{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.06);color:#fff;border-radius:10px;min-width:36px;height:36px;padding:0 10px;cursor:pointer}.cs-btn:hover{background:rgba(255,255,255,.12)}.cs-btn-primary{background:linear-gradient(135deg,#6658f7,#0ea5e9);border:0}.cs-media{padding:0 12px 12px}.cs-media iframe{width:100%;height:152px;border:0;border-radius:14px;background:#000}.cs-audio{width:100%}.cs-notice{margin:0 12px 12px;padding:9px 11px;border-radius:12px;background:rgba(14,165,233,.12);border:1px solid rgba(14,165,233,.24);font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}.cs-hidden{display:none!important}
      .cs-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:16px}.cs-modal{width:min(720px,100%);max-height:90vh;overflow:auto;background:#081321;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.6)}.cs-modal-head,.cs-modal-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid rgba(255,255,255,.08)}.cs-modal-foot{border-top:1px solid rgba(255,255,255,.08);border-bottom:0;justify-content:flex-end}.cs-modal-body{padding:16px}.cs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cs-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.cs-field label{font-size:12px;color:#a9bbd4}.cs-input{width:100%;border:1px solid rgba(255,255,255,.12);background:#0c1a2b;color:#fff;border-radius:10px;padding:10px 12px;outline:none}.cs-add{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end}.cs-list{display:flex;flex-direction:column;gap:8px;margin-top:12px}.cs-item{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.035)}.cs-item-main{min-width:0;flex:1}.cs-item-title{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cs-item-type{font-size:11px;color:#8297b6}.cs-switch{display:flex;align-items:center;gap:8px;font-size:13px}.cs-range{width:100%}.cs-empty{padding:18px;text-align:center;color:#8fa3be;font-size:13px}.cs-error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);padding:9px 11px;border-radius:10px;font-size:12px;margin-bottom:10px}.cs-ok{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.25);padding:9px 11px;border-radius:10px;font-size:12px;margin-bottom:10px}
      @media(max-width:640px){#cutinapp-soundtrack-root{bottom:72px}.cs-row{padding:9px}.cs-btn{min-width:34px;height:34px;padding:0 8px}.cs-media iframe{height:190px}.cs-add,.cs-grid{grid-template-columns:1fr}.cs-modal-backdrop{align-items:flex-end;padding:0}.cs-modal{border-radius:20px 20px 0 0;max-height:92vh}}
    `;
    document.head.appendChild(style);
  };

  const stopMedia = () => {
    if (state.audio) {
      try { state.audio.pause(); } catch (_) {}
      state.audio = null;
    }
  };

  const mediaHtml = (item) => {
    if (!item) return "";
    if (item.type === "youtube" || item.type === "youtube_playlist") {
      const src = youtubeEmbed(item);
      return src ? `<iframe allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen src="${escapeHtml(src)}"></iframe>` : "";
    }
    if (item.type === "spotify") {
      const src = spotifyEmbed(item);
      return src ? `<iframe allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" src="${escapeHtml(src)}"></iframe>` : "";
    }
    if (item.type === "soundcloud") {
      const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(item.url)}&auto_play=${state.soundtrack?.autoplay ? "true" : "false"}&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`;
      return `<iframe allow="autoplay" src="${escapeHtml(src)}"></iframe>`;
    }
    if (item.type === "url") return `<a class="cs-btn cs-btn-primary" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${escapeHtml(item.url)}">Abrir mídia</a>`;
    return `<audio class="cs-audio" data-cs-audio preload="metadata" controls src="${escapeHtml(item.url)}"></audio>`;
  };

  const render = () => {
    stopMedia();
    state.shell?.remove();
    state.shell = null;
    const soundtrack = state.soundtrack;
    if (!soundtrack?.enabled || soundtrack.items.length === 0) return;

    injectStyles();
    if (state.index >= soundtrack.items.length) state.index = 0;
    const item = soundtrack.items[state.index];
    const root = document.createElement("div");
    root.id = "cutinapp-soundtrack-root";
    root.innerHTML = `<div class="cs-card">
      <div class="cs-row">
        <div class="cs-icon">♫</div>
        <div class="cs-meta"><div class="cs-kicker">Trilha do evento</div><div class="cs-title">${escapeHtml(itemTitle(item, state.index))}</div></div>
        <div class="cs-actions">
          <button class="cs-btn" data-cs-prev title="Anterior">‹</button>
          <button class="cs-btn cs-btn-primary" data-cs-toggle title="Ouvir">▶</button>
          <button class="cs-btn" data-cs-next title="Próxima">›</button>
          ${state.canManage ? '<button class="cs-btn" data-cs-manage title="Editar trilha">⚙</button>' : ''}
          <button class="cs-btn" data-cs-expand title="Abrir player">⌃</button>
        </div>
      </div>
      <div class="cs-media ${state.expanded ? "" : "cs-hidden"}" data-cs-media>${mediaHtml(item)}</div>
      <div class="cs-notice cs-hidden" data-cs-autoplay><span>O navegador bloqueou o áudio automático.</span><button class="cs-btn cs-btn-primary" data-cs-enable>Ativar música</button></div>
    </div>`;
    document.body.appendChild(root);
    state.shell = root;

    root.querySelector("[data-cs-prev]")?.addEventListener("click", () => step(-1));
    root.querySelector("[data-cs-next]")?.addEventListener("click", () => step(1));
    root.querySelector("[data-cs-expand]")?.addEventListener("click", () => {
      state.expanded = !state.expanded;
      render();
    });
    root.querySelector("[data-cs-manage]")?.addEventListener("click", openManager);
    root.querySelector("[data-cs-toggle]")?.addEventListener("click", () => {
      state.expanded = true;
      render();
      const audio = state.shell?.querySelector("[data-cs-audio]");
      if (audio) audio.play().catch(() => showAutoplayNotice());
    });
    root.querySelector("[data-cs-enable]")?.addEventListener("click", () => {
      const audio = root.querySelector("[data-cs-audio]");
      if (audio) audio.play().then(() => hideAutoplayNotice()).catch(() => {});
      else { state.expanded = true; render(); }
    });

    const audio = root.querySelector("[data-cs-audio]");
    if (audio) {
      state.audio = audio;
      audio.volume = soundtrack.volume;
      audio.addEventListener("ended", () => step(1, true));
      if (soundtrack.autoplay) audio.play().catch(() => showAutoplayNotice());
    }
  };

  const showAutoplayNotice = () => state.shell?.querySelector("[data-cs-autoplay]")?.classList.remove("cs-hidden");
  const hideAutoplayNotice = () => state.shell?.querySelector("[data-cs-autoplay]")?.classList.add("cs-hidden");

  const step = (delta, fromEnded = false) => {
    const items = state.soundtrack?.items || [];
    if (!items.length) return;
    if (state.soundtrack.shuffle && items.length > 1) {
      let next = state.index;
      while (next === state.index) next = Math.floor(Math.random() * items.length);
      state.index = next;
    } else {
      const next = state.index + delta;
      if (next >= items.length && !state.soundtrack.loop && fromEnded) return;
      state.index = (next + items.length) % items.length;
    }
    render();
  };

  const loadManagerPermission = async () => {
    state.canManage = false;
    const token = localStorage.getItem("token");
    if (!token || !state.event?.production) return;
    try {
      const meData = await request(`${API}/me`, { headers: headers() });
      const me = meData?.user || meData?.data || meData;
      const ownerId = Number(state.event.production.user_id || 0);
      state.canManage = Boolean(me?.id) && (Number(me.id) === ownerId || String(me.email || "").toLowerCase() === ROOT_EMAIL);
    } catch (_) {
      state.canManage = false;
    }
  };

  const load = async (slug) => {
    state.slug = slug;
    state.index = 0;
    state.event = null;
    state.soundtrack = null;
    state.canManage = false;
    stopMedia();
    state.shell?.remove();
    state.shell = null;
    try {
      const [eventData, soundtrackData] = await Promise.all([
        request(`${API}/events/public/${encodeURIComponent(slug)}`, { headers: headers() }),
        request(`${API}/events/public/${encodeURIComponent(slug)}/soundtrack`, { headers: headers() }),
      ]);
      if (state.slug !== slug) return;
      state.event = eventData?.event || null;
      state.soundtrack = normalize(soundtrackData?.soundtrack);
      await loadManagerPermission();
      render();
    } catch (_) {
      state.soundtrack = null;
      state.shell?.remove();
      state.shell = null;
    }
  };

  const managerTemplate = () => {
    const s = state.soundtrack || normalize({});
    const items = s.items || [];
    return `<div class="cs-modal-backdrop" data-cs-modal>
      <div class="cs-modal" role="dialog" aria-modal="true" aria-label="Trilha sonora do evento">
        <div class="cs-modal-head"><div><strong>Trilha sonora do evento</strong><div class="cs-kicker" style="margin-top:4px">YouTube, Spotify, SoundCloud e arquivos de áudio</div></div><button class="cs-btn" data-cs-close>✕</button></div>
        <div class="cs-modal-body">
          <div data-cs-feedback></div>
          <div class="cs-grid">
            <label class="cs-switch"><input type="checkbox" data-cs-enabled ${s.enabled ? "checked" : ""}> Ativar trilha sonora</label>
            <label class="cs-switch"><input type="checkbox" data-cs-autoplay-manager ${s.autoplay ? "checked" : ""}> Tentar iniciar automaticamente</label>
            <label class="cs-switch"><input type="checkbox" data-cs-loop ${s.loop ? "checked" : ""}> Repetir playlist</label>
            <label class="cs-switch"><input type="checkbox" data-cs-shuffle ${s.shuffle ? "checked" : ""}> Ordem aleatória</label>
          </div>
          <div class="cs-field" style="margin-top:14px"><label>Volume inicial: <span data-cs-volume-label>${Math.round(s.volume * 100)}%</span></label><input class="cs-range" type="range" min="0" max="1" step="0.05" value="${s.volume}" data-cs-volume></div>
          <hr style="border:0;border-top:1px solid rgba(255,255,255,.08);margin:16px 0">
          <div class="cs-add">
            <div class="cs-field" style="margin:0"><label>Link da música ou playlist</label><input class="cs-input" data-cs-url placeholder="YouTube, Spotify, SoundCloud ou URL de áudio"></div>
            <div class="cs-field" style="margin:0"><label>Nome opcional</label><input class="cs-input" data-cs-title placeholder="Ex.: Playlist oficial"></div>
            <button class="cs-btn cs-btn-primary" data-cs-add>Adicionar</button>
          </div>
          <div class="cs-field" style="margin-top:14px"><label>Ou envie um arquivo de áudio (até 50 MB)</label><input class="cs-input" type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.aac,.ogg,.oga,.wav,.webm,.opus" data-cs-file></div>
          <div class="cs-list" data-cs-list>${items.length ? items.map((item, index) => `<div class="cs-item" data-id="${escapeHtml(item.id || "")}"><div class="cs-item-main"><div class="cs-item-title">${escapeHtml(itemTitle(item, index))}</div><div class="cs-item-type">${escapeHtml(item.type)} · ${escapeHtml(item.source || "external")}</div></div><button class="cs-btn" data-cs-up="${index}">↑</button><button class="cs-btn" data-cs-down="${index}">↓</button><button class="cs-btn" data-cs-remove="${index}">✕</button></div>`).join("") : '<div class="cs-empty">Nenhuma música adicionada ainda.</div>'}</div>
        </div>
        <div class="cs-modal-foot"><button class="cs-btn" data-cs-close>Cancelar</button><button class="cs-btn cs-btn-primary" data-cs-save>Salvar trilha</button></div>
      </div>
    </div>`;
  };

  const feedback = (modal, message, ok = false) => {
    const target = modal.querySelector("[data-cs-feedback]");
    target.innerHTML = `<div class="${ok ? "cs-ok" : "cs-error"}">${escapeHtml(message)}</div>`;
  };

  const openManager = () => {
    if (!state.canManage || state.managerOpen) return;
    state.managerOpen = true;
    injectStyles();
    const holder = document.createElement("div");
    holder.innerHTML = managerTemplate();
    const modal = holder.firstElementChild;
    document.body.appendChild(modal);
    const close = () => { state.managerOpen = false; modal.remove(); };
    modal.querySelectorAll("[data-cs-close]").forEach((button) => button.addEventListener("click", close));
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    modal.querySelector("[data-cs-volume]")?.addEventListener("input", (event) => { modal.querySelector("[data-cs-volume-label]").textContent = `${Math.round(Number(event.target.value) * 100)}%`; });
    modal.querySelector("[data-cs-add]")?.addEventListener("click", () => {
      const urlInput = modal.querySelector("[data-cs-url]");
      const titleInput = modal.querySelector("[data-cs-title]");
      const provider = detectProvider(urlInput.value);
      if (!provider) return feedback(modal, "Informe um link válido do YouTube, Spotify, SoundCloud ou áudio.");
      state.soundtrack.items.push({ id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, type: provider.type, url: provider.url, title: titleInput.value.trim(), source: "external" });
      modal.remove(); state.managerOpen = false; openManager();
    });
    modal.querySelector("[data-cs-file]")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) return feedback(modal, "O arquivo deve ter no máximo 50 MB.");
      const form = new FormData(); form.append("file", file); form.append("title", file.name.replace(/\.[^.]+$/, ""));
      try {
        feedback(modal, "Enviando áudio...", true);
        const data = await request(`${API}/events/${state.event.id}/soundtrack/upload`, { method: "POST", headers: headers(), body: form });
        state.soundtrack = normalize(data.soundtrack);
        modal.remove(); state.managerOpen = false; openManager();
      } catch (error) { feedback(modal, error.message); }
    });
    modal.querySelectorAll("[data-cs-remove]").forEach((button) => button.addEventListener("click", async () => {
      const index = Number(button.dataset.csRemove); const item = state.soundtrack.items[index]; if (!item) return;
      try {
        if (item.source === "upload" && item.id) {
          const data = await request(`${API}/events/${state.event.id}/soundtrack/items/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: headers() });
          state.soundtrack = normalize(data.soundtrack);
        } else state.soundtrack.items.splice(index, 1);
        modal.remove(); state.managerOpen = false; openManager();
      } catch (error) { feedback(modal, error.message); }
    }));
    modal.querySelectorAll("[data-cs-up]").forEach((button) => button.addEventListener("click", () => { const i = Number(button.dataset.csUp); if (i <= 0) return; [state.soundtrack.items[i - 1], state.soundtrack.items[i]] = [state.soundtrack.items[i], state.soundtrack.items[i - 1]]; modal.remove(); state.managerOpen = false; openManager(); }));
    modal.querySelectorAll("[data-cs-down]").forEach((button) => button.addEventListener("click", () => { const i = Number(button.dataset.csDown); if (i >= state.soundtrack.items.length - 1) return; [state.soundtrack.items[i + 1], state.soundtrack.items[i]] = [state.soundtrack.items[i], state.soundtrack.items[i + 1]]; modal.remove(); state.managerOpen = false; openManager(); }));
    modal.querySelector("[data-cs-save]")?.addEventListener("click", async () => {
      const payload = {
        enabled: modal.querySelector("[data-cs-enabled]").checked,
        autoplay: modal.querySelector("[data-cs-autoplay-manager]").checked,
        loop: modal.querySelector("[data-cs-loop]").checked,
        shuffle: modal.querySelector("[data-cs-shuffle]").checked,
        volume: Number(modal.querySelector("[data-cs-volume]").value),
        items: state.soundtrack.items,
      };
      try {
        const data = await request(`${API}/events/${state.event.id}/soundtrack`, { method: "PUT", headers: headers(true), body: JSON.stringify(payload) });
        state.soundtrack = normalize(data.soundtrack);
        feedback(modal, "Trilha sonora salva.", true);
        render();
        setTimeout(close, 450);
      } catch (error) { feedback(modal, error.message); }
    });
  };

  const checkRoute = () => {
    const slug = currentSlug();
    if (!slug) {
      if (state.slug) {
        state.slug = null;
        stopMedia();
        state.shell?.remove();
        state.shell = null;
      }
      return;
    }
    if (slug !== state.slug) load(slug);
  };

  const wrapHistory = (name) => {
    const original = history[name];
    if (original.__cutinappSoundtrackWrapped) return;
    const wrapped = function (...args) { const result = original.apply(this, args); setTimeout(checkRoute, 0); return result; };
    wrapped.__cutinappSoundtrackWrapped = true;
    history[name] = wrapped;
  };

  wrapHistory("pushState");
  wrapHistory("replaceState");
  window.addEventListener("popstate", checkRoute);
  document.addEventListener("visibilitychange", () => { if (document.hidden) state.audio?.pause(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", checkRoute, { once: true }); else checkRoute();
  state.routeTimer = window.setInterval(checkRoute, 1200);
})();
