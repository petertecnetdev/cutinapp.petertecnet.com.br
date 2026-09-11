import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Card, Container, Form, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import CollapsibleFilterPanel from "../../components/CollapsibleFilterPanel";
import walletService from "../../services/WalletService";
import commerceService from "../../services/CommerceService";
import {
  PASS_FILTERS,
  countdownLabel,
  dateTime,
  dayLabel,
  eventMoment,
  eventShareUrl,
  groupPassItems,
  isTransferable,
  lifecycleAction,
  mapsUrl,
  matchesWalletFilter,
  money,
  passState,
  searchableText,
  shouldShowPrice,
  sortWalletItems,
  walletCounts,
} from "../../utils/passWallet";
import "./MyPassesPage.css";

const VIEW_KEY = "cutinapp:wallet:view:v2";

const getSavedView = () => {
  if (typeof window === "undefined") return "cards";
  try {
    return window.localStorage.getItem(VIEW_KEY) === "compact" ? "compact" : "cards";
  } catch (_) {
    return "cards";
  }
};

const saveView = (value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_KEY, value);
  } catch (_) {
    // Preference persistence must never block the wallet.
  }
};

const initials = (value) => String(value || "Evento")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "EV";

const eventLocation = (event) => [
  event?.venue,
  event?.city && event?.uf ? `${event.city} · ${event.uf}` : event?.city || event?.uf,
].filter(Boolean).join(" · ") || "Local a confirmar";

const productionName = (event) => event?.production?.name || "Produção Cutinapp";

const eventPropType = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  title: PropTypes.string,
  image: PropTypes.string,
  slug: PropTypes.string,
  start_date: PropTypes.string,
  end_date: PropTypes.string,
  venue: PropTypes.string,
  city: PropTypes.string,
  uf: PropTypes.string,
  address: PropTypes.string,
  formatted_address: PropTypes.string,
  google_maps_url: PropTypes.string,
  production: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
    slug: PropTypes.string,
  }),
});

const EventArtwork = ({ event, large = false }) => (
  <div className={large ? "cut-wallet-next__art" : "cut-wallet-event-art"} aria-hidden="true">
    {event?.image
      ? <img src={event.image} alt="" loading="lazy" />
      : <span>{initials(event?.title)}</span>}
  </div>
);

EventArtwork.propTypes = {
  event: eventPropType,
  large: PropTypes.bool,
};

const EventMeta = ({ event }) => (
  <div className="cut-wallet-card__meta">
    <span><i className="fa-regular fa-calendar" />{dateTime(event?.start_date)}</span>
    <span><i className="fa-solid fa-location-dot" />{eventLocation(event)}</span>
  </div>
);

EventMeta.propTypes = {
  event: eventPropType,
};

const PriceBadge = ({ pass }) => {
  const complimentary = Boolean(pass?.is_complimentary) || Number(pass?.ticket?.price || 0) <= 0;
  if (complimentary) return <Badge bg="primary">Cortesia</Badge>;
  if (!shouldShowPrice(pass)) return null;
  return <Badge bg="dark">{money(pass?.purchase?.line_unit_price ?? pass?.ticket?.price)}</Badge>;
};

PriceBadge.propTypes = {
  pass: PropTypes.shape({
    is_complimentary: PropTypes.bool,
    ticket: PropTypes.shape({
      price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    }),
    purchase: PropTypes.shape({
      line_unit_price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    }),
  }),
};

const secureQrLabel = (
  <span className="cut-wallet-secure-qr">
    <i className="fa-solid fa-shield-halved" />
    QR protegido · abre somente no ingresso
  </span>
);

export default function MyPassesPage() {
  const navigate = useNavigate();
  const [passes, setPasses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [summary, setSummary] = useState({});
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partialWarning, setPartialWarning] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("nearest");
  const [priceMode, setPriceMode] = useState("all");
  const [viewMode, setViewMode] = useState(getSavedView);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
    const refresh = () => setNowMs(Date.now());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPartialWarning("");

    Promise.allSettled([
      walletService.mine(),
      commerceService.purchases({ per_page: 50 }),
    ]).then(([walletResult, purchaseResult]) => {
      if (!active) return;

      if (walletResult.status === "fulfilled") {
        setPasses(walletResult.value.passes || []);
        setTransfers(walletResult.value.transfers || []);
        setSummary(walletResult.value.summary || {});
      } else {
        setError(walletResult.reason?.message || "Não foi possível carregar seus ingressos.");
      }

      if (purchaseResult.status === "fulfilled") {
        const response = purchaseResult.value;
        setPurchases(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []);
      } else if (walletResult.status === "fulfilled") {
        setPartialWarning("Seus ingressos foram carregados, mas as compras pendentes não puderam ser consultadas agora.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const pendingPurchases = useMemo(() => purchases
    .filter((order) => String(order?.status || "").toLowerCase() === "pending")
    .filter((order) => (order?.items || []).some((item) => item?.type === "ticket"))
    .map((order) => ({
      ...order,
      ticket: (order.items || []).find((item) => item?.type === "ticket") || null,
    })), [purchases]);

  const rawItems = useMemo(() => [
    ...passes.map((data) => ({ kind: "pass", data })),
    ...transfers.map((data) => ({ kind: "transfer", data })),
    ...pendingPurchases.map((data) => ({ kind: "pending", data })),
  ], [passes, transfers, pendingPurchases]);

  const counts = useMemo(() => walletCounts(rawItems, nowMs), [rawItems, nowMs]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rawItems.filter((item) => {
      if (!matchesWalletFilter(item, filter, nowMs)) return false;
      if (term && !searchableText(item).includes(term)) return false;
      if (priceMode === "all" || item.kind !== "pass") return true;
      const complimentary = Boolean(item.data?.is_complimentary) || Number(item.data?.ticket?.price || 0) <= 0;
      return priceMode === "free" ? complimentary : !complimentary;
    });
    return sortWalletItems(filtered, sort, nowMs);
  }, [filter, nowMs, priceMode, rawItems, search, sort]);

  const groups = useMemo(() => groupPassItems(visibleItems), [visibleItems]);

  const nextPass = useMemo(() => passes
    .filter((pass) => ["upcoming", "today"].includes(passState(pass, nowMs).key))
    .sort((a, b) => Date.parse(a.event?.start_date || "") - Date.parse(b.event?.start_date || ""))[0] || null, [passes, nowMs]);

  const nextCountdown = countdownLabel(nextPass?.event, nowMs);
  const activeFilterCount = Number(Boolean(search.trim()))
    + Number(filter !== "all")
    + Number(sort !== "nearest")
    + Number(priceMode !== "all");

  const changeView = (value) => {
    setViewMode(value);
    saveView(value);
  };

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
    setSort("nearest");
    setPriceMode("all");
  };

  const openEvent = (event) => {
    if (event?.slug) navigate(`/event/${event.slug}`);
  };

  const openPurchase = (purchase) => {
    if (purchase?.public_id) navigate(`/purchases/${purchase.public_id}`);
    else navigate("/purchases");
  };

  const openDirections = (event) => {
    const url = mapsUrl(event);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareEvent = async (event) => {
    const url = eventShareUrl(event);
    if (!url) return;
    const payload = {
      title: event?.title || "Evento na Cutinapp",
      text: `${event?.title || "Evento"} · ${dayLabel(event?.start_date)}`,
      url,
    };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(url);
        setPartialWarning("Link do evento copiado. O QR do ingresso não foi compartilhado.");
      }
    } catch (shareError) {
      if (shareError?.name !== "AbortError") setPartialWarning("Não foi possível compartilhar agora.");
    }
  };

  const buyMore = (event) => {
    if (event?.slug) navigate(`/event/${event.slug}`, { state: { focusTickets: true } });
  };

  const handlePrimaryPassAction = (pass) => {
    const action = lifecycleAction(pass, nowMs);
    if (action.type === "purchase") return openPurchase(pass.purchase);
    if (action.type === "event") return openEvent(pass.event);
    navigate(`/passes/${pass.id}`);
  };

  const renderPassGroup = (group) => {
    const passEntries = group.items.map((item) => item.data);
    const first = passEntries[0];
    const event = first.event || {};
    const state = passState(first, nowMs);
    const primary = lifecycleAction(first, nowMs);
    const moment = eventMoment(event, nowMs);
    const count = passEntries.length;
    const purchase = first.purchase;
    const lifecycle = countdownLabel(event, nowMs);
    const cardStateClass = ["cancelled", "refunded"].includes(state.key)
      ? "is-cancelled"
      : ["past", "used"].includes(state.key)
        ? "is-past"
        : "";

    return <Card key={group.key} className={`cut-wallet-card ${cardStateClass}`}>
      <div className="cut-wallet-card__accent" />
      <div className="cut-wallet-card__top">
        <EventArtwork event={event} />
        <div className="cut-wallet-card__main">
          <div className="cut-wallet-card__badges">
            <Badge bg={state.variant}>{state.label}</Badge>
            <Badge bg="dark">{count > 1 ? `${count} ingressos` : first.ticket?.name || "Ingresso"}</Badge>
            <PriceBadge pass={first} />
          </div>
          <span className="cut-wallet-card__production">
            <i className="fa-solid fa-bolt" />
            {productionName(event)}
          </span>
          <h3>{event?.title || "Evento"}</h3>
          <EventMeta event={event} />
        </div>
      </div>

      {(lifecycle || moment === "past" || state.key === "used") && <div className="cut-wallet-card__lifecycle">
        {moment === "past" || state.key === "used"
          ? <><strong>Evento realizado.</strong> Suas fotos, avaliação e lembranças ficam na página do evento.</>
          : <><strong>{lifecycle}.</strong> Tenha seu ingresso pronto e confira horário e localização antes de sair.</>}
      </div>}

      <div className="cut-wallet-pass-list">
        {passEntries.map((pass, index) => {
          const individualState = passState(pass, nowMs);
          return <div className="cut-wallet-pass-row" key={pass.id}>
            <div className="cut-wallet-pass-row__info">
              <strong>{pass.ticket?.name || "Ingresso Cutinapp"}{count > 1 ? ` · ${index + 1}/${count}` : ""}</strong>
              <small>{pass.holder_name || pass.holder_email || "Titular"} · {individualState.label}</small>
              {pass.checked_in_at && <small>Check-in em {dateTime(pass.checked_in_at)}</small>}
            </div>
            <div className="cut-wallet-pass-row__actions">
              <Button size="sm" onClick={() => navigate(`/passes/${pass.id}`)} aria-label={`Abrir ingresso ${index + 1} de ${count}`}>
                <i className="fa-solid fa-ticket me-1" />Abrir
              </Button>
              {isTransferable(pass, nowMs) && <Button size="sm" variant="outline-light" onClick={() => navigate(`/passes/${pass.id}`, { state: { openTransfer: true } })}>
                Transferir
              </Button>}
            </div>
          </div>;
        })}
      </div>

      <div className="cut-wallet-card__footer">
        <div className="cut-wallet-card__footer-note">
          {secureQrLabel}
          {purchase?.public_id && <div className="mt-1">Compra #{String(purchase.public_id).slice(0, 8).toUpperCase()}</div>}
        </div>
        <div className="cut-wallet-card__footer-actions">
          <Button size="sm" onClick={() => handlePrimaryPassAction(first)}>
            <i className={`${primary.icon} me-1`} />{primary.label}
          </Button>
          {event?.slug && <Button size="sm" variant="outline-light" onClick={() => openEvent(event)}>Evento</Button>}
          {mapsUrl(event) && !["past", "cancelled"].includes(moment) && <Button size="sm" variant="outline-light" onClick={() => openDirections(event)} title="Abrir localização">
            <i className="fa-solid fa-route" />
          </Button>}
          {event?.slug && <Button size="sm" variant="outline-light" onClick={() => shareEvent(event)} title="Compartilhar evento sem expor o QR">
            <i className="fa-solid fa-share-nodes" />
          </Button>}
          {purchase?.public_id && <Button size="sm" variant="outline-light" onClick={() => openPurchase(purchase)} title="Ver compra e recibo">
            <i className="fa-regular fa-file-lines" />
          </Button>}
        </div>
      </div>
    </Card>;
  };

  const renderTransfer = (group) => {
    const transfer = group.data;
    const event = transfer.event || {};
    return <Card key={group.key} className="cut-wallet-card cut-wallet-transfer is-past">
      <div className="cut-wallet-card__accent" />
      <div className="cut-wallet-card__top">
        <EventArtwork event={event} />
        <div className="cut-wallet-card__main">
          <div className="cut-wallet-card__badges">
            <Badge bg="primary">Transferido</Badge>
            <Badge bg="dark">{transfer.ticket?.name || "Ingresso"}</Badge>
          </div>
          <span className="cut-wallet-card__production">{productionName(event)}</span>
          <h3>{event.title || "Evento"}</h3>
          <EventMeta event={event} />
        </div>
      </div>
      <div className="cut-wallet-card__lifecycle">
        Transferido para <strong>{transfer.recipient_name || transfer.recipient_email}</strong> em {dateTime(transfer.transferred_at)}.
      </div>
      <div className="cut-wallet-card__footer">
        <div className="cut-wallet-card__footer-note">{transfer.reference || `Transferência #${transfer.id}`}</div>
        <div className="cut-wallet-card__footer-actions">
          {event?.slug && <Button size="sm" onClick={() => openEvent(event)}>Ver evento</Button>}
          {event?.slug && !event?.is_cancelled && eventMoment(event, nowMs) !== "past" && <Button size="sm" variant="outline-light" onClick={() => buyMore(event)}>Comprar outro</Button>}
          {event?.slug && <Button size="sm" variant="outline-light" onClick={() => shareEvent(event)} title="Compartilhar evento"><i className="fa-solid fa-share-nodes" /></Button>}
        </div>
      </div>
    </Card>;
  };

  const renderPending = (group) => {
    const order = group.data;
    const event = order.event || {};
    return <Card key={group.key} className="cut-wallet-card cut-wallet-pending">
      <div className="cut-wallet-card__accent" />
      <div className="cut-wallet-card__top">
        <EventArtwork event={event} />
        <div className="cut-wallet-card__main">
          <div className="cut-wallet-card__badges">
            <Badge bg="warning" text="dark">Pagamento pendente</Badge>
            <Badge bg="dark">{money(order.total)}</Badge>
          </div>
          <span className="cut-wallet-card__production">{order.production?.name || productionName(event)}</span>
          <h3>{event.title || "Evento"}</h3>
          <EventMeta event={event} />
        </div>
      </div>
      <div className="cut-wallet-card__lifecycle">
        <strong>Seu ingresso ainda não foi emitido.</strong> Conclua o pagamento para liberar os QR Codes desta compra.
      </div>
      <div className="cut-wallet-card__footer">
        <div className="cut-wallet-card__footer-note">
          Pedido #{String(order.public_id || order.id || "").slice(0, 8).toUpperCase()}
        </div>
        <div className="cut-wallet-card__footer-actions">
          <Button size="sm" variant="warning" onClick={() => openPurchase(order)}>
            <i className="fa-brands fa-pix me-1" />Retomar pagamento
          </Button>
          {event?.slug && <Button size="sm" variant="outline-light" onClick={() => openEvent(event)}>Evento</Button>}
        </div>
      </div>
    </Card>;
  };

  const displayedPassCount = visibleItems.filter((item) => item.kind === "pass").length;
  const walletHasAnything = rawItems.length > 0;

  return <div className="cut-app-page cut-wallet-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <section className="cut-wallet-hero">
        <div className="cut-wallet-hero__content">
          <span className="cut-eyebrow">Central do participante</span>
          <h1>Meus ingressos</h1>
          <p>Do pagamento ao Reviva: organize seus ingressos, prepare sua entrada, acompanhe transferências e volte aos eventos que você viveu.</p>
          <div className="cut-wallet-hero__actions">
            <Button onClick={() => navigate("/event")}><i className="fa-solid fa-compass me-2" />Encontrar eventos</Button>
            <Button variant="outline-light" onClick={() => navigate("/purchases")}><i className="fa-regular fa-receipt me-2" />Minhas compras</Button>
          </div>
        </div>
        <div className="cut-wallet-hero__summary" aria-label="Resumo da carteira">
          <div className="cut-wallet-stat"><strong>{summary.total ?? passes.length}</strong><span>Ingressos</span></div>
          <div className="cut-wallet-stat"><strong>{counts.upcoming + counts.today}</strong><span>Próximos</span></div>
          <div className="cut-wallet-stat"><strong>{counts.past}</strong><span>Vividos</span></div>
          <div className="cut-wallet-stat"><strong>{counts.pending}</strong><span>Pendentes</span></div>
        </div>
      </section>

      {error && <Alert variant="danger">{error}</Alert>}
      {partialWarning && <Alert variant="info" dismissible onClose={() => setPartialWarning("")}>{partialWarning}</Alert>}

      {loading && <Card className="cut-wallet-toolbar mb-3"><Card.Body className="d-flex align-items-center gap-3">
        <Spinner animation="border" size="sm" /><span>Organizando sua carteira...</span>
      </Card.Body></Card>}

      {!loading && nextPass && <Card className="cut-wallet-next mb-3">
        <div className="cut-wallet-next__body">
          <EventArtwork event={nextPass.event} large />
          <div className="cut-wallet-next__info">
            <span className="cut-eyebrow">{passState(nextPass, nowMs).key === "today" ? "Seu evento é hoje" : "Seu próximo evento"}</span>
            <h2>{nextPass.event?.title || "Evento"}</h2>
            <div className="cut-wallet-next__meta">
              <span><i className="fa-regular fa-calendar" />{dateTime(nextPass.event?.start_date)}</span>
              <span><i className="fa-solid fa-location-dot" />{eventLocation(nextPass.event)}</span>
              {nextCountdown && <span><i className="fa-solid fa-hourglass-half" />{nextCountdown}</span>}
            </div>
          </div>
          <div className="cut-wallet-next__actions">
            <Button onClick={() => navigate(`/passes/${nextPass.id}`)}><i className="fa-solid fa-qrcode me-2" />Abrir ingresso</Button>
            {mapsUrl(nextPass.event) && <Button variant="outline-light" onClick={() => openDirections(nextPass.event)}>Como chegar</Button>}
          </div>
        </div>
      </Card>}

      <Card className="cut-wallet-toolbar mb-3">
        <Card.Body>
          <div className="cut-wallet-filter-tabs" role="tablist" aria-label="Situação dos ingressos">
            {PASS_FILTERS.map(([key, label]) => <button
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? "active" : ""}
              key={key}
              onClick={() => setFilter(key)}
            >
              {label}<small>{counts[key] || 0}</small>
            </button>)}
          </div>

          <CollapsibleFilterPanel title="Pesquisar e organizar" activeCount={activeFilterCount} defaultOpen={Boolean(activeFilterCount)}>
            <div className="cut-wallet-filter-grid">
              <div className="cut-search-bar">
                <i className="fa-solid fa-magnifying-glass" />
                <Form.Control
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Evento, produção, cidade, ingresso ou compra"
                  aria-label="Pesquisar meus ingressos"
                />
              </div>
              <Form.Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordenar ingressos">
                <option value="nearest">Evento mais próximo</option>
                <option value="newest">Compra mais recente</option>
                <option value="name">Nome do evento</option>
              </Form.Select>
              <Form.Select value={priceMode} onChange={(event) => setPriceMode(event.target.value)} aria-label="Filtrar por tipo de ingresso">
                <option value="all">Pagos e cortesias</option>
                <option value="paid">Somente pagos</option>
                <option value="free">Somente cortesias</option>
              </Form.Select>
              <div className="cut-wallet-filter-grid__view d-flex gap-2">
                <Button size="sm" variant={viewMode === "cards" ? "primary" : "outline-light"} onClick={() => changeView("cards")} title="Visualização em cards">
                  <i className="fa-solid fa-grip" />
                </Button>
                <Button size="sm" variant={viewMode === "compact" ? "primary" : "outline-light"} onClick={() => changeView("compact")} title="Visualização compacta">
                  <i className="fa-solid fa-bars" />
                </Button>
                {activeFilterCount > 0 && <Button size="sm" variant="outline-light" onClick={clearFilters}>Limpar</Button>}
              </div>
            </div>
          </CollapsibleFilterPanel>
        </Card.Body>
      </Card>

      <div className="cut-wallet-results-head">
        <div>
          <h2>{filter === "all" ? "Sua carteira" : PASS_FILTERS.find(([key]) => key === filter)?.[1] || "Ingressos"}</h2>
          <p>{visibleItems.length} registro(s) · {displayedPassCount} ingresso(s) nesta visão</p>
        </div>
        {filter === "past" && counts.past > 0 && <Button variant="outline-light" size="sm" onClick={() => navigate("/event")}>
          Descobrir o próximo rolê
        </Button>}
      </div>

      {!loading && groups.length === 0 && <div className="cut-wallet-empty">
        <i className={walletHasAnything ? "fa-solid fa-filter-circle-xmark" : "fa-solid fa-ticket"} />
        <h2>{walletHasAnything ? "Nada encontrado nesta visão" : "Sua carteira ainda está vazia"}</h2>
        <p>{walletHasAnything
          ? "Ajuste a busca ou os filtros para encontrar o ingresso, transferência ou pagamento que procura."
          : "Quando você comprar ou receber uma cortesia, seus ingressos aparecerão aqui com tudo que precisa para o evento."}</p>
        <div className="d-flex flex-wrap gap-2 justify-content-center">
          {walletHasAnything && <Button variant="outline-light" onClick={clearFilters}>Limpar filtros</Button>}
          <Button onClick={() => navigate("/event")}>Explorar eventos</Button>
        </div>
      </div>}

      {groups.length > 0 && <div className={`cut-wallet-grid ${viewMode === "compact" ? "is-compact" : ""}`}>
        {groups.map((group) => {
          if (group.kind === "transfer") return renderTransfer(group);
          if (group.kind === "pending") return renderPending(group);
          return renderPassGroup(group);
        })}
      </div>}

      {!loading && nextPass && <div className="cut-wallet-mobile-primary">
        <Button size="lg" onClick={() => navigate(`/passes/${nextPass.id}`)}>
          <i className="fa-solid fa-qrcode me-2" />Abrir próximo ingresso
        </Button>
      </div>}

      {!loading && passes.length > 0 && <div className="mt-4 text-center text-body-secondary small">
        <i className="fa-solid fa-shield-halved me-2" />
        Por segurança, QR Codes não aparecem nesta listagem. Abra o ingresso individual para apresentá-lo na entrada.
      </div>}
    </Container>
  </div>;
}
