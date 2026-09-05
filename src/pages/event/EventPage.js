import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import locationService from "../../services/LocationService";
import { storageUrl } from "../../config";
import { PERIOD_OPTIONS, paramsFromSearch, periodLabel, readDiscoveryPreference, readRecentCities, saveDiscoveryPreference } from "../../utils/discoveryFilters";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Data não informada";

export default function EventPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [facets, setFacets] = useState({ cities: [], categories: [] });
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState(() => locationService.readStored());
  const [draftSearch, setDraftSearch] = useState(searchParams.get("q") || "");

  const filters = useMemo(() => paramsFromSearch(searchParams), [searchParams]);
  const recentCities = useMemo(() => readRecentCities(), [filters.city]);

  useEffect(() => {
    cutinappService.discoveryFacets().then(setFacets).catch(() => {});
  }, []);

  useEffect(() => {
    if (!filters.lat || !filters.lng) {
      if (detectedLocation?.mode === "nearby") setDetectedLocation(null);
      return undefined;
    }

    const stored = locationService.readStored();
    if (locationService.sameCoordinates(stored, filters.lat, filters.lng)) {
      setDetectedLocation(stored);
      return undefined;
    }

    let active = true;
    locationService.resolveCoordinates(filters.lat, filters.lng).then((location) => {
      if (!active) return;
      locationService.saveStored(location);
      setDetectedLocation(location);
    });
    return () => { active = false; };
  }, [filters.lat, filters.lng]);

  useEffect(() => {
    const current = paramsFromSearch(searchParams);
    const precise = locationService.readStored();
    const saved = readDiscoveryPreference();

    if (!current.city && !current.lat && precise?.lat && precise?.lng && !searchParams.has("lat")) {
      const next = new URLSearchParams(searchParams);
      next.set("lat", precise.lat);
      next.set("lng", precise.lng);
      next.set("radius_km", "80");
      next.set("sort", "nearest");
      setSearchParams(next, { replace: true });
      return;
    }

    if (!current.city && !current.lat && saved.city && !searchParams.has("city")) {
      const next = new URLSearchParams(searchParams);
      next.set("city", saved.city);
      if (saved.uf) next.set("uf", saved.uf);
      setSearchParams(next, { replace: true });
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    eventService.search({ ...current, per_page: 24 })
      .then((response) => {
        if (!active) return;
        setEvents(response.events?.data || []);
        setPagination(response.events || null);
      })
      .catch((err) => active && setError(err?.message || "Não foi possível buscar eventos agora."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [searchParams, setSearchParams]);

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "" || value === false) next.delete(key);
      else next.set(key, String(value));
    });
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next);
    const city = changes.city ?? next.get("city");
    const uf = changes.uf ?? next.get("uf");
    if (city) saveDiscoveryPreference({ city, uf: uf || "" });
  };

  const submitSearch = (e) => {
    e.preventDefault();
    update({ q: draftSearch.trim() });
  };

  const useMyLocation = async () => {
    if (!navigator.geolocation) {
      setError("Seu navegador não oferece localização. Você pode escolher a cidade manualmente.");
      return;
    }
    setLocationBusy(true);
    setError("");
    try {
      const location = await locationService.detectCurrent({ timeout: 8000 });
      setDetectedLocation(location);
      update({
        lat: location.lat,
        lng: location.lng,
        radius_km: 80,
        city: "",
        uf: "",
        sort: "nearest",
      });
    } catch (locationError) {
      setError(locationError?.code === 1
        ? "A permissão de localização foi negada. Escolha uma cidade manualmente."
        : "Não foi possível acessar sua localização. Escolha uma cidade manualmente.");
    } finally {
      setLocationBusy(false);
    }
  };

  const chooseCity = (value) => {
    const [city, uf] = value.split("|");
    if (!city) {
      locationService.clearStored();
      saveDiscoveryPreference({ city: "", uf: "" });
      setDetectedLocation(null);
      update({ city: "", uf: "", lat: "", lng: "", radius_km: "", sort: filters.sort === "nearest" ? "soonest" : filters.sort });
      return;
    }

    const location = { city, uf: uf || "", label: `${city}${uf ? ` - ${uf}` : ""}`, mode: "city" };
    locationService.saveStored(location);
    setDetectedLocation(location);
    update({ city, uf, lat: "", lng: "", radius_km: "", sort: filters.sort === "nearest" ? "soonest" : filters.sort });
  };

  const clearGpsLocation = () => {
    locationService.clearStored();
    saveDiscoveryPreference({ city: "", uf: "" });
    setDetectedLocation(null);
    update({ lat: "", lng: "", radius_km: "", sort: filters.sort === "nearest" ? "soonest" : filters.sort });
  };

  const clearFilters = () => {
    setDraftSearch("");
    locationService.clearStored();
    saveDiscoveryPreference({ city: "", uf: "" });
    setDetectedLocation(null);
    setSearchParams(new URLSearchParams());
  };

  const locationLabel = detectedLocation?.label
    || (detectedLocation?.city ? `${detectedLocation.city}${detectedLocation.uf ? ` - ${detectedLocation.uf}` : ""}` : "")
    || "Sua localização atual";

  const activeChips = [
    filters.city && { key: "city", label: `${filters.city}${filters.uf ? ` - ${filters.uf}` : ""}` },
    filters.period && { key: "period", label: periodLabel(filters.period) },
    filters.category && { key: "category", label: filters.category },
    filters.q && { key: "q", label: `“${filters.q}”` },
    filters.free && { key: "free", label: "Gratuitos" },
    filters.available && { key: "available", label: "Com ingressos" },
    filters.lat && { key: "lat", label: `${locationLabel} · ${filters.radius_km || 80} km` },
  ].filter(Boolean);

  const cityValue = filters.city ? `${filters.city}|${filters.uf || ""}` : "";

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Buscando eventos" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Descoberta</span>
            <h1>{filters.city ? `Eventos em ${filters.city}` : filters.lat ? `Eventos perto de ${locationLabel}` : "Encontre seu próximo evento"}</h1>
            <p>Busque pela cidade, pelo dia, pelo artista ou pela produção. Os filtros ficam na URL para você compartilhar a descoberta.</p>
          </div>
          <Button variant="outline-light" onClick={() => navigate("/passes")}>Minha carteira</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Card className="cut-discovery-shell mb-4"><Card.Body>
          {filters.lat && filters.lng && <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 border rounded-4 p-3 mb-3">
            <div className="d-grid gap-1">
              <small className="text-uppercase opacity-50 fw-bold">Localização encontrada</small>
              <strong><i className="fa-solid fa-location-dot me-2" />{locationLabel}</strong>
              <small className="opacity-75">Os eventos estão ordenados do mais perto para o mais distante em um raio de {filters.radius_km || 80} km.</small>
            </div>
            <Button size="sm" variant="outline-light" onClick={() => document.getElementById("cut-location-city-filter")?.focus()}>Alterar localização</Button>
          </div>}

          <div className="cut-discovery-primary">
            <Form.Select id="cut-location-city-filter" value={cityValue} onChange={(e) => chooseCity(e.target.value)} aria-label="Alterar localização por cidade">
              <option value="">Todas as cidades</option>
              {facets.cities?.map((item) => <option key={`${item.city}-${item.uf}`} value={`${item.city}|${item.uf || ""}`}>{item.city}{item.uf ? ` - ${item.uf}` : ""} ({item.total})</option>)}
            </Form.Select>
            <Form.Select value={filters.period || ""} onChange={(e) => update({ period: e.target.value, date: "", from: "", to: "" })} aria-label="Período">
              <option value="">Qualquer data</option>
              {PERIOD_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Form.Select>
            <Button variant="outline-light" onClick={useMyLocation} disabled={locationBusy}><i className="fa-solid fa-location-crosshairs me-2" />{locationBusy ? "Localizando..." : filters.lat ? "Atualizar localização" : "Usar minha localização"}</Button>
          </div>

          <form className="cut-search-bar" onSubmit={submitSearch}>
            <i className="fa-solid fa-magnifying-glass" />
            <Form.Control value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} placeholder="Evento, artista, produção, cidade ou local" />
            <Button type="submit">Buscar</Button>
          </form>

          <div className="cut-filter-shortcuts">
            {[['today','Hoje'],['tomorrow','Amanhã'],['weekend','Fim de semana'],['saturday','Sábado'],['next7','7 dias']].map(([key, label]) =>
              <button type="button" key={key} className={filters.period === key ? "active" : ""} onClick={() => update({ period: filters.period === key ? "" : key, date: "", from: "", to: "" })}>{label}</button>
            )}
            <button type="button" className={filters.free ? "active" : ""} onClick={() => update({ free: filters.free ? "" : 1 })}>Gratuitos</button>
            <button type="button" className={filters.available ? "active" : ""} onClick={() => update({ available: filters.available ? "" : 1 })}>Com ingressos</button>
          </div>

          <div className="cut-discovery-secondary">
            <Form.Select value={filters.category || ""} onChange={(e) => update({ category: e.target.value })}>
              <option value="">Todas as categorias</option>
              {facets.categories?.map((item) => <option key={item.category} value={item.category}>{item.category} ({item.total})</option>)}
            </Form.Select>
            <Form.Control type="date" value={filters.date || ""} onChange={(e) => update({ date: e.target.value, period: e.target.value ? "" : filters.period, from: "", to: "" })} />
            <Form.Select value={filters.sort || (filters.lat ? "nearest" : "soonest")} onChange={(e) => update({ sort: e.target.value })}>
              <option value="nearest" disabled={!filters.lat}>Mais perto da minha localização</option>
              <option value="soonest">Mais próximos na data</option>
              <option value="newest">Novidades</option>
              <option value="popular">Populares</option>
            </Form.Select>
          </div>

          {recentCities.length > 0 && <div className="cut-recent-cities"><span>Recentes:</span>{recentCities.map((item) => <button type="button" key={`${item.city}-${item.uf}`} onClick={() => chooseCity(`${item.city}|${item.uf || ""}`)}>{item.city}</button>)}</div>}
          {activeChips.length > 0 && <div className="cut-active-filters">{activeChips.map((chip) => <button type="button" key={chip.key} onClick={() => chip.key === "lat" ? clearGpsLocation() : update({ [chip.key]: "", ...(chip.key === "city" ? { uf: "" } : {}) })}>{chip.label} <span>×</span></button>)}<button type="button" className="cut-clear-filters" onClick={clearFilters}>Limpar filtros</button></div>}
        </Card.Body></Card>

        {!loading && events.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body>
            <i className="fa-regular fa-calendar-xmark cut-empty-icon" />
            <h2>{filters.city ? `Não encontramos eventos em ${filters.city}${filters.period ? ` para ${periodLabel(filters.period).toLowerCase()}` : ""}.` : filters.lat ? `Não encontramos eventos em até ${filters.radius_km || 80} km de ${locationLabel}.` : "Nenhum evento encontrado com esses filtros."}</h2>
            <p>Experimente ampliar o período, remover uma categoria ou explorar outras cidades.</p>
            <div className="cut-card-actions justify-content-center">
              <Button onClick={() => update({ period: "next30", date: "", from: "", to: "" })}>Ver próximos 30 dias</Button>
              {filters.category && <Button variant="outline-light" onClick={() => update({ category: "" })}>Remover categoria</Button>}
              <Button variant="outline-light" onClick={clearFilters}>Ver todos os eventos</Button>
            </div>
          </Card.Body></Card>
        ) : (
          <Row className="g-4">
            {events.map((event) => <Col md={6} xl={4} key={event.id}>
              <Card className="cut-event-card h-100" role="button" onClick={() => navigate(`/event/${event.slug}`)}>
                <div className="cut-event-card__media">
                  {event.image ? <img src={`${storageUrl}${String(event.image).replace(/^\//, "")}`} alt={event.title} /> : <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>}
                  {event.category && <Badge bg="dark" className="cut-event-card__category">{event.category}</Badge>}
                  {event.free_ticket_lots_count > 0 && <Badge bg="success" className="cut-event-card__badge">Gratuito</Badge>}
                </div>
                <Card.Body className="p-4">
                  <span className="cut-eyebrow">{event.production?.name || "Cutinapp"}</span>
                  <h2>{event.title}</h2>
                  <div className="cut-event-card__meta">
                    <span><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
                    <span><i className="fa-solid fa-location-dot" />{event.venue || event.city || event.address || "Local a confirmar"}{event.city && event.venue ? ` · ${event.city}` : ""}</span>
                    {event.artists?.length > 0 && <span><i className="fa-solid fa-music" />{event.artists.slice(0, 3).map((a) => a.stage_name).join(" · ")}</span>}
                    {event.distance_km != null && <span><i className="fa-solid fa-route" />{Number(event.distance_km).toFixed(1)} km de você</span>}
                  </div>
                </Card.Body>
              </Card>
            </Col>)}
          </Row>
        )}

        {pagination?.last_page > 1 && <div className="cut-pagination mt-4">
          <Button variant="outline-light" disabled={pagination.current_page <= 1} onClick={() => update({ page: pagination.current_page - 1 })}>Anterior</Button>
          <span>Página {pagination.current_page} de {pagination.last_page}</span>
          <Button variant="outline-light" disabled={pagination.current_page >= pagination.last_page} onClick={() => update({ page: pagination.current_page + 1 })}>Próxima</Button>
        </div>}
      </Container>
    </div>
  );
}
