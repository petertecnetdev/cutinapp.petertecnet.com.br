import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Não informado";

export default function PassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService.getPass(id)
      .then((item) => active && setPass(item))
      .catch((err) => active && setError(err?.message || "Não foi possível abrir este ingresso."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const share = async () => {
    if (!pass) return;
    try {
      const url = window.location.href;
      if (navigator.share) await navigator.share({ title: `Ingresso · ${pass.event?.title || "Cutinapp"}`, url });
      else await navigator.clipboard.writeText(url);
    } catch (_) {}
  };

  const used = Boolean(pass?.checked_in_at);
  const cancelled = pass?.status === "cancelled" || pass?.event?.is_cancelled;

  return <div className="cut-app-page"><NavlogComponent />{loading && <ProcessingIndicatorComponent label="Abrindo ingresso" />}
    <Container className="cut-page-container py-4 py-lg-5"><div className="cut-page-heading"><div><span className="cut-eyebrow">Ingresso digital</span><h1>{pass?.event?.title || "Meu ingresso"}</h1><p>Guarde este ingresso no celular. O QR Code é individual e a validação é feita diretamente pela API Cutinapp.</p></div><div className="cut-card-actions"><Button variant="outline-light" onClick={() => navigate("/passes")}>Minha carteira</Button><Button variant="outline-light" onClick={share}>Compartilhar página</Button></div></div>
      {error && <Alert variant="danger">{error}</Alert>}
      {pass && <Row className="justify-content-center g-4"><Col xl={9}><Card className={`cut-ticket-detail ${used ? "is-used" : ""} ${cancelled ? "is-cancelled" : ""}`}><div className="cut-ticket-detail__top"><div><div className="d-flex flex-wrap gap-2 mb-3"><Badge bg={cancelled ? "danger" : used ? "secondary" : "success"}>{cancelled ? "Cancelado" : used ? "Utilizado" : "Válido para entrada"}</Badge><Badge bg="dark">{pass.ticket?.type || pass.ticket?.ticket_type || "Ingresso"}</Badge></div><span className="cut-eyebrow">{pass.ticket?.name || "Ingresso Cutinapp"}</span><h2>{pass.event?.title || "Evento"}</h2><p>{formatDate(pass.event?.start_date)}</p></div><div className="cut-ticket-detail__mark"><i className="fa-solid fa-ticket"/><span>CUTINAPP</span></div></div><div className="cut-ticket-detail__perforation"><span/><span/></div><div className="cut-ticket-detail__body"><div className="cut-ticket-detail__qr"><div className="cut-ticket-detail__qrbox"><QrCodeComponent value={pass.token} size={300}/></div><strong>{cancelled ? "Ingresso cancelado" : used ? "Entrada já validada" : "Aponte o QR para a câmera da portaria"}</strong><small>Não compartilhe este QR Code com terceiros.</small></div><div className="cut-ticket-detail__facts"><div><span>Titular</span><strong>{pass.holder_name || pass.holder_email}</strong></div><div><span>E-mail</span><strong>{pass.holder_email || "—"}</strong></div><div><span>Data e horário</span><strong>{formatDate(pass.event?.start_date)}</strong></div><div><span>Local</span><strong>{pass.event?.venue || pass.event?.address || "Consulte o evento"}</strong></div><div><span>Produção</span><strong>{pass.event?.production?.name || "Cutinapp"}</strong></div><div><span>Identificador</span><strong>#{pass.id}</strong></div>{used && <div className="cut-ticket-detail__checkin"><span>Check-in</span><strong>{formatDate(pass.checked_in_at)}</strong></div>}</div></div><div className="cut-ticket-detail__footer"><details className="cut-token-details"><summary>Código para validação manual</summary><code>{pass.token}</code></details>{pass.event?.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${pass.event.slug}`)}>Ver página do evento</Button>}</div></Card></Col></Row>}
    </Container>
  </div>;
}
