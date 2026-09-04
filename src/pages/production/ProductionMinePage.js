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
  const [establishmentToDelete, setEstablishmentToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let active = true;
    cutinappService
      .myEstablishments()
      .then((establishments) => active && setItems(establishments))
      .catch((err) => active && setError(apiErrorMessage(err, "Não foi possível carregar seus estabelecimentos.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const askDeleteEstablishment = (establishment) => {
    setError("");
    setSuccess("");
    setEstablishmentToDelete(establishment);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setEstablishmentToDelete(null);
  };

  const deleteEstablishment = async () => {
    if (!establishmentToDelete?.id || deletingId) return;

    const id = establishmentToDelete.id;
    const name = establishmentToDelete.name || "Estabelecimento";

    setDeletingId(id);
    setError("");
    setSuccess("");

    try {
      const response = await cutinappService.deleteEstablishment(id);
      setItems((current) => current.filter((establishment) => establishment.id !== id));
      setEstablishmentToDelete(null);
      setSuccess(response?.message || `${name} excluído com sucesso.`);
    } catch (err) {
      setEstablishmentToDelete(null);
      setError(apiErrorMessage(err, "Não foi possível excluir o estabelecimento."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Carregando estabelecimentos" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Gestão de eventos</span>
            <h1>Meus estabelecimentos</h1>
            <p>Na Cutinapp, os estabelecimentos responsáveis por eventos são cadastrados com o tipo produção.</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="outline-light" onClick={() => navigate("/producer/finance")}>
              <i className="fa-solid fa-wallet me-2" />Recebimentos
            </Button>
            <Button onClick={() => navigate("/establishment/create")}>
              <i className="fa-solid fa-plus me-2" />Novo estabelecimento
            </Button>
          </div>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

        {!loading && !error && items.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Você ainda não possui estabelecimento na Cutinapp</h2>
              <p>Cadastre o estabelecimento responsável pelo seu primeiro evento.</p>
              <Button onClick={() => navigate("/establishment/create")}>Criar estabelecimento</Button>
            </Card.Body>
          </Card>
        ) : (
          <Row className="g-4">
            {items.map((establishment) => {
              const deleting = deletingId === establishment.id;

              return (
                <Col md={6} xl={4} key={establishment.id}>
                  <Card className="cut-production-card h-100">
                    {establishment.background && (
                      <div className="cut-production-card__cover" style={{ backgroundImage: `url(${imageUrl(establishment.background)})` }} />
                    )}
                    <Card.Body className="p-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        {establishment.logo ? (
                          <img src={imageUrl(establishment.logo)} alt="" className="cut-production-card__logo" />
                        ) : (
                          <div className="cut-production-card__logo cut-production-card__logo--placeholder">{String(establishment.name || "E").slice(0, 2).toUpperCase()}</div>
                        )}
                        <div>
                          <h2 className="mb-1">{establishment.name}</h2>
                          <Badge bg="secondary">{establishment.events_count || 0} eventos</Badge>
                        </div>
                      </div>
                      <p>{establishment.description || "Estabelecimento pronto para receber eventos."}</p>
                      <div className="cut-card-actions">
                        <Button onClick={() => navigate(`/establishment/${establishment.id}`)} disabled={deleting}>Abrir</Button>
                        <Button variant="outline-light" onClick={() => navigate(`/establishment/edit/${establishment.id}`)} disabled={deleting}>Editar</Button>
                        <Button variant="outline-light" onClick={() => navigate(`/event/create?establishmentId=${establishment.id}`)} disabled={deleting}>Criar evento</Button>
                        <Button variant="outline-light" onClick={() => navigate(`/producer/finance?establishment=${establishment.id}`)} disabled={deleting}>Financeiro</Button>
                        <Button variant="outline-danger" onClick={() => askDeleteEstablishment(establishment)} disabled={deleting}>
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

      <Modal show={Boolean(establishmentToDelete)} onHide={closeDeleteModal} centered backdrop={deletingId ? "static" : true} keyboard={!deletingId}>
        <Modal.Header closeButton={!deletingId}>
          <Modal.Title>Excluir estabelecimento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Tem certeza que deseja excluir <strong>{establishmentToDelete?.name || "este estabelecimento"}</strong>?
          </p>
          <p className="mb-0 text-muted">
            Esta ação não pode ser desfeita. Por segurança, a API impede a exclusão quando existem ingressos emitidos vinculados aos eventos do estabelecimento.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDeleteModal} disabled={Boolean(deletingId)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={deleteEstablishment} disabled={Boolean(deletingId)}>
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
