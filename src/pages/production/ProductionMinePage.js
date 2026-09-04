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

const apiErrorMessage = (err, fallback) => (
  err?.response?.data?.message
  || err?.response?.data?.error
  || err?.message
  || fallback
);

export default function ProductionMinePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [productionToDelete, setProductionToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let active = true;
    cutinappService
      .myProductions()
      .then((productions) => active && setItems(productions))
      .catch((err) => active && setError(apiErrorMessage(err, "Não foi possível carregar suas produções.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const askDeleteProduction = (production) => {
    setError("");
    setSuccess("");
    setProductionToDelete(production);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setProductionToDelete(null);
  };

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

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Carregando produções" />}
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

        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

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
            {items.map((production) => {
              const deleting = deletingId === production.id;

              return (
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
                      <div className="cut-card-actions">
                        <Button onClick={() => navigate(`/production/${production.id}`)} disabled={deleting}>Abrir</Button>
                        <Button variant="outline-light" onClick={() => navigate(`/production/edit/${production.id}`)} disabled={deleting}>Editar</Button>
                        <Button variant="outline-light" onClick={() => navigate(`/event/create?productionId=${production.id}`)} disabled={deleting}>Criar evento</Button>
                        <Button variant="outline-light" onClick={() => navigate(`/producer/finance?production=${production.id}`)} disabled={deleting}>Financeiro</Button>
                        <Button variant="outline-danger" onClick={() => askDeleteProduction(production)} disabled={deleting}>
                          <i className="fa-solid fa-trash-can me-2" />Excluir
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Container>

      <Modal show={Boolean(productionToDelete)} onHide={closeDeleteModal} centered backdrop={deletingId ? "static" : true} keyboard={!deletingId}>
        <Modal.Header closeButton={!deletingId}>
          <Modal.Title>Excluir produção</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Tem certeza que deseja excluir <strong>{productionToDelete?.name || "esta produção"}</strong>?
          </p>
          <p className="mb-0 text-muted">
            Esta ação não pode ser desfeita. Por segurança, a API impede a exclusão quando existem ingressos emitidos vinculados aos eventos da produção.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDeleteModal} disabled={Boolean(deletingId)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={deleteProduction} disabled={Boolean(deletingId)}>
            {deletingId ? (
              <><i className="fa-solid fa-spinner fa-spin me-2" />Excluindo...</>
            ) : (
              <><i className="fa-solid fa-trash-can me-2" />Excluir definitivamente</>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
