import React, { useEffect, useState } from "react";
import { Alert, Button, Container } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import SeoHead from "../../components/SeoHead";
import EntityLink from "../../components/entity/EntityLink";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";
import { trackTelemetry } from "../../utils/telemetry";
import "./EventItemDetailPage.css";

const imageUrl = (value) => {
  const path = typeof value === "string" ? value : value?.url || value?.path;
  if (!path) return "";
  return /^https?:\/\//i.test(path) ? path : `${storageUrl}${path.replace(/^\/+/, "")}`;
};

export default function EventItemDetailPage() {
  const { slug, itemId } = useParams();
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    commerceService.catalog(slug).then((response) => {
      if (active) setCatalog(response);
    }).catch(() => { if (active) setError("Este item não está disponível no momento."); });
    return () => { active = false; };
  }, [slug]);

  const event = catalog?.event;
  const item = catalog?.items?.find((entry) => String(entry.id) === itemId || entry.slug === itemId);
  const production = event?.production;
  const visible = item && item.available !== false && item.is_active !== false;
  const foreground = imageUrl(item?.image || item?.image_url || item?.photo || item?.cover)
    || imageUrl(event?.image || event?.cover)
    || imageUrl(production?.cover || production?.image || production?.logo);
  const background = imageUrl(event?.image || event?.cover || production?.cover || production?.image);
  const canonical = `/event/${encodeURIComponent(slug)}/item/${encodeURIComponent(itemId)}`;
  const amount = Number(item?.price);
  const formattedPrice = Number.isFinite(amount) ? new Intl.NumberFormat(event?.locale || "pt-BR", {
    style: "currency", currency: event?.currency || "BRL",
  }).format(amount) : null;

  useEffect(() => {
    if (visible) trackTelemetry("entity_view", { label: "Item público visualizado", target: String(item.id), metadata: {
      entity_type: "item", event_id: Number(event?.id || 0), source_surface: "event_item_catalog",
    } });
  }, [visible, item?.id, event?.id]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: item.name, url }); } catch (e) { /* Share sheet dismissed. */ }
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
  };

  return <div className="cut-app-page cut-item-detail"><NavlogComponent />
    {visible && <SeoHead title={`${item.name} | ${event?.title || "Cutinapp"}`} description={item.description || `Conheça ${item.name} no evento ${event?.title || "Cutinapp"}.`} canonical={canonical} image={foreground} type="product" robots="noindex, follow" />}
    {!catalog && !error && <Container className="py-5"><ProcessingIndicatorComponent /></Container>}
    {(error || (catalog && !visible)) && <Container className="py-5"><Alert variant="warning">{error || "Este item não está disponível no catálogo público."}</Alert><Link to={`/event/${slug}/catalogo`}>Voltar ao catálogo</Link></Container>}
    {visible && <>
      <header className="cut-item-detail__hero">
        {background && <div className="cut-item-detail__background" style={{ backgroundImage: `url(${JSON.stringify(background)})` }} aria-hidden="true" />}
        <Container className="cut-item-detail__foreground">
          <nav aria-label="Localização do item" className="cut-item-detail__breadcrumbs">
            {production?.name && <><EntityLink type="production" entity={production} /> <span aria-hidden="true">›</span></>}
            <EntityLink type="event" entity={event} /> <span aria-hidden="true">›</span> <span aria-current="page">{item.name}</span>
          </nav>
          {foreground ? <img className="cut-item-detail__image" src={foreground} alt={item.name} /> : <div className="cut-item-detail__placeholder" aria-label="Item sem imagem">{item.name?.slice(0, 1)}</div>}
          <h1>{item.name}</h1>{formattedPrice && <strong className="cut-item-detail__price">{formattedPrice}</strong>}
          {item.description && <p>{item.description}</p>}
          <div className="d-flex flex-wrap gap-2 justify-content-center"><Button as={Link} to={`/event/${slug}/catalogo`} variant="success">Ver disponibilidade e comprar</Button><Button variant="outline-light" onClick={share}>Compartilhar item</Button></div>
        </Container>
      </header>
      <Container className="py-4 cut-item-detail__relations"><h2>Onde encontrar</h2><p>Evento: <EntityLink type="event" entity={event} /></p>{production?.name && <p>Produção: <EntityLink type="production" entity={production} /></p>}<Link to={`/event/${slug}/catalogo`}>Ver outros itens deste evento</Link></Container>
    </>}
  </div>;
}
