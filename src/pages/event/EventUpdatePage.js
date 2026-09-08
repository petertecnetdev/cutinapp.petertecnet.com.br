import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import useAutoSave from "../../hooks/useAutoSave";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";
import "./EventUpdatePage.css";

const pad = (number) => String(number).padStart(2, "0");
const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const minNow = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 1);
  return toLocalInput(date);
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
  : "Data não informada";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const eventIsValid = (value) => {
  if (!value || value.title.trim().length < 2 || !value.description.trim() || !value.address.trim()) return false;
  if (!value.start_date || !value.end_date || new Date(value.end_date) <= new Date(value.start_date)) return false;
  if (value.max_attendees !== "" && Number(value.max_attendees) < 1) return false;
  if (value.uf && value.uf.trim().length !== 2) return false;
  return true;
};

const autosaveLabel = (status) => {
  if (status === "saving") return "Salvando...";
  if (status === "saved") return "Salvo automaticamente";
  if (status === "dirty") return "Alterações pendentes";
  if (status === "error") return "Falha ao salvar";
  return "Salvamento automático ativo";
};

const buildFirstSaleShareUrl = (event) => {
  if (!event?.slug) return "";
  const url = new URL(`/event/${event.slug}`, window.location.origin);
  url.searchParams.set("utm_source", "cutinapp_producer");
  url.searchParams.set("utm_medium", "whatsapp");
  url.searchParams.set("utm_campaign", "first_sale");
  url.searchParams.set("utm_content", String(event.id || event.slug));
  return url.toString();
};

const buildMapEmbedUrl = (event) => {
  if (!event) return "";
  let query = "";
  if (event.google_maps_url) {
    try {
      const url = new URL(event.google_maps_url);
      query = url.searchParams.get("q") || url.searchParams.get("query") || "";
      if (!query && url.pathname.includes("/place/")) {
        query = decodeURIComponent(url.pathname.split("/place/")[1]?.split("/")[0] || "").replace(/\+/g, " ");
      }
    } catch (_) {
      query = "";
    }
  }
  if (!query) query = [event.venue, event.address, event.city, event.uf].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "";
};

export default function EventUpdatePage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const activation = queryParams.get("activation") || "";
  const isFirstTicketActivation = activation === "first-ticket";
  const suggestedAddOnPrice = Number(queryParams.get("addonSuggested") || 0);
  const suggestedAddOnStock = Number(queryParams.get("addonStock") || 0);
  const requestedAddOnNetMargin = Number(queryParams.get("addonNetMargin") || 0);
  const requestedAddOnSource = queryParams.get("addonSource");
  const suggestedAddOnSource = ["event", "production"].includes(requestedAddOnSource) ? requestedAddOnSource : "";
  const hasSuggestedAddOnPrice = Number.isFinite(suggestedAddOnPrice) && suggestedAddOnPrice > 0 && Boolean(suggestedAddOnSource);
  const hasSuggestedAddOnStock = Number.isInteger(suggestedAddOnStock) && suggestedAddOnStock > 0 && suggestedAddOnStock <= 100;
  const suggestedAddOnNetMargin = Number.isFinite(requestedAddOnNetMargin)
    ? Math.min(100, Math.max(0, requestedAddOnNetMargin))
    : 0;
  const hasSuggestedAddOnNetMargin = suggestedAddOnNetMargin > 0;

  const [form, setForm] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [eventItems, setEventItems] = useState([]);
  const [productionItems, setProductionItems] = useState([]);
  const [productionItemsLoading, setProductionItemsLoading] = useState(false);
  const [productionItemsError, setProductionItemsError] = useState("");
  const [itemForm, setItemForm] = useState({
    source_item_id: "",
    price: hasSuggestedAddOnPrice ? suggestedAddOnPrice.toFixed(2) : "",
    quantity: hasSuggestedAddOnStock ? String(suggestedAddOnStock) : "",
  });
  const [itemLoading, setItemLoading] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemBusyId, setItemBusyId] = useState(null);
  const [success, setSuccess] = useState(
    isFirstTicketActivation
      ? "Primeiro lote criado. Seu próximo passo é publicar o evento para liberar a página de vendas."
      : queryParams.get("courtesyCreated") === "1"
        ? "Cortesia criada. Revise o evento e publique quando estiver pronto."
        : location.state?.success || ""
  );

  const applyEvent = (item) => {
    setEventData(item);
    setForm({
      production_id: item.production_id,
      title: item.title || "",
      description: item.description || "",
      venue: item.venue || "",
      address: item.address || "",
      google_maps_url: item.google_maps_url || "",
      city: item.city || "",
      uf: item.uf || "",
      start_date: toLocalInput(item.start_date),
      end_date: toLocalInput(item.end_date),
      max_attendees: item.max_attendees ?? "",
      contact_email: item.contact_email || "",
      contact_phone: item.contact_phone || "",
    });
    setPreview(item.image ? `${storageUrl}${String(item.image).replace(/^\//, "")}` : "");
  };

  const loadEvent = async () => applyEvent(await eventService.show(id));
  const loadEventItems = async () => {
    if (!eventData?.is_published || eventData?.is_private || eventData?.is_cancelled || !eventData?.slug) {
      setEventItems([]);
      return;
    }

    setItemLoading(true);
    try {
      const catalog = await commerceService.catalog(eventData.slug, { force: true });
      setEventItems(Array.isArray(catalog?.items) ? catalog.items : []);
    } catch (err) {
      if (Number(err?.status || 0) === 404) {
        setEventItems([]);
        return;
      }
      setError(err?.message || "Não foi possível carregar os adicionais deste evento.");
    } finally {
      setItemLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventService.show(id)
      .then((item) => active && applyEvent(item))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o evento."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (eventData?.id) loadEventItems();
  }, [eventData?.id, eventData?.is_published, eventData?.is_private, eventData?.is_cancelled, eventData?.slug]);

  useEffect(() => {
    const productionId = Number(eventData?.production_id || form?.production_id || 0);
    if (!productionId) {
      setProductionItems([]);
      setProductionItemsError("");
      return undefined;
    }

    let active = true;
    setProductionItemsLoading(true);
    setProductionItemsError("");
    cutinappService.productionItems(productionId)
      .then((items) => {
        if (!active) return;
        setProductionItems((Array.isArray(items) ? items : [])
          .filter((item) => item?.status === undefined || Boolean(item.status))
          .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), "pt-BR")));
      })
      .catch((err) => {
        if (!active) return;
        setProductionItems([]);
        setProductionItemsError(err?.message || "Não foi possível carregar o catálogo desta produção.");
      })
      .finally(() => active && setProductionItemsLoading(false));

    return () => { active = false; };
  }, [eventData?.production_id, form?.production_id]);

  useEffect(() => {
    if (!isFirstTicketActivation || !eventData?.id) return;
    try {
      window.PeterTecnetTelemetry?.track?.("producer_publication_step_opened", {
        label: "Produtor chegou à publicação após criar o primeiro lote",
        target: String(eventData.id),
        metadata: {
          event_id: Number(eventData.id),
          activation_stage: "publish_event",
          next_step: eventData.is_published ? "first_sale" : "publish_event",
          ticket_lots: Number(eventData.tickets_count || 0),
        },
      });
    } catch { /* Telemetria nunca bloqueia ativação. */ }
  }, [isFirstTicketActivation, eventData?.id, eventData?.is_published, eventData?.tickets_count]);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const selectedProductionItem = useMemo(
    () => productionItems.find((item) => String(item.id) === String(itemForm.source_item_id)) || null,
    [productionItems, itemForm.source_item_id]
  );

  const mapEmbedUrl = useMemo(() => buildMapEmbedUrl(form), [form]);
  const dateInvalid = Boolean(form?.start_date && form?.end_date && new Date(form.end_date) <= new Date(form.start_date));
  const capacityInvalid = Boolean(form?.max_attendees !== "" && Number(form?.max_attendees) < 1);
  const ufInvalid = Boolean(form?.uf && form.uf.trim().length !== 2);

  const canSave = useMemo(() => Boolean(eventIsValid(form) && !saving), [form, saving]);

  const persistEvent = async (nextForm, { includeImage = false, silent = false } = {}) => {
    if (!eventIsValid(nextForm)) return false;

    setSaving(true);
    setError("");
    setFieldErrors({});
    if (!silent) setSuccess("");
    try {
      const data = new FormData();
      Object.entries(nextForm).forEach(([key, value]) => {
        if (value !== null && value !== "") data.append(key, value);
      });
      if (includeImage && image) data.append("image", image);

      const response = await eventService.update(id, data);
      if (includeImage) {
        setImage(null);
        applyEvent(response.event);
        setSuccess("Alterações salvas com sucesso.");
      } else {
        setEventData((current) => ({ ...(current || {}), ...(response?.event || {}) }));
      }
      return true;
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível salvar o evento.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const {
    status: autoSaveStatus,
    lastSavedAt,
    saveError: autoSaveError,
    flush: flushAutoSave,
  } = useAutoSave({
    value: form,
    enabled: Boolean(form) && Boolean(eventData?.id) && !loading,
    delay: 800,
    validate: eventIsValid,
    onSave: (nextForm) => persistEvent(nextForm, { includeImage: false, silent: true }),
  });

  useEffect(() => {
    if (!autoSaveError) return;
    setError(autoSaveError?.message || "Não foi possível salvar automaticamente.");
  }, [autoSaveError]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > 5 * 1024 * 1024) {
      setFieldErrors((current) => ({ ...current, image: ["A imagem do evento deve ter no máximo 5 MB."] }));
      return;
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setImage(file);
    if (file) setPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    const handleGeneratedCover = (event) => {
      const file = event?.detail?.file;
      if (!(file instanceof File)) return;
      if (file.size > 5 * 1024 * 1024) {
        setFieldErrors((current) => ({ ...current, image: ["A imagem do evento deve ter no máximo 5 MB."] }));
        return;
      }
      setImage(file);
      setFieldErrors((current) => {
        if (!current.image) return current;
        const next = { ...current };
        delete next.image;
        return next;
      });
      setPreview((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
    };
    window.addEventListener("cutinapp:event-cover-selected", handleGeneratedCover);
    return () => window.removeEventListener("cutinapp:event-cover-selected", handleGeneratedCover);
  }, []);

  const saveChanges = async () => {
    setError("");
    setSuccess("");
    setFieldErrors({});
    if (!eventIsValid(form)) {
      setError(dateInvalid ? "O término do evento precisa ser posterior ao início." : "Revise os campos destacados antes de salvar.");
      return;
    }

    try {
      await persistEvent(form, { includeImage: true, silent: false });
    } catch {
      // persistEvent já apresenta o erro correto na tela.
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    await saveChanges();
  };

  const handleFormBlur = (event) => {
    const element = event.target;
    if (!element || element.type === "file" || element.type === "submit" || element.type === "button") return;
    flushAutoSave();
  };

  const togglePublication = async () => {
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const response = eventData?.is_published
        ? await cutinappService.unpublishEvent(id)
        : await cutinappService.publishEvent(id);
      setEventData(response.event);
      setSuccess(response.message || (response.event?.is_published ? "Evento publicado." : "Evento retirado da publicação."));
      await loadEvent();
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível alterar a publicação do evento.");
    } finally {
      setPublishing(false);
    }
  };

  const publishFromActivation = () => {
    try {
      window.PeterTecnetTelemetry?.track?.("producer_fast_publish_started", {
        label: "Produtor iniciou publicação direta após criar o primeiro lote",
        target: String(eventData?.id || id),
        metadata: {
          event_id: Number(eventData?.id || id),
          activation_stage: "publish_event",
          next_step: "first_sale",
          ticket_lots: Number(eventData?.tickets_count || 0),
        },
      });
    } catch {
      // Telemetry must never interrupt producer activation.
    }
    togglePublication();
  };

  const shareForFirstSale = () => {
    const url = buildFirstSaleShareUrl(eventData);
    if (!url) {
      setError("Publique o evento antes de compartilhar a página de vendas.");
      return;
    }

    const message = `${eventData?.title || "Meu evento"} já está na Cutinapp. Garanta seu ingresso: ${url}`;
    try {
      window.PeterTecnetTelemetry?.track?.("producer_first_sale_share_started", {
        label: "Produtor iniciou divulgação após publicar o primeiro evento",
        target: eventData?.slug || String(eventData?.id || id),
        metadata: {
          event_id: Number(eventData?.id || id),
          activation_stage: "first_sale",
          next_step: "first_sale",
          channel: "whatsapp",
        },
      });
    } catch {
      // Telemetry must never interrupt producer activation.
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const selectProductionItem = (value) => {
    const selected = productionItems.find((item) => String(item.id) === String(value));
    setItemForm((current) => {
      if (!selected) return { ...current, source_item_id: value };
      const catalogPrice = Number(selected.price);
      const catalogStock = Number(selected.stock);
      return {
        source_item_id: value,
        price: current.price || (Number.isFinite(catalogPrice) && catalogPrice > 0 ? catalogPrice.toFixed(2) : ""),
        quantity: current.quantity || (Number.isInteger(catalogStock) && catalogStock >= 0 ? String(catalogStock) : ""),
      };
    });
  };

  const saveAddOn = async () => {
    const price = Number(itemForm.price);
    const quantity = Number(itemForm.quantity);
    if (!selectedProductionItem) {
      setError("Selecione um item já cadastrado no catálogo da produção.");
      return;
    }
    if (!Number.isFinite(price) || price < 0.01 || !Number.isInteger(quantity) || quantity < 0) {
      setError("Informe preço válido e estoque inteiro para o item selecionado.");
      return;
    }
    if (eventItems.some((item) => String(item.name || "").trim().toLowerCase() === String(selectedProductionItem.name || "").trim().toLowerCase())) {
      setError("Este item já está disponível neste evento.");
      return;
    }

    setItemSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await commerceService.saveEventItem(id, {
        source_item_id: Number(selectedProductionItem.id),
        name: selectedProductionItem.name,
        description: selectedProductionItem.description || null,
        price,
        quantity,
        is_active: true,
      });
      setItemForm({ source_item_id: "", price: "", quantity: "" });
      if (eventData?.is_published && eventData?.slug) await loadEventItems();
      else if (response?.item) setEventItems((current) => [...current.filter((item) => item.id !== response.item.id), response.item]);
      setSuccess("Item do catálogo disponível para pré-venda neste evento.");
      try {
        window.PeterTecnetTelemetry?.track?.("producer_event_addon_created", {
          label: "Item do catálogo vinculado ao evento",
          target: String(id),
          metadata: {
            event_id: Number(id),
            source_item_id: Number(selectedProductionItem.id),
            price,
            quantity,
            gross_potential: Number((price * quantity).toFixed(2)),
            suggested_price: hasSuggestedAddOnPrice ? suggestedAddOnPrice : null,
            suggestion_source: hasSuggestedAddOnPrice ? suggestedAddOnSource : null,
            accepted_suggested_price: hasSuggestedAddOnPrice ? Math.abs(price - suggestedAddOnPrice) < 0.01 : null,
            suggested_stock: hasSuggestedAddOnStock ? suggestedAddOnStock : null,
            accepted_suggested_stock: hasSuggestedAddOnStock ? quantity === suggestedAddOnStock : null,
            suggested_net_margin: hasSuggestedAddOnNetMargin ? suggestedAddOnNetMargin : null,
            estimated_net_platform_revenue: hasSuggestedAddOnNetMargin
              ? Number((price * quantity * (suggestedAddOnNetMargin / 100)).toFixed(2))
              : null,
          },
        });
      } catch { /* Telemetria nunca bloqueia monetização. */ }
    } catch (err) {
      setError(err?.message || "Não foi possível disponibilizar o item neste evento.");
    } finally {
      setItemSaving(false);
    }
  };

  const removeAddOn = async (item) => {
    setItemBusyId(item.id);
    setError("");
    setSuccess("");
    try {
      await commerceService.deleteEventItem(id, item.id);
      setEventItems((current) => current.filter((entry) => entry.id !== item.id));
      if (eventData?.is_published && eventData?.slug) await loadEventItems();
      setSuccess("Item removido das novas vendas deste evento.");
    } catch (err) {
      setError(err?.message || "Não foi possível remover o item do evento.");
    } finally {
      setItemBusyId(null);
    }
  };

  const fieldError = (field) => {
    const value = fieldErrors?.[field];
    return Array.isArray(value) ? value[0] : value || "";
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando evento" /></div>;

  return (
    <div className="cut-app-page cut-event-view-page cut-event-editor-page" onBlur={handleFormBlur}>
      <NavlogComponent />
      {(publishing || (saving && image)) && <ProcessingIndicatorComponent label={publishing ? "Atualizando publicação" : "Salvando imagem do evento"} />}

      {form && <>
        <section className="cut-event-banner-stage cut-event-editor-banner-stage" aria-label="Editar imagem do evento">
          <Container className="cut-page-container">
            <div className={`cut-event-banner-frame cut-event-editor-media ${fieldError("image") ? "is-invalid" : ""}`}>
              {preview ? (
                <img src={preview} alt={`Banner de ${form.title || "evento"}`} />
              ) : (
                <div className="cut-event-banner-placeholder"><i className="fa-regular fa-image" aria-hidden="true" /></div>
              )}
              <div className="cut-event-editor-media__actions">
                <label className="btn btn-light mb-0">
                  <i className="fa-solid fa-camera me-2" />Trocar imagem
                  <input name="image" data-event-image-input="true" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} hidden />
                </label>
                <Button type="button" variant="outline-light" onClick={() => window.dispatchEvent(new CustomEvent("cutinapp:open-event-flyer"))}>
                  <i className="fa-solid fa-wand-magic-sparkles me-2" />Gerar com IA
                </Button>
              </div>
              {fieldError("image") && <div className="cut-event-editor-media__error">{fieldError("image")}</div>}
            </div>
          </Container>
        </section>

        <section className="cut-event-summary-strip">
          <Container className="cut-page-container">
            <div className="cut-event-summary-card cut-event-editor-summary-card">
              <div className="cut-event-summary-card__content">
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <Badge bg="info" text="dark"><i className="fa-solid fa-pen me-1" />Modo de edição</Badge>
                  <Badge bg={autoSaveStatus === "error" ? "danger" : autoSaveStatus === "dirty" ? "warning" : autoSaveStatus === "saving" ? "info" : "success"}>{autosaveLabel(autoSaveStatus)}</Badge>
                  {eventData?.category && <Badge bg="dark">{eventData.category}</Badge>}
                  <Badge bg={eventData?.is_published ? "success" : "secondary"}>{eventData?.is_published ? "Publicado" : "Rascunho"}</Badge>
                </div>

                <div className="cut-event-editor-field cut-event-editor-field--hero">
                  <span className="cut-event-editor-field__label">Nome do evento</span>
                  <Form.Control
                    className="cut-event-editor-title"
                    name="title"
                    value={form.title}
                    onChange={change}
                    placeholder="Nome do evento"
                    isInvalid={Boolean(fieldError("title"))}
                    aria-label="Nome do evento"
                  />
                  {fieldError("title") && <div className="invalid-feedback d-block">{fieldError("title")}</div>}
                </div>

                {eventData?.production?.name && <div className="cut-inline-profile-link cut-event-editor-production">Por {eventData.production.name}</div>}

                <div className="cut-event-summary-card__meta cut-event-editor-summary-meta">
                  <div className="cut-event-editor-meta-row">
                    <i className="fa-regular fa-calendar" aria-hidden="true" />
                    <div className="cut-event-editor-field">
                      <span className="cut-event-editor-field__label">Data e hora que aparecem no topo</span>
                      <Form.Control
                        type="datetime-local"
                        min={!eventData?.is_published ? minNow() : undefined}
                        name="start_date"
                        value={form.start_date}
                        onChange={change}
                        isInvalid={Boolean(fieldError("start_date"))}
                      />
                      <small>{form.start_date ? formatDate(form.start_date) : "Defina o início do evento"}</small>
                      {fieldError("start_date") && <div className="invalid-feedback d-block">{fieldError("start_date")}</div>}
                    </div>
                  </div>
                  <div className="cut-event-editor-meta-row">
                    <i className="fa-solid fa-location-dot" aria-hidden="true" />
                    <div className="cut-event-editor-field">
                      <span className="cut-event-editor-field__label">Local que aparece no topo</span>
                      <Form.Control name="venue" value={form.venue} onChange={change} placeholder="Nome do local" />
                      <div className="cut-event-editor-inline-location">
                        <Form.Control name="city" value={form.city} onChange={change} placeholder="Cidade" />
                        <Form.Control name="uf" maxLength={2} value={form.uf} onChange={change} placeholder="UF" isInvalid={ufInvalid} />
                      </div>
                      {ufInvalid && <div className="invalid-feedback d-block">Informe a UF com 2 letras.</div>}
                    </div>
                  </div>
                </div>
                {lastSavedAt && <small className="cut-event-editor-last-saved">Último salvamento: {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}
              </div>

              <div className="cut-card-actions cut-event-summary-card__actions cut-event-editor-actions">
                <Button type="button" variant="light" onClick={saveChanges} disabled={!canSave}>
                  <i className="fa-solid fa-check me-2" />{image ? "Salvar imagem agora" : autoSaveStatus === "saving" ? "Salvando..." : "Salvar agora"}
                </Button>
                {eventData?.is_published && eventData?.slug && <Button type="button" variant="outline-light" onClick={() => navigate(`/event/${eventData.slug}`)}><i className="fa-solid fa-arrow-up-right-from-square me-2" />Ver página pública</Button>}
                <Button type="button" variant="outline-light" onClick={() => navigate("/event/manage")}><i className="fa-solid fa-arrow-left me-2" />Voltar</Button>
              </div>
            </div>
          </Container>
        </section>

        <Container className="cut-page-container py-4 py-lg-5">
          <Alert variant="info" className="cut-event-editor-guide mb-4">
            <i className="fa-solid fa-eye me-2" />Você está editando o evento na mesma hierarquia da página pública. Cada campo está no bloco em que o participante verá essa informação.
          </Alert>
          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          {isFirstTicketActivation && eventData && (
            <Card className="cut-panel mb-4">
              <Card.Body className="p-4 p-lg-5">
                <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-4">
                  <div>
                    <span className="cut-eyebrow">Próximo passo</span>
                    <h2 className="cut-section-title mt-2 mb-2">{eventData.is_published ? "Seu evento já está à venda" : "Seu primeiro lote está pronto"}</h2>
                    <p className="text-secondary mb-0">
                      {eventData.is_published
                        ? "A página pública está liberada. Agora compartilhe o evento para acelerar a primeira venda."
                        : "Publique agora para liberar a página de vendas. Você pode continuar ajustando os detalhes do evento depois."}
                    </p>
                  </div>
                  <div className="d-grid gap-2" style={{ minWidth: 250 }}>
                    {!eventData.is_published ? (
                      <Button type="button" size="lg" onClick={publishFromActivation} disabled={publishing || eventData.is_cancelled || Number(eventData.tickets_count || 0) <= 0}>
                        <i className="fa-solid fa-rocket me-2" />Publicar e começar a vender
                      </Button>
                    ) : eventData.slug ? (
                      <>
                        <Button type="button" size="lg" variant="success" onClick={shareForFirstSale}><i className="fa-brands fa-whatsapp me-2" />Compartilhar e buscar a primeira venda</Button>
                        <Button type="button" variant="outline-light" onClick={() => navigate(`/event/${eventData.slug}`)}>Abrir página de vendas</Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </Card.Body>
            </Card>
          )}

          <section id="ingressos" className="cut-ticket-shop-section mb-5">
            <div className="cut-ticket-shop-section__heading">
              <span className="cut-eyebrow">Tickets</span>
              <h2 className="cut-section-title mt-2 mb-1">Ingressos</h2>
              <p className="text-secondary mb-0">Este bloco ocupa o mesmo lugar em que os participantes escolhem seus ingressos na página pública.</p>
            </div>
            <Card className="cut-panel cut-event-editor-ticket-card mt-3">
              <Card.Body className="p-4">
                <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
                  <div>
                    <strong className="d-block fs-5">{eventData?.tickets_count || 0} lote(s) configurado(s)</strong>
                    <span className="text-secondary">Gerencie os lotes sem perder a referência de onde a compra aparece na view do evento.</span>
                  </div>
                  <div className="cut-card-actions">
                    <Button type="button" variant="outline-light" onClick={() => navigate(`/event/${id}/courtesies`)}>Gerenciar ingressos</Button>
                    <Button type="button" onClick={() => navigate(`/ticket/create?eventId=${id}`)}>Criar novo lote</Button>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </section>

          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel mb-4 cut-event-editor-panel">
                <Card.Body className="p-4 p-lg-5">
                  <span className="cut-eyebrow">Sobre o evento</span>
                  <h2 className="cut-section-title mt-2">Informações</h2>
                  <div className="cut-event-editor-field mb-4">
                    <span className="cut-event-editor-field__label">Descrição exibida neste bloco</span>
                    <Form.Control
                      as="textarea"
                      rows={8}
                      name="description"
                      value={form.description}
                      onChange={change}
                      isInvalid={Boolean(fieldError("description"))}
                      placeholder="Conte a experiência do evento"
                    />
                    <Form.Control.Feedback type="invalid">{fieldError("description")}</Form.Control.Feedback>
                  </div>

                  <div className="cut-event-details cut-event-editor-details">
                    <div><i className="fa-regular fa-calendar" /><span><strong>Início</strong>{form.start_date ? formatDate(form.start_date) : "Não informado"}</span></div>
                    <div className="cut-event-editor-detail-input">
                      <i className="fa-regular fa-clock" />
                      <span>
                        <strong>Término</strong>
                        <Form.Control type="datetime-local" min={form.start_date || undefined} name="end_date" value={form.end_date} onChange={change} isInvalid={dateInvalid || Boolean(fieldError("end_date"))} />
                        {(dateInvalid || fieldError("end_date")) && <small className="text-danger">{fieldError("end_date") || "O término precisa ser posterior ao início."}</small>}
                      </span>
                    </div>
                    <div><i className="fa-solid fa-location-dot" /><span><strong>Local</strong>{form.venue || form.address || "Não informado"}</span></div>
                    <div><i className="fa-solid fa-map" /><span><strong>Cidade</strong>{form.city ? `${form.city}${form.uf ? ` - ${form.uf}` : ""}` : "Não informada"}</span></div>
                  </div>
                </Card.Body>
              </Card>

              <Card className="cut-panel cut-event-editor-map-card">
                <Card.Body className="p-4 p-lg-5">
                  <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 mb-4">
                    <div>
                      <span className="cut-eyebrow">Localização</span>
                      <h2 className="cut-section-title mt-2 mb-1">Mapa do evento</h2>
                      <p className="text-secondary mb-0">O mapa abaixo é o mesmo bloco exibido ao participante.</p>
                    </div>
                  </div>
                  <Row className="g-3 mb-4">
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label>Endereço *</Form.Label>
                        <Form.Control name="address" value={form.address} onChange={change} isInvalid={Boolean(fieldError("address"))} placeholder="Rua, número, bairro" />
                        <Form.Control.Feedback type="invalid">{fieldError("address")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label>Link do Google Maps</Form.Label>
                        <Form.Control type="url" name="google_maps_url" value={form.google_maps_url} onChange={change} placeholder="https://maps.app.goo.gl/..." isInvalid={Boolean(fieldError("google_maps_url"))} />
                        <Form.Control.Feedback type="invalid">{fieldError("google_maps_url")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                  {mapEmbedUrl ? (
                    <iframe title={`Mapa de ${form.title || "evento"}`} src={mapEmbedUrl} width="100%" height="360" style={{ border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                  ) : (
                    <div className="cut-event-editor-map-placeholder"><i className="fa-solid fa-map-location-dot" /><span>Preencha o endereço para visualizar o mapa.</span></div>
                  )}
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4}>
              <Card className="cut-panel mb-4 cut-event-editor-management">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between gap-3 align-items-start">
                    <div><span className="cut-eyebrow">Gestão</span><h2 className="cut-section-title mt-2">Publicação</h2></div>
                    <Badge bg={eventData?.is_published ? "success" : "secondary"}>{eventData?.is_published ? "Publicado" : "Rascunho"}</Badge>
                  </div>
                  <div className="cut-info-box mt-3">
                    <strong>{eventData?.tickets_count || 0} lote(s) configurado(s)</strong>
                    <span>{Number(eventData?.tickets_count || 0) > 0 ? "Revise os campos da view e publique quando estiver pronto." : "Crie pelo menos um lote de ingresso antes de publicar."}</span>
                  </div>
                  <div className="d-grid gap-2 mt-3">
                    <Button type="button" onClick={saveChanges} disabled={!canSave}><i className="fa-solid fa-check me-2" />{image ? "Salvar imagem agora" : "Salvar agora"}</Button>
                    <Button type="button" variant="outline-light" onClick={togglePublication} disabled={publishing || eventData?.is_cancelled || (!eventData?.is_published && Number(eventData?.tickets_count || 0) <= 0)}>{eventData?.is_published ? "Retirar da publicação" : "Publicar evento"}</Button>
                    {eventData?.is_published && eventData?.slug && <Button type="button" variant="outline-light" onClick={() => navigate(`/event/${eventData.slug}`)}>Abrir página pública</Button>}
                    {eventData?.is_published && <Button type="button" variant="outline-light" onClick={() => navigate(`/checkin?eventId=${id}`)}>Abrir portaria</Button>}
                  </div>
                </Card.Body>
              </Card>

              <Card className="cut-panel cut-event-editor-management">
                <Card.Body className="p-4">
                  <span className="cut-eyebrow">Dados complementares</span>
                  <h2 className="cut-section-title mt-2">Contato e capacidade</h2>
                  <div className="d-grid gap-3 mt-3">
                    <Form.Group>
                      <Form.Label>Capacidade</Form.Label>
                      <Form.Control type="number" min="1" max="1000000" name="max_attendees" value={form.max_attendees} onChange={change} isInvalid={capacityInvalid || Boolean(fieldError("max_attendees"))} />
                      <Form.Control.Feedback type="invalid">{fieldError("max_attendees") || "Use um valor maior que zero."}</Form.Control.Feedback>
                    </Form.Group>
                    <Form.Group>
                      <Form.Label>E-mail de contato</Form.Label>
                      <Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} isInvalid={Boolean(fieldError("contact_email"))} />
                      <Form.Control.Feedback type="invalid">{fieldError("contact_email")}</Form.Control.Feedback>
                    </Form.Group>
                    <Form.Group>
                      <Form.Label>Telefone de contato</Form.Label>
                      <Form.Control name="contact_phone" value={form.contact_phone} onChange={change} />
                    </Form.Group>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Form onSubmit={submit} noValidate>
            <input type="hidden" name="production_id" value={form.production_id || ""} />
            <Card className="cut-panel mt-4"><Card.Body className="p-4 p-lg-5">
              <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-start mb-4">
                <div>
                  <span className="cut-eyebrow">Monetização do evento</span>
                  <h2 className="cut-section-title mt-2">Adicionais e pré-venda</h2>
                  <p className="text-secondary mb-0">Selecione itens e serviços já cadastrados na produção para vendê-los junto do ingresso. O valor entra no mesmo checkout e segue as taxas vigentes, sem cobrança escondida.</p>
                </div>
                <Badge bg={eventItems.length ? "success" : "secondary"}>{eventItems.length} adicional(is) ativo(s)</Badge>
              </div>

              {hasSuggestedAddOnPrice && <Alert variant="info" className="mb-3"><strong>Sugestão baseada em vendas reais: {money(suggestedAddOnPrice)}{hasSuggestedAddOnStock ? ` com estoque inicial de ${suggestedAddOnStock}` : ""}.</strong> {suggestedAddOnSource === "event" ? "Usamos o valor médio dos adicionais já vendidos neste evento." : "Usamos o valor médio dos adicionais vendidos nos outros eventos desta produção."} {hasSuggestedAddOnStock ? "O estoque sugerido usa a oportunidade incremental estimada no painel e é limitado a 100 unidades." : ""} Preço e estoque são apenas pré-preenchidos: revise livremente antes de vincular o item.</Alert>}

              {productionItemsError && <Alert variant="danger">{productionItemsError}</Alert>}
              {productionItemsLoading ? (
                <div className="text-secondary">Carregando catálogo da produção...</div>
              ) : productionItems.length === 0 ? (
                <Alert variant="warning" className="mb-0"><strong>Nenhum item cadastrado na produção.</strong> Cadastre itens no catálogo da produção antes de disponibilizá-los neste evento. A criação de itens não é feita pela tela do evento.</Alert>
              ) : (
                <>
                  <Row className="g-3 align-items-end">
                    <Col lg={5} md={6}>
                      <Form.Group>
                        <Form.Label>Item da produção *</Form.Label>
                        <Form.Select value={itemForm.source_item_id} onChange={(e) => selectProductionItem(e.target.value)}>
                          <option value="">Selecione um item do catálogo</option>
                          {productionItems.map((item) => {
                            const alreadyAdded = eventItems.some((eventItem) => String(eventItem.name || "").trim().toLowerCase() === String(item.name || "").trim().toLowerCase());
                            return <option key={item.id} value={item.id} disabled={alreadyAdded}>{item.name}{alreadyAdded ? " — já adicionado" : ""}</option>;
                          })}
                        </Form.Select>
                        <Form.Text>Somente itens ativos e pertencentes a esta produção podem ser vinculados.</Form.Text>
                      </Form.Group>
                    </Col>
                    <Col lg={3} md={3}><Form.Group><Form.Label>Preço no evento *</Form.Label><Form.Control type="number" min="0.01" step="0.01" value={itemForm.price} onChange={(e) => setItemForm((current) => ({ ...current, price: e.target.value }))} placeholder="0,00" /></Form.Group></Col>
                    <Col lg={2} md={3}><Form.Group><Form.Label>Estoque no evento *</Form.Label><Form.Control type="number" min="0" step="1" value={itemForm.quantity} onChange={(e) => setItemForm((current) => ({ ...current, quantity: e.target.value }))} placeholder="0" /></Form.Group></Col>
                    <Col lg={2} xs={12}><Button type="button" className="w-100" onClick={saveAddOn} disabled={itemSaving || !selectedProductionItem}>{itemSaving ? "Adicionando..." : "Adicionar ao evento"}</Button></Col>
                  </Row>

                  {selectedProductionItem && (
                    <div className="cut-info-box mt-3">
                      <strong>{selectedProductionItem.name}</strong>
                      <span>Catálogo da produção: {money(selectedProductionItem.price)}{selectedProductionItem.stock !== null && selectedProductionItem.stock !== undefined ? ` · estoque ${Number(selectedProductionItem.stock || 0)}` : ""}</span>
                      {selectedProductionItem.description && <small className="d-block text-secondary mt-1">{selectedProductionItem.description}</small>}
                      <small className="d-block text-secondary mt-2">Nome e descrição vêm do catálogo da produção. Alterar preço ou estoque aqui afeta apenas a oferta deste evento e não modifica o item original.</small>
                    </div>
                  )}

                  {Number(itemForm.price) > 0 && Number(itemForm.quantity) >= 0 && <div className="cut-info-box mt-3"><strong>Potencial bruto deste estoque: {money(Number(itemForm.price) * Number(itemForm.quantity || 0))}</strong>{hasSuggestedAddOnNetMargin && <span>Receita líquida Peter Tecnet estimada: {money(Number(itemForm.price) * Number(itemForm.quantity || 0) * (suggestedAddOnNetMargin / 100))} · margem líquida observada {suggestedAddOnNetMargin.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%.</span>}<span>É apenas uma referência econômica se todo o estoque for vendido; usa a margem observada no painel quando disponível, não é garantia de receita e não altera preço, taxa ou take rate.</span></div>}
                </>
              )}

              <div className="mt-4">
                {itemLoading ? <div className="text-secondary">Carregando adicionais...</div> : eventItems.length === 0 ? <Alert variant="info" className="mb-0">Nenhum adicional ativo neste evento. Selecione acima um item já cadastrado na produção para começar a pré-venda.</Alert> : <Row className="g-3">{eventItems.map((item) => <Col md={6} key={item.id}><div className="cut-info-box h-100"><div className="d-flex justify-content-between gap-3"><div><strong>{item.name}</strong><span>{money(item.price)} · estoque {Number(item.quantity || 0)}</span>{item.description && <small className="d-block text-secondary mt-1">{item.description}</small>}</div><Button type="button" size="sm" variant="outline-danger" disabled={itemBusyId === item.id} onClick={() => removeAddOn(item)}>{itemBusyId === item.id ? "Removendo..." : "Remover"}</Button></div></div></Col>)}</Row>}
              </div>
            </Card.Body></Card>
          </Form>
        </Container>
      </>}
    </div>
  );
}
