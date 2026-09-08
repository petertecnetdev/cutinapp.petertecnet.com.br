import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import producerMediaLibraryService from "../../services/ProducerMediaLibraryService";
import "./producer-media-library.css";

const tomorrowKey = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatBytes = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const safeFilename = (value) => String(value || "evento")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9-_]+/g, "-")
  .replace(/^-+|-+$/g, "") || "evento";

export default function ProducerMediaLibraryPage() {
  const navigate = useNavigate();
  const [productions, setProductions] = useState([]);
  const [media, setMedia] = useState([]);
  const [query, setQuery] = useState("");
  const [productionId, setProductionId] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [duplicateMedia, setDuplicateMedia] = useState(null);
  const [duplicateDate, setDuplicateDate] = useState(tomorrowKey);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService.myProductions()
      .then((items) => active && setProductions(Array.isArray(items) ? items : []))
      .catch(() => active && setProductions([]));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await producerMediaLibraryService.list({
          q: query.trim() || undefined,
          production_id: productionId || undefined,
          page,
          per_page: 24,
        });
        if (!active) return;
        setMedia(Array.isArray(response?.data) ? response.data : []);
        setLastPage(Math.max(1, Number(response?.last_page || 1)));
        setTotal(Number(response?.total || 0));
      } catch (err) {
        if (!active) return;
        setMedia([]);
        setError(err?.response?.data?.message || err?.message || "Não foi possível carregar sua biblioteca de mídias.");
      } finally {
        if (active) setLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, productionId, page]);

  const selectedProductionName = useMemo(
    () => productions.find((item) => String(item.id) === String(productionId))?.name || "",
    [productions, productionId]
  );

  const changeQuery = (value) => { setQuery(value); setPage(1); };
  const changeProduction = (value) => { setProductionId(value); setPage(1); };

  const downloadMedia = async (item) => {
    if (!item?.event_id || downloadingId) return;
    setDownloadingId(item.event_id);
    setError("");
    try {
      const blob = await producerMediaLibraryService.download(item.event_id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${safeFilename(item.event_title)}-capa.webp`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível baixar esta mídia.");
    } finally {
      setDownloadingId(null);
    }
  };

  const openDuplicate = (item) => {
    setError("");
    setSuccess("");
    setDuplicateDate(tomorrowKey());
    setDuplicateMedia(item);
  };

  const duplicateEvent = async () => {
    if (!duplicateMedia?.event_id || !duplicateDate || duplicating) return;
    setDuplicating(true);
    setError("");
    try {
      const response = await eventService.duplicate(duplicateMedia.event_id, duplicateDate);
      const duplicatedId = Number(response?.event?.id || 0);
      if (!duplicatedId) throw new Error("A API não retornou o novo evento criado.");
      setDuplicateMedia(null);
      setSuccess("Novo evento criado como rascunho com a mídia e os dados da edição anterior.");
      navigate(`/event/edit/${duplicatedId}`);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível criar um evento semelhante.");
    } finally {
      setDuplicating(false);
    }
  };

  return <div className="cut-app-page cut-producer-media-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Carregando biblioteca de mídias" />}

    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading cut-media-heading">
        <div>
          <span className="cut-eyebrow">Área do produtor</span>
          <h1>Biblioteca de mídias</h1>
          <p>Reencontre as capas que você já usou nos seus eventos, baixe o arquivo ou crie outra edição reaproveitando a mesma identidade visual.</p>
        </div>
        <div className="cut-media-heading__actions">
          <Button variant="outline-light" onClick={() => navigate("/production/mine")}>
            <i className="fa-solid fa-clapperboard me-2" />Minhas produções
          </Button>
          <Button onClick={() => navigate("/event/create")}>
            <i className="fa-solid fa-plus me-2" />Novo evento
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      <Card className="cut-panel cut-media-toolbar mb-4">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <Col lg={7}>
              <Form.Group>
                <Form.Label>Buscar mídia</Form.Label>
                <div className="cut-media-search">
                  <i className="fa-solid fa-magnifying-glass" />
                  <Form.Control value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Busque pelo nome do evento ou da produção" />
                </div>
              </Form.Group>
            </Col>
            <Col lg={5}>
              <Form.Group>
                <Form.Label>Produção</Form.Label>
                <Form.Select value={productionId} onChange={(event) => changeProduction(event.target.value)}>
                  <option value="">Todas as minhas produções</option>
                  {productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>
          <div className="cut-media-toolbar__summary">
            <span><strong>{total}</strong> mídia{total === 1 ? "" : "s"} encontrada{total === 1 ? "" : "s"}</span>
            {selectedProductionName && <span>Filtrando por <strong>{selectedProductionName}</strong></span>}
          </div>
        </Card.Body>
      </Card>

      {!loading && media.length === 0 ? (
        <Card className="cut-empty-state cut-media-empty">
          <Card.Body>
            <div className="cut-media-empty__icon"><i className="fa-regular fa-images" /></div>
            <h2>{query || productionId ? "Nenhuma mídia encontrada" : "Sua biblioteca ainda está vazia"}</h2>
            <p>{query || productionId ? "Altere os filtros para procurar outra capa." : "As capas usadas nos seus eventos aparecerão aqui automaticamente. Não é necessário enviar o mesmo arquivo duas vezes."}</p>
            {(query || productionId) ? <Button variant="outline-light" onClick={() => { setQuery(""); setProductionId(""); setPage(1); }}>Limpar filtros</Button> : <Button onClick={() => navigate("/event/create")}><i className="fa-solid fa-plus me-2" />Criar evento</Button>}
          </Card.Body>
        </Card>
      ) : (
        <div className="cut-media-grid">
          {media.map((item) => {
            const unavailable = item.available === false;
            return <Card key={item.id} className={`cut-media-card ${unavailable ? "is-unavailable" : ""}`}>
              <div className="cut-media-card__preview">
                {item.url ? <img src={item.url} alt={`Capa de ${item.event_title || "evento"}`} loading="lazy" /> : <div className="cut-media-card__fallback"><i className="fa-regular fa-image" /></div>}
                <span className="cut-media-card__badge"><i className="fa-regular fa-image" /> Capa de evento</span>
              </div>
              <Card.Body>
                <div className="cut-media-card__meta">
                  <span>{item.production_name || "Produção"}</span>
                  {formatDate(item.event_start_date) && <span>{formatDate(item.event_start_date)}</span>}
                </div>
                <h2 title={item.event_title}>{item.event_title || "Evento"}</h2>
                <div className="cut-media-card__file-info">
                  {formatBytes(item.size) && <span><i className="fa-solid fa-database" />{formatBytes(item.size)}</span>}
                  <span><i className="fa-solid fa-shield-halved" />Sua mídia</span>
                </div>
                {unavailable && <div className="cut-media-card__warning"><i className="fa-solid fa-triangle-exclamation" />Arquivo indisponível no armazenamento.</div>}
                <div className="cut-media-card__actions">
                  <Button variant="outline-light" disabled={unavailable || downloadingId === item.event_id} onClick={() => downloadMedia(item)}>
                    <i className={`fa-solid ${downloadingId === item.event_id ? "fa-spinner fa-spin" : "fa-download"} me-2`} />
                    {downloadingId === item.event_id ? "Baixando" : "Baixar"}
                  </Button>
                  <Button disabled={unavailable} onClick={() => openDuplicate(item)}>
                    <i className="fa-solid fa-copy me-2" />Criar semelhante
                  </Button>
                </div>
              </Card.Body>
            </Card>;
          })}
        </div>
      )}

      {!loading && lastPage > 1 && <div className="cut-media-pagination">
        <Button variant="outline-light" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><i className="fa-solid fa-chevron-left me-2" />Anterior</Button>
        <span>Página <strong>{page}</strong> de <strong>{lastPage}</strong></span>
        <Button variant="outline-light" disabled={page >= lastPage} onClick={() => setPage((current) => Math.min(lastPage, current + 1))}>Próxima<i className="fa-solid fa-chevron-right ms-2" /></Button>
      </div>}
    </Container>

    <Modal show={Boolean(duplicateMedia)} onHide={() => !duplicating && setDuplicateMedia(null)} centered backdrop={duplicating ? "static" : true} keyboard={!duplicating}>
      <Modal.Header closeButton={!duplicating}><Modal.Title>Criar evento semelhante</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="mb-3">A Cutinapp vai criar um novo rascunho baseado em <strong>{duplicateMedia?.event_title || "este evento"}</strong>, incluindo uma cópia independente da capa.</p>
        <Form.Group>
          <Form.Label>Data da nova edição *</Form.Label>
          <Form.Control type="date" min={tomorrowKey()} value={duplicateDate} onChange={(event) => setDuplicateDate(event.target.value)} disabled={duplicating} />
          <Form.Text>Horários, ingressos e artistas são reaproveitados como ponto de partida. Você poderá revisar tudo antes de publicar.</Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={() => setDuplicateMedia(null)} disabled={duplicating}>Cancelar</Button>
        <Button onClick={duplicateEvent} disabled={duplicating || !duplicateDate}>{duplicating ? <><i className="fa-solid fa-spinner fa-spin me-2" />Criando...</> : <><i className="fa-solid fa-copy me-2" />Criar rascunho</>}</Button>
      </Modal.Footer>
    </Modal>
  </div>;
}
