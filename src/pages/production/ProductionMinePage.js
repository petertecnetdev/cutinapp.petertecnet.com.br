import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\//, "")}`;
};

const apiMessage = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

export default function ProductionMinePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService
      .myProductions()
      .then((productions) => active && setItems(productions))
      .catch((err) => active && setError(apiMessage(err, "Não foi possível carregar suas produções.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const removeProduction = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError("");
    setSuccess("");
    try {
      const response = await cutinappService.deleteProduction(deleteTarget.id);
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setSuccess(response?.message || "Produção excluída com segurança.");
      setDeleteTarget(null);
    } catch (err) {
      setError(apiMessage(err, "Não foi possível excluir esta produção."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || deletingId) && <ProcessingIndicatorComponent label={loading ? "Carregando produções" : "Excluindo produção"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Minhas produções</h1>
            <p>Somente produções vinculadas à Cutinapp e ao seu usuário aparecem aqui.</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="outline-light" onClick={() => navigate("/producer/finance")}>
              <i className="fa-solid fa-wallet me-2" />Recebimentos
            </Button>
            <Button onClick={() => navigate("/production/create")}>
              <i className="fa-solid fa-plus me-2" />Nova produção
            </Button>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {!loading && !error && items.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Você ainda não possui produção na Cutinapp</h2>
              <p>Cadastre a organização responsável pelo seu primeiro evento.</p>
              <Button onClick={() => navigate("/production/create")}>Criar produção</Button>
            </Card.Body>
          </Card>
        ) : (
          <Row className="g-4">
            {items.map((production) => (
              <Col md={6} xl={4} key={production.id}>
                <Card className="cut-production-card h-100">
                  {production.background && (
                    <div className="cut-production-card__cover" style={{ backgroundImage: `url(${imageUrl(production.background)})` }} />
                  )}
                  <Card.Body className="p-4">
                    <div className="d-flex align-items-center gap-3 mb-3">
                      {production.logo ? (
                        <img src={imageUrl(production.logo)} alt="" className="cut-production-card__logo" />
                      ) : (
                        <div className="cut-production-card__logo cut-production-card__logo--placeholder">{String(production.name || "P").slice(0, 2).toUpperCase()}</div>
                      )}
                      <div>
                        <h2 className="mb-1">{production.name}</h2>
                        <Badge bg="secondary">{production.events_count || 0} eventos</Badge>
                      </div>
                    </div>
                    <p>{production.description || "Produção pronta para receber eventos."}</p>
                    {production.can_delete === false && production.deletion_blockers?.length > 0 && (
                      <div className="cut-info-box mb-3">
                        <strong>Cadastro protegido</strong>
                        <span>Esta produção possui vínculos e não pode ser apagada enquanto houver histórico associado.</span>
                      </div>
                    )}
                    <div className="cut-card-actions">
                      <Button onClick={() => navigate(`/production/${production.id}`)}>Abrir</Button>
                      <Button variant="outline-light" onClick={() => navigate(`/production/edit/${production.id}`)}>Editar</Button>
                      <Button variant="outline-light" onClick={() => navigate(`/event/create?productionId=${production.id}`)}>Criar evento</Button>
                      <Button variant="outline-light" onClick={() => navigate(`/producer/finance?production=${production.id}`)}>Financeiro</Button>
                      {production.can_delete === true && (
                        <Button variant="outline-danger" onClick={() => setDeleteTarget(production)}>
                          <i className="fa-regular fa-trash-can me-2" />Excluir produção
                        </Button>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Container>

      <Modal show={Boolean(deleteTarget)} onHide={() => !deletingId && setDeleteTarget(null)} centered>
        <Modal.Header closeButton={!deletingId}>
          <Modal.Title>Excluir produção</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="mb-3">
            Esta ação é definitiva e só é permitida para uma produção sem eventos, pedidos ou histórico financeiro.
          </Alert>
          <p className="mb-0">
            Confirma a exclusão de <strong>{deleteTarget?.name}</strong>?
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setDeleteTarget(null)} disabled={Boolean(deletingId)}>Voltar</Button>
          <Button variant="danger" onClick={removeProduction} disabled={Boolean(deletingId)}>
            {deletingId ? "Excluindo..." : "Excluir definitivamente"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
