import React, { useEffect, useMemo, useState } from "react";
import { Button, Container, Form, Modal, ProgressBar } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { EventHealthBadge, EventMetrics } from "../../components/event/EventManagerEnhancements";
import EventProductSalesManager from "../../components/event/EventProductSalesManager";
import useAutoSave from "../../hooks/useAutoSave";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";
import { eventHealth, eventOperationalMetrics } from "../../utils/eventManagerInsights";
import { showImportantAlert } from "../../utils/sweetAlert";
import "./EventUpdatePageV2.css";

const SECTIONS = [
  ["overview", "Visão geral", "fa-solid fa-gauge-high"],
  ["info", "Informações", "fa-regular fa-pen-to-square"],
  ["media", "Arte e mídia", "fa-regular fa-image"],
  ["tickets", "Ingressos", "fa-solid fa-ticket"],
  ["products", "Produtos", "fa-solid fa-bag-shopping"],
  ["program", "Programação", "fa-regular fa-clock"],
  ["team", "Equipe", "fa-solid fa-people-group"],
  ["promotion", "Divulgação", "fa-solid fa-bullhorn"],
  ["settings", "Configurações", "fa-solid fa-sliders"],
];

const pad = (number) => String(number).padStart(2, "0");
const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const coverUrl = (image) => {
  if (!image) return "";
  const value = String(image);
  return /^https?:\/\//i.test(value) ? value : `${storageUrl}${value.replace(/^\//, "")}`;
};
const validForm = (form) => Boolean(
  form?.title?.trim().length >= 2
  && form?.description?.trim()
  && form?.address?.trim()
  && form?.start_date
  && form?.end_date
  && new Date(form.end_date) > new Date(form.start_date)
  && (!form.uf || form.uf.trim().length === 2)
  && (form.max_attendees === "" || Number(form.max_attendees) >= 1),
);
const friendlyError = (error, fallback) => {
  const status = Number(error?.status || error?.response?.status || 0);
  if (status === 404) return fallback;
  if (status === 429) return "Muitas solicitações agora. Aguarde alguns segundos e tente novamente.";
  if (status >= 500 || status === 0) return "O serviço está temporariamente indisponível. Tente novamente em instantes.";
  const validation = error?.response?.data?.errors;
  const firstValidation = validation && Object.values(validation).flat()[0];
  return firstValidation || error?.response?.data?.message || error?.message || fallback;
};

export default function EventUpdatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [section, setSection] = useState("overview");
  const [eventData, setEventData] = useState(null);
  const [form, setForm] = useState(null);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [coupons, setCoupons] = useState([]);
  const [couponForm, setCouponForm] = useState({ code: "", discount_type: "percentage", discount_value: "" });
  const [couponSaving, setCouponSaving] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);

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
    setPreview(coverUrl(item.image));
  };

  useEffect(() => {
    if (!error) return;
    const message = error;
    setError("");
    void showImportantAlert({
      title: "Não foi possível continuar",
      text: message,
      icon: "error",
      confirmButtonText: "Entendi",
      allowOutsideClick: false,
      recoveryContext: { productionId: eventData?.production_id || form?.production_id, eventId: id },
    });
  }, [error, id, eventData?.production_id, form?.production_id]);

  useEffect(() => {
    if (!success) return;
    const message = success;
    setSuccess("");
    void showImportantAlert({ title: "Concluído", text: message, icon: "success", confirmButtonText: "Entendi" });
  }, [success]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventService.show(id)
      .then((item) => active && applyEvent(item))
      .catch((err) => active && setError(friendlyError(err, "Não foi possível carregar o evento.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const organizationId = Number(eventData?.production_id || 0);
    if (!organizationId) return;
    commerceService.producerCoupons(organizationId)
      .then((rows) => setCoupons(Array.isArray(rows) ? rows : rows?.data || []))
      .catch(() => setCoupons([]));
  }, [eventData?.production_id]);

  useEffect(() => {
    const onGeneratedCover = (generatedEvent) => {
      const file = generatedEvent?.detail?.file;
      if (!(file instanceof File)) return;
      if (file.size > 5 * 1024 * 1024) {
        setError("A arte gerada ficou acima de 5 MB. Gere outra versão ou envie uma imagem menor.");
        return;
      }
      setImage(file);
      setPreview((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      setSection("media");
      setSuccess("Arte selecionada. Salve para aplicá-la ao evento.");
    };
    window.addEventListener("cutinapp:event-cover-selected", onGeneratedCover);
    return () => window.removeEventListener("cutinapp:event-cover-selected", onGeneratedCover);
  }, []);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const metrics = useMemo(() => eventOperationalMetrics(eventData || {}), [eventData]);
  const health = useMemo(() => eventHealth(eventData || {}), [eventData]);
  const publicUrl = eventData?.slug ? `${window.location.origin}/event/${eventData.slug}` : "";
  const hasSales = Number(metrics?.ticketsSold || 0) > 0 || Number(eventData?.orders_count || 0) > 0;
  const checks = useMemo(() => [
    [Boolean(form?.title?.trim()), "Nome definido"],
    [Boolean(preview || eventData?.image), "Flyer definido"],
    [Boolean(form?.start_date && form?.end_date), "Data e horário definidos"],
    [Boolean(form?.venue || form?.address), "Local definido"],
    [Number(eventData?.tickets_count || 0) > 0, "Pelo menos um ingresso"],
    [Boolean(form?.contact_email || form?.contact_phone), "Contato informado"],
    [Boolean(eventData?.is_published), "Evento publicado"],
  ], [form, preview, eventData]);
  const readiness = Math.round((checks.filter(([ok]) => ok).length / checks.length) * 100);

  const persist = async (nextForm, { includeImage = false, silent = false } = {}) => {
    if (!validForm(nextForm)) return false;
    setSaving(true);
    if (!silent) {
      setError("");
      setSuccess("");
    }
    try {
      const payload = new FormData();
      Object.entries(nextForm).forEach(([key, value]) => {
        if (value === null || value === "") return;

        if (key === "start_date" && eventData?.start_date && value === toLocalInput(eventData.start_date)) return;
        if (key === "end_date" && eventData?.end_date && value === toLocalInput(eventData.end_date)) return;

        payload.append(key, value);
      });
      if (includeImage && image) payload.append("image", image);
      const response = await eventService.update(id, payload);
      const updated = response?.event || { ...eventData, ...nextForm };
      setEventData((current) => ({ ...current, ...updated }));
      if (includeImage && image) {
        setImage(null);
        if (updated.image) setPreview(coverUrl(updated.image));
      }
      setAuditRows((rows) => [{ at: new Date(), label: includeImage && image ? "Dados e arte salvos" : "Alterações salvas" }, ...rows].slice(0, 8));
      if (!silent) setSuccess("Evento salvo com sucesso.");
      return true;
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(friendlyError(err, "Não foi possível salvar o evento."));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const { status: autoSaveStatus, lastSavedAt, flush: flushAutoSave } = useAutoSave({
    value: form,
    enabled: Boolean(form && eventData?.id && !loading),
    delay: 900,
    validate: validForm,
    onSave: (nextForm) => persist(nextForm, { silent: true }),
  });

  const change = async (event) => {
    const { name, value } = event.target;
    if (hasSales && ["start_date", "end_date"].includes(name)) {
      const result = await showImportantAlert({
        title: "Evento com vendas",
        text: "Alterar data ou horário pode afetar participantes que já possuem ingressos. Deseja continuar?",
        icon: "warning",
        confirmButtonText: "Alterar mesmo assim",
        cancelButtonText: "Cancelar",
        showCancelButton: true,
        allowOutsideClick: false,
      });
      if (!result?.isConfirmed) return;
    }
    setForm((current) => ({ ...current, [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 5 MB.");
      return;
    }
    setImage(file);
    setPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const saveNow = async () => {
    if (!validForm(form)) {
      setError("Revise nome, descrição, endereço, datas, UF e capacidade antes de salvar.");
      return;
    }
    try {
      await persist(form, { includeImage: true });
    } catch (_) {
      // persist já apresentou o erro correto na tela.
    }
  };

  const togglePublication = async () => {
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      if (!eventData?.is_published && readiness < 70) {
        setError("Conclua os itens essenciais do evento antes de publicar.");
        return;
      }
      const response = eventData?.is_published
        ? await cutinappService.unpublishEvent(id)
        : await cutinappService.publishEvent(id);
      applyEvent(response?.event || await eventService.show(id));
      setSuccess(response?.message || (eventData?.is_published ? "Evento retirado da publicação." : "Evento publicado."));
    } catch (err) {
      setError(friendlyError(err, "Não foi possível alterar a publicação do evento."));
    } finally {
      setPublishing(false);
    }
  };

  const createCoupon = async () => {
    const organizationId = Number(eventData?.production_id || 0);
    const value = Number(couponForm.discount_value);
    if (!organizationId || !couponForm.code.trim() || !Number.isFinite(value) || value <= 0) {
      setError("Informe código e desconto válidos.");
      return;
    }
    setCouponSaving(true);
    setError("");
    try {
      const coupon = await commerceService.createCoupon(organizationId, {
        code: couponForm.code.trim().toUpperCase(),
        discount_type: couponForm.discount_type,
        discount_value: value,
        event_id: Number(id),
        is_active: true,
      });
      setCoupons((rows) => [coupon, ...rows]);
      setCouponForm({ code: "", discount_type: "percentage", discount_value: "" });
      setSuccess("Cupom criado para a divulgação do evento.");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível criar o cupom."));
    } finally {
      setCouponSaving(false);
    }
  };

  const duplicateNextWeek = async () => {
    const base = new Date(eventData?.start_date || Date.now());
    base.setDate(base.getDate() + 7);
    try {
      const response = await eventService.duplicate(id, base.toISOString().slice(0, 10));
      const nextId = response?.event?.id || response?.id;
      setSuccess("Evento duplicado para a próxima semana.");
      if (nextId) navigate(`/event/edit/${nextId}`);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível duplicar o evento."));
    }
  };

  const copyLink = async () => {
    if (!publicUrl) {
      setError("Publique o evento para gerar o link público.");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setSuccess("Link copiado.");
    } catch (_) {
      setError("Não foi possível copiar automaticamente. Abra a página pública e copie o endereço.");
    }
  };

  const shareWhatsapp = () => {
    if (!publicUrl) {
      setError("Publique o evento antes de compartilhar.");
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${form?.title || "Evento"} — ${publicUrl}`)}`, "_blank", "noopener,noreferrer");
  };

  const scrollSection = (key) => {
    setSection(key);
    requestAnimationFrame(() => document.getElementById(`event-editor-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando gerenciador do evento" /></div>;
  if (!form) return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><div className="cev2-card text-center"><h2>Evento indisponível</h2><p className="text-secondary mb-3">Não foi possível abrir este evento.</p><Button type="button" onClick={() => navigate("/event/manage")}>Voltar para meus eventos</Button></div></Container></div>;

  return <div className="cut-app-page cut-event-manager-v2" onBlur={(event) => {
    const nextTarget = event.relatedTarget;
    const movingToAction = nextTarget instanceof HTMLElement && Boolean(nextTarget.closest("button, .pt-ai-description"));
    if (!movingToAction && event.target?.type !== "file") flushAutoSave();
  }}>
    <NavlogComponent />
    {(publishing || (saving && image)) && <ProcessingIndicatorComponent label={publishing ? "Atualizando publicação" : "Salvando evento"} />}

    <header className="cev2-hero"><Container className="cut-page-container"><div className="cev2-hero-grid"><div><span className="cev2-eyebrow">Gerenciador do evento</span><h1 className="cev2-title">{form.title || "Evento sem nome"}</h1><p className="cev2-sub">Edite, monetize, divulgue e acompanhe tudo em um só lugar.</p></div><div className="cev2-status"><span className="cev2-pill">{eventData?.is_published ? "Publicado" : "Rascunho"}</span><span className="cev2-pill">{autoSaveStatus === "saving" ? "Salvando…" : autoSaveStatus === "error" ? "Falha no autosave" : "Autosave ativo"}</span><EventHealthBadge event={eventData || {}} /></div></div></Container></header>

    <nav className="cev2-tabs"><Container className="cut-page-container"><div className="cev2-tabs-inner">{SECTIONS.map(([key, label, icon]) => <button key={key} type="button" className={`cev2-tab ${section === key ? "is-active" : ""}`} onClick={() => scrollSection(key)}><i className={`${icon} me-2`} />{label}</button>)}</div></Container></nav>

    <Container className="cut-page-container cev2-main">
      {hasSales && <div className="cev2-card cev2-danger-note"><strong>Evento com vendas.</strong> Alterações críticas de data e horário exigem confirmação.</div>}
      <div className="cev2-grid">
        <main>
          <section id="event-editor-overview" className="cev2-card"><div className="cev2-kicker"><div><span className="cev2-eyebrow">Visão geral</span><h2>Saúde e operação</h2></div><strong>{readiness}% pronto</strong></div><div className="cev2-progress mb-4"><span style={{ width: `${readiness}%` }} /></div><div className="cev2-metrics mb-4"><div className="cev2-metric"><small>Faturamento</small><strong>{money(metrics.grossSales)}</strong></div><div className="cev2-metric"><small>Ingressos vendidos</small><strong>{metrics.ticketsSold || 0}</strong></div><div className="cev2-metric"><small>Visualizações</small><strong>{metrics.views || 0}</strong></div><div className="cev2-metric"><small>Conversão</small><strong>{Number(metrics.conversionRate || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div></div><div className="cev2-health"><div className="cev2-health-score" style={{ "--health": `${health.score}%` }}><span>{health.score}</span></div><div><h2>Checklist de publicação</h2><div className="cev2-checklist">{checks.map(([ok, label]) => <span key={label} className={`cev2-check ${ok ? "is-ok" : ""}`}><i className={ok ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />{label}</span>)}</div></div></div></section>

          <section id="event-editor-info" className="cev2-card"><span className="cev2-eyebrow">Informações</span><h2>Dados essenciais</h2><div className="cev2-form-grid"><div className="cev2-field is-wide"><label>Nome do evento</label><Form.Control name="title" value={form.title} onChange={change} isInvalid={Boolean(fieldErrors?.title)} /></div><div className="cev2-field is-wide"><label>Descrição</label><Form.Control as="textarea" name="description" value={form.description} onChange={change} /></div><div className="cev2-field"><label>Início</label><Form.Control type="datetime-local" name="start_date" value={form.start_date} onChange={change} /></div><div className="cev2-field"><label>Término</label><Form.Control type="datetime-local" name="end_date" value={form.end_date} onChange={change} /></div><div className="cev2-field"><label>Local</label><Form.Control name="venue" value={form.venue} onChange={change} /></div><div className="cev2-field"><label>Endereço</label><Form.Control name="address" value={form.address} onChange={change} /></div><div className="cev2-field"><label>Cidade</label><Form.Control name="city" value={form.city} onChange={change} /></div><div className="cev2-field"><label>UF</label><Form.Control name="uf" maxLength={2} value={form.uf} onChange={change} /></div></div></section>

          <section id="event-editor-media" className="cev2-card"><span className="cev2-eyebrow">Arte e mídia</span><h2>Flyer e capa</h2><div className="cev2-cover">{preview ? <img src={preview} alt={`Capa de ${form.title}`} /> : <span className="cev2-cover-placeholder"><i className="fa-regular fa-image" /></span>}</div><div className="cev2-actions"><Button onClick={() => window.dispatchEvent(new CustomEvent("cutinapp:open-event-flyer"))}>Creative Studio</Button><Form.Label className="btn btn-outline-light mb-0">Enviar imagem<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} hidden /></Form.Label>{image && <Button variant="success" onClick={saveNow}>Aplicar arte</Button>}</div></section>

          <section id="event-editor-tickets" className="cev2-card"><span className="cev2-eyebrow">Ingressos</span><h2>Lotes e acesso</h2><EventMetrics event={eventData || {}} /><div className="cev2-actions mt-3"><Button onClick={() => navigate(`/ticket/create?eventId=${id}`)}>Criar lote</Button><Button variant="outline-light" onClick={() => navigate(`/event/${id}/participants`)}>Participantes</Button></div></section>

          <section id="event-editor-products" className="cev2-card"><EventProductSalesManager eventId={id} eventData={eventData} onSuccess={setSuccess} onError={setError} /></section>

          <section id="event-editor-program" className="cev2-card"><h2>Programação</h2><Button onClick={() => navigate(`/event/${id}/lineup`)}><i className="fa-solid fa-music me-2" />Cadastrar line-up</Button><Button variant="outline-light" onClick={duplicateNextWeek}>Duplicar +7 dias</Button></section>

          <section id="event-editor-team" className="cev2-card"><h2>Equipe</h2><Button onClick={() => navigate(`/event/${id}/lineup`)}>Artistas e DJs</Button></section>

          <section id="event-editor-promotion" className="cev2-card"><h2>Divulgação e cupons</h2><div className="cev2-actions"><Button onClick={shareWhatsapp}>WhatsApp</Button><Button onClick={copyLink}>Copiar link</Button></div><div className="cev2-form-grid"><Form.Control value={couponForm.code} onChange={(event) => setCouponForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /><Form.Select value={couponForm.discount_type} onChange={(event) => setCouponForm((current) => ({ ...current, discount_type: event.target.value }))}><option value="percentage">Percentual</option><option value="fixed">Valor fixo</option></Form.Select><Form.Control type="number" value={couponForm.discount_value} onChange={(event) => setCouponForm((current) => ({ ...current, discount_value: event.target.value }))} /><Button onClick={createCoupon} disabled={couponSaving}>Criar cupom</Button></div>{coupons.slice(0, 6).map((coupon) => <div key={coupon.id || coupon.code}>{coupon.code}</div>)}</section>

          <section id="event-editor-settings" className="cev2-card"><h2>Configurações</h2><div className="cev2-form-grid"><Form.Control type="number" name="max_attendees" value={form.max_attendees} onChange={change} /><Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} /><Form.Control name="contact_phone" value={form.contact_phone} onChange={change} /></div><Button onClick={togglePublication} disabled={publishing}>{eventData?.is_published ? "Despublicar" : "Publicar"}</Button></section>
        </main>

        <aside className="cev2-sidebar">
          <div className="cev2-card cev2-shortcuts-card"><div className="cev2-shortcuts-head"><div><span className="cev2-eyebrow">Navegação rápida</span><h2>Atalhos</h2></div><span className="cev2-shortcuts-count" aria-label={`${SECTIONS.length} seções`}>{SECTIONS.length}</span></div><p className="cev2-shortcuts-copy">Acesse diretamente qualquer área deste evento.</p><div className="cev2-shortcuts-grid">{SECTIONS.map(([key, label, icon]) => <button type="button" key={key} className={`cev2-shortcut ${section === key ? "is-active" : ""}`} aria-current={section === key ? "true" : undefined} onClick={() => scrollSection(key)}><span className="cev2-shortcut-icon"><i className={icon} /></span><span className="cev2-shortcut-label">{label}</span><i className="fa-solid fa-chevron-right cev2-shortcut-arrow" aria-hidden="true" /></button>)}</div></div>
          <div className="cev2-card"><h2>Operação</h2><div>{autoSaveStatus}</div>{lastSavedAt && <div>{lastSavedAt.toLocaleTimeString("pt-BR")}</div>}</div>
          <div className="cev2-card"><h2>Histórico</h2>{auditRows.map((row, index) => <div key={index}>{row.label}</div>)}</div>
        </aside>
      </div>
    </Container>

    <div className="cev2-mobile-actions"><Button onClick={() => setPreviewOpen(true)}>Prévia</Button><Button onClick={saveNow} disabled={saving}>Salvar</Button><Button onClick={togglePublication} disabled={publishing}>{eventData?.is_published ? "Despublicar" : "Publicar"}</Button></div>
    <Modal show={previewOpen} onHide={() => setPreviewOpen(false)} centered><Modal.Header closeButton><Modal.Title>Prévia</Modal.Title></Modal.Header><Modal.Body>{preview && <img src={preview} alt="" className="w-100" />}<h2>{form.title}</h2><p>{form.description}</p><ProgressBar now={readiness} /></Modal.Body></Modal>
  </div>;
}
