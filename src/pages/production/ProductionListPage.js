import React, { useContext, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { Link, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

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

export default function ProductionListPage() {
  const { user } = useContext(AuthContext);
  const [params, setParams] = useSearchParams();
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ current: 1, last: 1, total: 0 });
  const [search, setSearch] = useState(params.get("q") || "");
  const [city, setCity] = useState(params.get("city") || "");

  const q = params.get("q") || "";
  const cityFilter = params.get("city") || "";
  const page = Math.max(1, Number(params.get("page") || 1));

  useEffect(() => {
    setSearch(q);
    setCity(cityFilter);
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
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Buscando produções" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Quem movimenta a cena</span>
            <h1>Produções da Cutinapp</h1>
            <p>Descubra produtoras, casas, coletivos e equipes responsáveis pelos eventos publicados na Cutinapp.</p>
          </div>
          <Button as={Link} to={user ? "/production/create" : "/login"}>
            <i className="fa-solid fa-plus me-2" />
            {user ? "Criar produção" : "Entrar para produzir"}
          </Button>
        </div>

        <Card className="cut-panel mb-4">
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
          <Row className="g-4">
            {productions.map((production) => (
              <Col sm={6} lg={4} xl={3} key={production.id}>
                <Card className="cut-panel h-100 overflow-hidden">
                  <div className="ratio ratio-4x3 bg-dark">
                    {production.logo ? (
                      <img
                        src={mediaUrl(production.logo)}
                        alt={`Logo de ${production.name}`}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div className="d-flex align-items-center justify-content-center fs-1 fw-bold">{initials(production.name)}</div>
                    )}
                  </div>
                  <Card.Body className="d-flex flex-column p-4">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <Badge bg="secondary">Produção</Badge>
                      <small className="text-muted">{production.upcoming_events_count || 0} próximo(s)</small>
                    </div>
                    <Card.Title as="h2" className="h5 mb-2">{production.name}</Card.Title>
                    <p className="text-muted mb-3">
                      <i className="fa-solid fa-location-dot me-2" />
                      {production.city ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}` : "Localização não informada"}
                    </p>
                    {production.description && <p className="mb-3">{String(production.description).slice(0, 130)}{String(production.description).length > 130 ? "…" : ""}</p>}
                    <div className="cut-social-stats mt-auto mb-3">
                      <span>{production.followers_count || 0} seguidores</span>
                      <span>{production.upcoming_events_count || 0} eventos</span>
                    </div>
                    <Button as={Link} to={`/production/${production.slug}/public`} className="w-100">Ver produção</Button>
                  </Card.Body>
                </Card>
              </Col>
            ))}
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
