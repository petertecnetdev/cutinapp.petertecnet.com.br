import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Container } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../components/NavlogComponent";
import cutinappService from "../services/CutinappService";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage = 1) => {
    nextPage === 1 ? setLoading(true) : setMoreLoading(true);
    try {
      const response = await cutinappService.notifications({ page: nextPage, per_page: 25 });
      const batch = response.notifications?.data || [];
      setItems((current) => nextPage === 1 ? batch : [...current, ...batch.filter((item) => !current.some((old) => old.id === item.id))]);
      setUnread(response.unread_count || 0);
      setPage(response.notifications?.current_page || nextPage);
      setLastPage(response.notifications?.last_page || 1);
    } catch (err) { setError(err?.message || "Não foi possível carregar suas notificações."); }
    finally { setLoading(false); setMoreLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const openItem = async (item) => {
    if (!item.read_at) {
      try {
        await cutinappService.markNotificationRead(item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
        setUnread((current) => Math.max(0, current - 1));
      } catch (_) { /* a navegação não deve ser bloqueada */ }
    }
    if (item.reference_url) {
      try {
        const url = new URL(item.reference_url, window.location.origin);
        if (url.origin === window.location.origin) return navigate(`${url.pathname}${url.search}${url.hash}`);
        window.location.href = item.reference_url;
        return;
      } catch (_) { /* fallback abaixo */ }
    }
    if (item.reference_type === "event") navigate("/event");
  };

  const markAll = async () => {
    try {
      await cutinappService.markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
      setUnread(0);
    } catch (err) { setError(err?.message || "Não foi possível marcar as notificações como lidas."); }
  };

  return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-4 py-lg-5">
    <div className="cut-page-heading"><div><span className="cut-eyebrow">Sua rede</span><h1>Notificações</h1><p>Acompanhe eventos, artistas, produções, ingressos e conversas importantes.</p></div>{unread > 0 && <Button variant="outline-light" onClick={markAll}>Marcar todas como lidas</Button>}</div>
    {error && <Alert variant="danger">{error}</Alert>}
    {loading ? <div className="cut-notification-list" aria-busy="true">{Array.from({ length: 5 }).map((_, index) => <div className="cut-notification-skeleton" key={index} />)}</div> : items.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-regular fa-bell cut-empty-icon" /><h2>Nenhuma notificação ainda</h2><p>Quando houver novidades de eventos, artistas e produções que você acompanha, elas aparecerão aqui.</p><Button onClick={() => navigate("/event")}>Descobrir eventos</Button></Card.Body></Card> : <div className="cut-notification-list">{items.map((item) => <button type="button" key={item.id} className={`cut-notification-item ${item.read_at ? "" : "is-unread"}`} onClick={() => openItem(item)}><span className="cut-notification-item__icon"><i className={item.type === "artist_lineup" ? "fa-solid fa-music" : item.type?.includes("ticket") ? "fa-solid fa-ticket" : "fa-regular fa-bell"} /></span><span className="cut-notification-item__content"><strong>{item.title}</strong><span>{item.message || "Há uma novidade para você na Cutinapp."}</span><time>{fmt(item.created_at)}</time></span>{!item.read_at && <span className="cut-notification-item__dot" aria-label="Não lida" />}<i className="fa-solid fa-chevron-right" /></button>)}</div>}
    {page < lastPage && <div className="cut-load-more"><Button variant="outline-light" disabled={moreLoading} onClick={() => load(page + 1)}>{moreLoading ? "Carregando..." : "Carregar mais"}</Button></div>}
  </Container></div>;
}
