import React, { useContext, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Collapse, Container, Form, Row } from "react-bootstrap";
import { Link, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import "./production-experience.css";

const mediaUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const initials = (name) => String(name || "P")
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const compactNumber = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatMetric = (value) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? compactNumber.format(Math.max(0, numeric)) : "0";
};

const ratingValue = (production) => {
  const average = Number(production?.rating_average ?? 0);
  const total = Number(production?.ratings_count ?? 0);
  return {
    average: Number.isFinite(average) ? average : 0,
    total: Number.isFinite(total) ? total : 0,
  };
};

export default function ProductionListPage() {
  const { user } = useContext(AuthContext);
  const [params, setParams] = useSearchParams();
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ current: 1, last: 1, total: 0 });
  const [search, setSearch] = useState(params.get("q") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [filtersOpen, setFiltersOpen] = useState(Boolean(params.get("q") || params.get("city")));

  const q = params.get("q") || "";
  const cityFilter = params.get("city") || "";
  const page = Math.max(1, Number(params.get("page") || 1));

  useEffect(() => {
    setSearch(q);
    setCity(cityFilter);
    if (q || cityFilter) setFiltersOpen(true);
  }, [q, cityFilter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    cutinappService.publicProductions({
      q: q || undefined,
      city: cityFilter || undefined,
      page,
      per_page: 24,
    })
      .then((response) => {
        if (!active) return;
        const payload = response?.productions;
        const items = Array.isArray(payload) ? payload : payload?.data || [];
        setProductions(items);
        setPagination({
          current: Number(payload?.current_page || page),
          last: Math.max(1, Number(payload?.last_page || 1)),
          total: Number(payload?.total || items.length),
        });
      })
      .catch((err) => {
        if (!active) return;
        setProductions([]);
        setError(err?.response?.data?.message || err?.message || "Não foi possível carregar as produções da Cutinapp.");
      })
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [q, cityFilter, page]);

  const submitFilters = (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (city.trim()) next.set("city", city.trim());
    setParams(next);
  };

  const clearFilters = () => {
    setSearch("");
    setCity("");
    setParams(new URLSearchParams());
  };

  const goToPage = (nextPage) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="cut-app-page cut-production-discovery-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Buscando produções" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading cut-production-discovery-heading">
          <div>
            <span className="cut-eyebrow">Quem movimenta a cena</span>
            <h1>Produções da Cutinapp</h1>
            <p>Conheça quem cria experiências, acompanhe sua evolução e descubra os próximos nomes por trás dos eventos da sua cidade.</p>
          </div>
          <Button as={Link} to={user ? "/production/create" : "/login"}>
            <i className="fa-solid fa-plus me-2" />
            {user ? "Criar produção" : "Entrar para produzir"}
          </Button>
        </div>

        <div className="cut-production-discovery-toolbar mb-4">
          <div className="cut-production-discovery-total" aria-live="polite">
            <strong>{formatMetric(pagination.total)}</strong>
            <span>{pagination.total === 1 ? "produção pública" : "produções públicas"}</span>
          </div>
          <Button
            type="button"
            variant="outline-light"
            className="cut-production-filter-toggle"
            aria-controls="production-discovery-filters"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <i className="fa-solid fa-sliders me-2" />
            Pesquisar e filtrar
            {(q || cityFilter) && <span className="cut-production-filter-dot" aria-label="Filtros ativos" />}
            <i className={`fa-solid fa-chevron-${filtersOpen ? "up" : "down"} ms-2`} />
          </Button>
        </div>

        <Collapse in={filtersOpen}>
          <div id="production-discovery-filters">
            <Card className="cut-panel cut-production-filter-panel mb-4">
              <Card.Body className="p-3 p-lg-4">
                <Form onSubmit={submitFilters}>
                  <Row className="g-3 align-items-end">
                    <Col md={6}>
                      <Form.Label>Buscar produção</Form.Label>
                      <Form.Control
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Nome da produção"
                        aria-label="Buscar produção pelo nome"
                      />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Cidade</Form.Label>
                      <Form.Control
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        placeholder="Ex.: Belo Horizonte"
                        aria-label="Filtrar produções por cidade"
                      />
                    </Col>
                    <Col md={2} className="d-grid gap-2">
                      <Button type="submit"><i className="fa-solid fa-magnifying-glass me-2" />Buscar</Button>
                    </Col>
                  </Row>
                  {(q || cityFilter) && (
                    <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mt-3">
                      <small className="text-muted">{pagination.total} produção(ões) encontrada(s)</small>
                      <Button type="button" variant="outline-light" size="sm" onClick={clearFilters}>Limpar filtros</Button>
                    </div>
                  )}
                </Form>
              </Card.Body>
            </Card>
          </div>
        </Collapse>

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && productions.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Nenhuma produção encontrada</h2>
              <p>{q || cityFilter ? "Tente outro nome ou cidade." : "As produções públicas cadastradas na Cutinapp aparecerão aqui."}</p>
              {(q || cityFilter) && <Button onClick={clearFilters}>Ver todas as produções</Button>}
            </Card.Body>
          </Card>
        ) : (
          <Row className="g-4 cut-production-discovery-grid">
            {productions.map((production) => {
              const rating = ratingValue(production);
              const background = mediaUrl(production.background);
              const location = production.city
                ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}`
                : "Localização não informada";

              return (
                <Col sm={6} lg={4} xl={3} key={production.id}>
                  <Link
                    to={`/production/${production.slug}/public`}
                    className="cut-production-discovery-card"
                    aria-label={`Ver produção ${production.name}`}
                    style={background ? { "--cut-production-cover": `url("${background}")` } : undefined}
                  >
                    <div className="cut-production-discovery-card__cover" aria-hidden="true" />
                    <div className="cut-production-discovery-card__topline">
                      <Badge bg="dark" className="cut-production-discovery-badge">Produção</Badge>
                      <span
                        className={`cut-production-rating ${rating.total > 0 ? "is-rated" : ""}`}
                        title={rating.total > 0 ? `Média de ${rating.total} avaliação(ões) dos eventos desta produção` : "Ainda sem avaliações"}
                      >
                        <i className="fa-solid fa-star" />
                        <strong>{rating.total > 0 ? rating.average.toFixed(1).replace(".", ",") : "—"}</strong>
                        <small>{rating.total > 0 ? `(${formatMetric(rating.total)})` : "nova"}</small>
                      </span>
                    </div>

                    <div className="cut-production-discovery-card__content">
                      <div className="cut-production-discovery-card__identity">
                        <div className="cut-production-discovery-logo">
                          {production.logo ? (
                            <img src={mediaUrl(production.logo)} alt={`Logo de ${production.name}`} loading="lazy" />
                          ) : (
                            <span>{initials(production.name)}</span>
                          )}
                        </div>
                        <div className="cut-production-discovery-name">
                          <h2>{production.name}</h2>
                          <p><i className="fa-solid fa-location-dot" /> {location}</p>
                        </div>
                      </div>

                      <div className="cut-production-discovery-metrics" aria-label={`Indicadores de ${production.name}`}>
                        <span title="Visualizações da produção">
                          <i className="fa-regular fa-eye" />
                          <strong>{formatMetric(production.views_count)}</strong>
                          <small>views</small>
                        </span>
                        <span title="Seguidores da produção">
                          <i className="fa-solid fa-user-group" />
                          <strong>{formatMetric(production.followers_count)}</strong>
                          <small>seguidores</small>
                        </span>
                        <span title="Eventos públicos da produção">
                          <i className="fa-regular fa-calendar" />
                          <strong>{formatMetric(production.events_count)}</strong>
                          <small>eventos</small>
                        </span>
                        <span title="Itens ativos da produção">
                          <i className="fa-solid fa-bag-shopping" />
                          <strong>{formatMetric(production.items_count)}</strong>
                          <small>itens</small>
                        </span>
                      </div>

                      <div className="cut-production-discovery-card__footer">
                        <span>{formatMetric(production.upcoming_events_count)} {Number(production.upcoming_events_count || 0) === 1 ? "próximo evento" : "próximos eventos"}</span>
                        <strong>Ver produção <i className="fa-solid fa-arrow-right" /></strong>
                      </div>
                    </div>
                  </Link>
                </Col>
              );
            })}
          </Row>
        )}

        {!loading && pagination.last > 1 && (
          <div className="d-flex align-items-center justify-content-center gap-3 mt-5">
            <Button variant="outline-light" disabled={pagination.current <= 1} onClick={() => goToPage(pagination.current - 1)}>
              <i className="fa-solid fa-chevron-left me-2" />Anterior
            </Button>
            <span className="text-muted">Página {pagination.current} de {pagination.last}</span>
            <Button variant="outline-light" disabled={pagination.current >= pagination.last} onClick={() => goToPage(pagination.current + 1)}>
              Próxima<i className="fa-solid fa-chevron-right ms-2" />
            </Button>
          </div>
        )}
      </Container>
    </div>
  );
}
