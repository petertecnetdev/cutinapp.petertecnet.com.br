import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Dropdown, Form, Modal, Row } from "react-bootstrap";
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

const productionThemeStyle = (background) => background ? { "--cut-production-card-bg": `url(${imageUrl(background)})` } : undefined;
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
      .then((productions) => active && setItems(productions))
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

  const askDeleteProduction = (production) => { setError(""); setSuccess(""); setProductionToDelete(production); };
  const closeDeleteModal = () => { if (!deletingId) setProductionToDelete(null); };
  const deleteProduction = async () => {
    if (!productionToDelete?.id || deletingId) return;
    const id = productionToDelete.id;
    const name = productionToDelete.name || "Produção";
    setDeletingId(id); setError(""); setSuccess("");
    try {
      const response = await cutinappService.deleteProduction(id);
      setItems((current) => current.filter((production) => production.id !== id));
      setProductionToDelete(null);
      setSuccess(response?.message || `${name} excluída com sucesso.`);
    } catch (err) {
      setProductionToDelete(null);
      setError(apiErrorMessage(err, "Não foi possível excluir a produção."));
    } finally { setDeletingId(null); }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Carregando produções" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div><span className="cut-eyebrow">Área do produtor</span><h1>Minhas produções</h1><p>Gerencie suas marcas, espaços, eventos e recebimentos em um só lugar.</p></div>
        <div className="d-flex flex-wrap gap-2"><Button variant="outline-light" onClick={() => navigate("/producer/finance")}><i className="fa-solid fa-wallet me-2" />Recebimentos</Button><Button onClick={() => navigate("/production/create")}><i className="fa-solid fa-plus me-2" />Nova produção</Button></div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {!loading && items.length > 0 && <>
        <div className="cut-production-mine-summary">
          <div className="cut-production-summary-card"><span>Produções</span><strong>{items.length}</strong></div>
          <div className="cut-production-summary-card"><span>Eventos cadastrados</span><strong>{totalEvents}</strong></div>
          <div className="cut-production-summary-card"><span>Com localização</span><strong>{located}</strong></div>
        </div>
        <div className="cut-production-mine-toolbar"><div className="cut-production-search"><i className="fa-solid fa-magnifying-glass" /><Form.Control value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produção por nome ou cidade" aria-label="Buscar produção" /></div><small className="text-muted">{filtered.length} de {items.length}</small></div>
      </>}

      {!loading && items.length === 0 ? <Card className="cut-empty-state"><Card.Body><h2>Você ainda não possui produção na Cutinapp</h2><p>Cadastre sua marca, produtora ou espaço para começar a criar eventos.</p><Button onClick={() => navigate("/production/create")}>Criar produção</Button></Card.Body></Card> : !loading && filtered.length === 0 ? <div className="cut-production-empty-filter"><i className="fa-solid fa-magnifying-glass mb-2" /><h2>Nenhuma produção encontrada</h2><p className="mb-0">Tente outro nome, cidade ou estado.</p></div> : <Row className="g-3 g-lg-4">{filtered.map((production) => {
        const deleting = deletingId === production.id;
        const locationLabel = [production.city, production.uf].filter(Boolean).join(" - ") || production.address || "Localização não informada";
        return <Col md={6} xl={4} xxl={3} key={production.id}>
          <Card className="cut-production-card cut-production-themed-card cut-production-manage-card h-100" style={productionThemeStyle(production.background)}>
            <Card.Body>
              <div className="cut-production-manage-card__head">
                {production.logo ? <img src={imageUrl(production.logo)} alt={`Logo de ${production.name}`} className="cut-production-card__logo" /> : <div className="cut-production-card__logo cut-production-card__logo--placeholder">{String(production.name || "P").slice(0, 2).toUpperCase()}</div>}
                <div className="cut-production-manage-card__title"><h2 title={production.name}>{production.name}</h2><small title={locationLabel}><i className="fa-solid fa-location-dot me-1" />{locationLabel}</small></div>
              </div>
              <div className="cut-production-manage-card__meta"><span className="cut-production-manage-chip"><i className="fa-regular fa-calendar" />{production.events_count || 0} eventos</span>{production.type === "fixed" && <span className="cut-production-manage-chip"><i className="fa-solid fa-store" />Espaço fixo</span>}{production.type === "independent" && <span className="cut-production-manage-chip"><i className="fa-solid fa-bolt" />Independente</span>}</div>
              <div className="cut-production-manage-actions"><Button onClick={() => navigate(`/production/${production.id}`)} disabled={deleting}>Abrir</Button><Button variant="outline-light" onClick={() => navigate(`/event/create?productionId=${production.id}`)} disabled={deleting}>Novo evento</Button><Dropdown align="end"><Dropdown.Toggle variant="outline-light" aria-label={`Mais opções de ${production.name}`}><i className="fa-solid fa-ellipsis" /></Dropdown.Toggle><Dropdown.Menu><Dropdown.Item onClick={() => navigate(`/production/edit/${production.id}`)}><i className="fa-regular fa-pen-to-square me-2" />Editar produção</Dropdown.Item><Dropdown.Item onClick={() => navigate(`/producer/finance?production=${production.id}`)}><i className="fa-solid fa-chart-line me-2" />Financeiro</Dropdown.Item><Dropdown.Divider /><Dropdown.Item className="text-danger" onClick={() => askDeleteProduction(production)}><i className="fa-regular fa-trash-can me-2" />Excluir produção</Dropdown.Item></Dropdown.Menu></Dropdown></div>
            </Card.Body>
          </Card>
        </Col>;
      })}</Row>}
    </Container>

    <Modal show={Boolean(productionToDelete)} onHide={closeDeleteModal} centered backdrop={deletingId ? "static" : true} keyboard={!deletingId}><Modal.Header closeButton={!deletingId}><Modal.Title>Excluir produção</Modal.Title></Modal.Header><Modal.Body><p className="mb-2">Tem certeza que deseja excluir <strong>{productionToDelete?.name || "esta produção"}</strong>?</p><p className="mb-0 text-muted">Esta ação não pode ser desfeita. Produções com ingressos emitidos não podem ser excluídas.</p></Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={closeDeleteModal} disabled={Boolean(deletingId)}>Cancelar</Button><Button variant="danger" onClick={deleteProduction} disabled={Boolean(deletingId)}>{deletingId ? <><i className="fa-solid fa-spinner fa-spin me-2" />Excluindo...</> : <><i className="fa-solid fa-trash-can me-2" />Excluir definitivamente</>}</Button></Modal.Footer></Modal>
  </div>;
}
