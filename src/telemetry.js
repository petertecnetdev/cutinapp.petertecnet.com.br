const SENSITIVE_PATTERN = /password|token|secret|cookie|card|cpf|document|code/i

export function startTelemetry({ apiBaseUrl, appSlug, getToken = () => localStorage.getItem("token") }) {
  if (typeof window === "undefined" || window.__peterTelemetryStarted) return () => {}
  window.__peterTelemetryStarted = true

  const endpoint = `${String(apiBaseUrl).replace(/\/+$/, "")}/interactions/batch`
  const sessionKey = `peter_telemetry_session_${appSlug}`
  const sessionId = sessionStorage.getItem(sessionKey) || createId()
  sessionStorage.setItem(sessionKey, sessionId)

  let queue = []
  let lastPath = window.location.pathname + window.location.search
  let scrollMilestones = new Set()
  let flushing = false

  function createId() {
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  function clean(value, limit = 200) {
    const text = String(value || "").replace(/\s+/g, " ").trim()
    return SENSITIVE_PATTERN.test(text) ? "[REDACTED]" : text.slice(0, limit)
  }

  function page() { return window.location.pathname + window.location.search }

  function enqueue(type, details = {}) {
    const metadata = {}
    for (const [key, value] of Object.entries(details.metadata || {})) {
      if (!SENSITIVE_PATTERN.test(key) && value !== undefined && value !== null) metadata[key] = clean(value, 500)
    }
    queue.push({ id: createId(), type, timestamp: new Date().toISOString(), page: page(), label: clean(details.label), target: clean(details.target), metadata })
    if (queue.length >= 20) flush()
  }

  async function flush() {
    if (flushing || !queue.length) return
    flushing = true
    const events = queue.splice(0, 50)
    const token = getToken?.()
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-App-Slug": appSlug,
          "X-Frontend-Page": window.location.href,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ session_id: sessionId, events }),
      })
      if (!response.ok && response.status >= 500) queue.unshift(...events)
    } catch {
      queue.unshift(...events.slice(-20))
    } finally {
      flushing = false
    }
  }

  function recordNavigation(source) {
    const current = page()
    if (current === lastPath) return
    enqueue("navigation", { label: current, metadata: { from: lastPath, source } })
    lastPath = current
    scrollMilestones = new Set()
  }

  function onClick(event) {
    const element = event.target?.closest?.("a,button,[role='button'],[data-track]")
    if (!element) return
    enqueue("click", {
      label: element.dataset?.track || element.getAttribute("aria-label") || element.textContent || element.name || element.id || element.tagName,
      target: element.getAttribute("href") || element.id || element.name || element.tagName,
      metadata: { tag: element.tagName, destination: element.getAttribute("href") },
    })
  }

  function onSubmit(event) {
    const form = event.target
    enqueue("form_submit", { label: form.getAttribute("aria-label") || form.name || form.id || "formulário", target: form.action || page(), metadata: { method: form.method || "GET" } })
  }

  function onChange(event) {
    const element = event.target
    if (!element?.matches?.("select,input[type='checkbox'],input[type='radio']")) return
    enqueue(element.matches("select") ? "filter" : "field_change", {
      label: element.getAttribute("aria-label") || element.name || element.id || element.type,
      target: element.id || element.name || element.tagName,
      metadata: { control: element.type || element.tagName, checked: element.checked },
    })
  }

  function onScroll() {
    const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
    const percentage = Math.min(100, Math.round((window.scrollY / documentHeight) * 100))
    for (const milestone of [25, 50, 75, 100]) {
      if (percentage >= milestone && !scrollMilestones.has(milestone)) {
        scrollMilestones.add(milestone)
        enqueue("scroll", { label: `${milestone}% da página`, metadata: { milestone } })
      }
    }
  }

  function onError(event) {
    enqueue("frontend_error", { label: event.message || "Erro JavaScript", metadata: { source: event.filename, line: event.lineno, column: event.colno } })
  }

  function onRejection(event) {
    enqueue("frontend_error", { label: event.reason?.message || "Promise rejeitada", metadata: { kind: "unhandledrejection" } })
  }

  const originalPush = window.history.pushState
  const originalReplace = window.history.replaceState
  window.history.pushState = function (...args) { const result = originalPush.apply(this, args); queueMicrotask(() => recordNavigation("pushState")); return result }
  window.history.replaceState = function (...args) { const result = originalReplace.apply(this, args); queueMicrotask(() => recordNavigation("replaceState")); return result }

  document.addEventListener("click", onClick, true)
  document.addEventListener("submit", onSubmit, true)
  document.addEventListener("change", onChange, true)
  window.addEventListener("popstate", () => recordNavigation("popstate"))
  window.addEventListener("error", onError)
  window.addEventListener("unhandledrejection", onRejection)
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("pagehide", () => { enqueue("session_end", { label: "Sessão encerrada" }); flush() })

  enqueue("session_start", { label: "Sessão iniciada", metadata: { referrer: document.referrer, language: navigator.language } })
  const timer = window.setInterval(flush, 5000)

  return () => {
    clearInterval(timer)
    flush()
    document.removeEventListener("click", onClick, true)
    document.removeEventListener("submit", onSubmit, true)
    document.removeEventListener("change", onChange, true)
    window.removeEventListener("error", onError)
    window.removeEventListener("unhandledrejection", onRejection)
    window.removeEventListener("scroll", onScroll)
    window.history.pushState = originalPush
    window.history.replaceState = originalReplace
    window.__peterTelemetryStarted = false
  }
}
