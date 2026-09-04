import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Container, Dropdown, Form, Modal } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import "./production-experience.css";

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const productionBackground = (production) => production?.background || production?.background_image || production?.cover || "";
const productionThemeStyle = (production) => {
  const background = productionBackground(production);
  return background ? { "--cut-production-card-bg": `url(${imageUrl(background)})` } : undefined;
};
const productionCoverStyle = (production) => {
  const background = productionBackground(production);
  return background ? { backgroundImage: `url(${imageUrl(background)})` } : undefined;
};
const productionKind = (production) => {
  if (production?.type === "fixed") return { icon: "fa-store", label: "Espaço fixo" };
  if (production?.type === "independent") return { icon: "fa-bolt", label: "Produção independente" };
  return { icon: "fa-clapperboard", label: "Produção" };
};
const apiErrorMessage = (err, fallback) => err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function ProductionMinePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [productionToDelete, setProductionToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let active = true;
    cutinappService.myProductions()
      .then((productions) => active && setItems(Array.isArray(productions) ? productions : []))
      .catch((err) => active && setError(apiErrorMessage(err, "Não foi possível carregar suas produções.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = normalize(query).trim();
    if (!term) return items;
    return items.filter((production) => normalize([
      production.name, production.fantasy, production.city, production.uf, production.cnpj,
    ].filter(Boolean).join(" ")).includes(term));
  }, [items, query]);

  const totalEvents = useMemo(() => items.reduce((sum, item) => sum + Number(item.events_count || 0), 0), [items]);
  const located = useMemo(() => items.filter((item) => item.city || item.address || item.formatted_address).length, [items]);
  const withoutEvents = useMemo(() => items.filter((item) => Number(item.events_count || 0) === 0).length, [items]);

  const askDeleteProduction = (production) => { setError(""); setSuccess(""); setProductionToDelete(production); };
  const closeDeleteModal = () => { if (!deletingId) setProductionToDelete(null); };
  const deleteProduction = async () => {
    if (!productionToDelete?.id || deletingId) return;
    const id = productionToDelete.id;
    const name = productionToDelete.name || "Produção";
    setDeletingId(id);
    setError("");
    setSuccess("");
    try {
      const response = await cutinappService.deleteProduction(id);
      setItems((current) => current.filter((production) => production.id !== id));
      setProductionToDelete(null);
      setSuccess(response?.message || `${name} excluída com sucesso.`);
    } catch (err) {
      setProductionToDelete(null);
      setError(apiErrorMessage(err, "Não foi possível excluir a produção."));
    } finally {
      setDeletingId(null);
    }
  };

  return <div className="cut-app-page cut-production-mine-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Carregando produções" />}

    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading cut-production-mine-heading">
        <div>
          <span className="cut-eyebrow">Área do produtor</span>
          <h1>Minhas produções</h1>
          <p>Gerencie suas marcas, espaços, eventos e recebimentos em um só lugar.</p>
        </div>
        <div className="cut-production-mine-heading__actions">
          <Button variant="outline-light" onClick={() => navigate("/producer/finance")}>
            <i className="fa-solid fa-wallet me-2" />Recebimentos
          </Button>
          <Button onClick={() => navigate("/production/create")}>
            <i className="fa-solid fa-plus me-2" />Nova produção
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {!loading && items.length > 0 && <>
        <div className="cut-production-mine-summary">
          <div className="cut-production-summary-card">
            <div className="cut-production-summary-card__icon"><i className="fa-solid fa-clapperboard" /></div>
            <div><span>Produções</span><strong>{items.length}</strong><small>marcas e espaços sob sua gestão</small></div>
          </div>
          <div className="cut-production-summary-card">
            <div className="cut-production-summary-card__icon"><i className="fa-regular fa-calendar-check" /></div>
            <div><span>Eventos cadastrados</span><strong>{totalEvents}</strong><small>programações vinculadas às produções</small></div>
          </div>
          <div className="cut-production-summary-card">
            <div className="cut-production-summary-card__icon"><i className="fa-solid fa-location-dot" /></div>
            <div><span>Com localização</span><strong>{located}</strong><small>produções prontas para descoberta local</small></div>
          </div>
          <div className={`cut-production-summary-card ${withoutEvents > 0 ? "is-attention" : ""}`}>
            <div className="cut-production-summary-card__icon"><i className="fa-solid fa-wand-magic-sparkles" /></div>
            <div><span>Sem eventos</span><strong>{withoutEvents}</strong><small>{withoutEvents > 0 ? "oportunidades para criar nova programação" : "todas já possuem programação"}</small></div>
          </div>
        </div>

        <div className="cut-production-mine-toolbar">
          <div className="cut-production-mine-toolbar__title">
            <span>Suas produções</span>
            <strong>{filtered.length === items.length ? `${items.length} cadastrada${items.length === 1 ? "" : "s"}` : `${filtered.length} encontrada${filtered.length === 1 ? "" : "s"}`}</strong>
          </div>
          <div className="cut-production-search">
            <i className="fa-solid fa-magnifying-glass" />
            <Form.Control
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, cidade ou estado"
              aria-label="Buscar produção"
            />
            {query && <button type="button" className="cut-production-search__clear" onClick={() => setQuery("")} aria-label="Limpar busca"><i className="fa-solid fa-xmark" /></button>}
          </div>
        </div>
      </>}

      {!loading && items.length === 0 ? (
        <Card className="cut-empty-state cut-production-empty-state">
          <Card.Body>
            <div className="cut-production-empty-state__icon"><i className="fa-solid fa-clapperboard" /></div>
            <h2>Crie sua primeira produção</h2>
            <p>Cadastre sua marca, produtora ou espaço e deixe tudo pronto para publicar eventos, receber público e acompanhar resultados.</p>
            <Button onClick={() => navigate("/production/create")}><i className="fa-solid fa-plus me-2" />Criar produção</Button>
          </Card.Body>
        </Card>
      ) : !loading && filtered.length === 0 ? (
        <div className="cut-production-empty-filter">
          <i className="fa-solid fa-magnifying-glass mb-2" />
          <h2>Nenhuma produção encontrada</h2>
          <p>Tente outro nome, cidade ou estado.</p>
          <Button variant="outline-light" size="sm" onClick={() => setQuery("")}>Limpar busca</Button>
        </div>
      ) : !loading && (
        <div className={`cut-production-manage-grid ${filtered.length === 1 ? "is-single" : ""}`}>
          {filtered.map((production) => {
            const deleting = deletingId === production.id;
            const locationLabel = [production.city, production.uf].filter(Boolean).join(" - ") || production.address || production.formatted_address || "Localização não informada";
            const kind = productionKind(production);
            const eventCount = Number(production.events_count || 0);
            const cityLabel = production.city || (production.address || production.formatted_address ? "Endereço cadastrado" : "Adicionar local");
            return <Card key={production.id} className="cut-production-card cut-production-themed-card cut-production-manage-card" style={productionThemeStyle(production)}>
              <div className="cut-production-manage-card__cover" style={productionCoverStyle(production)}>
                {!productionBackground(production) && <div className="cut-production-manage-card__cover-fallback"><i className="fa-solid fa-clapperboard" /></div>}
                <div className="cut-production-manage-card__cover-shade" />
                <span className="cut-production-manage-card__kind"><i className={`fa-solid ${kind.icon}`} />{kind.label}</span>
                <button type="button" className="cut-production-manage-card__view-link" onClick={() => navigate(`/production/${production.id}`)}>
                  Ver página <i className="fa-solid fa-arrow-up-right-from-square" />
                </button>
              </div>

              <Card.Body>
                <div className="cut-production-manage-card__head">
                  {production.logo ? (
                    <img src={imageUrl(production.logo)} alt={`Logo de ${production.name}`} className="cut-production-card__logo" />
                  ) : (
                    <div className="cut-production-card__logo cut-production-card__logo--placeholder">{String(production.name || "P").slice(0, 2).toUpperCase()}</div>
                  )}
                  <div className="cut-production-manage-card__title">
                    <h2 title={production.name}>{production.name}</h2>
                    <small title={locationLabel}><i className="fa-solid fa-location-dot me-1" />{locationLabel}</small>
                  </div>
                  <Dropdown align="end" className="cut-production-manage-card__menu">
                    <Dropdown.Toggle variant="outline-light" aria-label={`Mais opções de ${production.name}`}><i className="fa-solid fa-ellipsis" /></Dropdown.Toggle>
                    <Dropdown.Menu>
                      <Dropdown.Item onClick={() => navigate(`/production/edit/${production.id}`)}><i className="fa-regular fa-pen-to-square me-2" />Editar produção</Dropdown.Item>
                      <Dropdown.Item onClick={() => navigate(`/producer/finance?production=${production.id}`)}><i className="fa-solid fa-chart-line me-2" />Financeiro</Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item className="text-danger" onClick={() => askDeleteProduction(production)}><i className="fa-regular fa-trash-can me-2" />Excluir produção</Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>

                <div className="cut-production-manage-card__insights">
                  <div><i className="fa-regular fa-calendar" /><span>Eventos</span><strong>{eventCount}</strong></div>
                  <div><i className="fa-solid fa-location-dot" /><span>Local</span><strong title={cityLabel}>{cityLabel}</strong></div>
                  <div><i className="fa-regular fa-circle-check" /><span>Cadastro</span><strong>{production.cnpj ? "Completo" : "Ativo"}</strong></div>
                </div>

                {eventCount === 0 && <div className="cut-production-manage-card__callout">
                  <div><i className="fa-solid fa-sparkles" /><span><strong>Pronta para o primeiro evento</strong><small>Crie uma programação e comece a divulgar esta produção.</small></span></div>
                  <Button size="sm" variant="outline-light" onClick={() => navigate(`/event/create?productionId=${production.id}`)}>Criar agora</Button>
                </div>}

                <div className="cut-production-manage-actions">
                  <Button onClick={() => navigate(`/production/${production.id}`)} disabled={deleting}><i className="fa-solid fa-sliders me-2" />Gerenciar</Button>
                  <Button variant="outline-light" onClick={() => navigate(`/event/create?productionId=${production.id}`)} disabled={deleting}><i className="fa-solid fa-plus me-2" />Novo evento</Button>
                  <Button variant="outline-light" className="cut-production-manage-actions__edit" onClick={() => navigate(`/production/edit/${production.id}`)} disabled={deleting} aria-label={`Editar ${production.name}`}><i className="fa-regular fa-pen-to-square" /></Button>
                </div>
              </Card.Body>
            </Card>;
          })}
        </div>
      )}
    </Container>

    <Modal show={Boolean(productionToDelete)} onHide={closeDeleteModal} centered backdrop={deletingId ? "static" : true} keyboard={!deletingId}>
      <Modal.Header closeButton={!deletingId}><Modal.Title>Excluir produção</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="mb-2">Tem certeza que deseja excluir <strong>{productionToDelete?.name || "esta produção"}</strong>?</p>
        <p className="mb-0 text-muted">Esta ação não pode ser desfeita. Produções com ingressos emitidos não podem ser excluídas.</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={closeDeleteModal} disabled={Boolean(deletingId)}>Cancelar</Button>
        <Button variant="danger" onClick={deleteProduction} disabled={Boolean(deletingId)}>{deletingId ? <><i className="fa-solid fa-spinner fa-spin me-2" />Excluindo...</> : <><i className="fa-solid fa-trash-can me-2" />Excluir definitivamente</>}</Button>
      </Modal.Footer>
    </Modal>
  </div>;
}
