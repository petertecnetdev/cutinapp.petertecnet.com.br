import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import CutinLayout from "../components/CutinLayout";
import CutinService from "../services/CutinService";
import "./CutinPages.css";

const money = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const date = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";

const apiError = (error, fallback) => (
  error?.response?.data?.message
  || Object.values(error?.response?.data?.errors || {}).flat()[0]
  || fallback
);

function Field({ label, ...props }) {
  return <label className="cutin-field"><span>{label}</span><input {...props} /></label>;
}

Field.propTypes = {
  label: PropTypes.string.isRequired,
};

export function PublicEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState({});
  const [result, setResult] = useState(null);
  const [pix, setPix] = useState(null);
  const [paying, setPaying] = useState(false);
  const [form, setForm] = useState({
    buyer_name: "",
    buyer_email: "",
    buyer_document: "",
    buyer_phone: "",
    payment_method: "pix",
    promoter_code: new URLSearchParams(window.location.search).get("ref") || "",
    promotion_code: "",
  });

  useEffect(() => {
    CutinService.publicEvent(id)
      .then(setPayload)
      .catch((requestError) => setError(apiError(requestError, "Evento não encontrado.")));
  }, [id]);

  useEffect(() => {
    if (!result?.sale?.public_id || result?.sale?.payment_status === "paid" || !pix) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await CutinService.paymentStatus(result.sale.public_id);
        if (response?.sale?.payment_status === "paid") {
          setResult((current) => ({ ...current, sale: response.sale, message: "Pagamento confirmado. Seus ingressos já foram emitidos." }));
          window.clearInterval(timer);
        }
      } catch (requestError) {
        console.warn("Falha temporária ao consultar pagamento.", requestError);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pix, result?.sale?.payment_status, result?.sale?.public_id]);

  const lines = useMemo(() => {
    if (!payload) return [];
    const all = [
      ...(payload.tickets || []).map((item) => ({ ...item, type: "ticket" })),
      ...(payload.products || []).map((item) => ({ ...item, type: "product" })),
    ];
    return all
      .filter((item) => (cart[`${item.type}-${item.id}`] || 0) > 0)
      .map((item) => ({ ...item, quantity: cart[`${item.type}-${item.id}`] }));
  }, [payload, cart]);

  const subtotal = lines.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);

  const add = (type, itemId, delta = 1) => {
    setCart((current) => ({ ...current, [`${type}-${itemId}`]: Math.max(0, (current[`${type}-${itemId}`] || 0) + delta) }));
  };

  const checkout = async (event) => {
    event.preventDefault();
    const authenticated = Boolean(localStorage.getItem("token") || localStorage.getItem("access_token"));
    if (!authenticated) {
      navigate(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
      return;
    }
    setError("");
    setPaying(true);
    try {
      const response = await CutinService.checkout(id, { ...form, items: lines.map((item) => ({ type: item.type, id: item.id, quantity: item.quantity })) });
      setResult(response);
      if (response?.sale?.payment_status !== "paid" && response?.sale?.public_id && Number(response.sale.total) > 0) {
        const pixResponse = await CutinService.createPix(response.sale.public_id);
        setPix(pixResponse.pix);
      }
    } catch (requestError) {
      setError(apiError(requestError, "Não foi possível concluir a compra."));
    } finally {
      setPaying(false);
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value || "");
    } catch (clipboardError) {
      setError("Não foi possível copiar automaticamente. Selecione o código PIX manualmente.");
    }
  };

  if (error && !payload) return <CutinLayout><section className="cutin-section"><div className="empty-card">{error}</div></section></CutinLayout>;
  if (!payload) return <CutinLayout><section className="cutin-section"><div className="empty-card">Carregando evento...</div></section></CutinLayout>;

  const event = payload.event;

  return (
    <CutinLayout>
      <section className="cutin-section">
        <div className="event-detail-hero">
          <span className="eyebrow">{event.city || "Evento"}</span>
          <h1>{event.title}</h1>
          <p>{event.description}</p>
          <div className="event-meta"><span>{date(event.start_date)}</span><span>{event.venue || event.address}</span><span>{event.production?.name || event.organizer_name || "Cutinapp"}</span></div>
        </div>

        <div className="two-col">
          <div>
            <h2>Ingressos</h2>
            <div className="stack">
              {(payload.tickets || []).map((ticket) => (
                <article className="panel" key={ticket.id}>
                  <div className="row-between"><div><strong>{ticket.name}</strong><p>{ticket.description}</p><small>{ticket.quantity} disponíveis</small></div><b>{money(ticket.price)}</b></div>
                  <div className="qty"><button type="button" onClick={() => add("ticket", ticket.id, -1)}>−</button><span>{cart[`ticket-${ticket.id}`] || 0}</span><button type="button" onClick={() => add("ticket", ticket.id, 1)} disabled={Number(ticket.quantity) <= Number(cart[`ticket-${ticket.id}`] || 0)}>+</button></div>
                </article>
              ))}
            </div>

            <h2>Produtos & extras</h2>
            <div className="stack">
              {(payload.products || []).length ? (payload.products || []).map((product) => (
                <article className="panel" key={product.id}>
                  <div className="row-between"><div><strong>{product.name}</strong><p>{product.description}</p>{product.stock !== null && <small>{product.stock} em estoque</small>}</div><b>{money(product.price)}</b></div>
                  <div className="qty"><button type="button" onClick={() => add("product", product.id, -1)}>−</button><span>{cart[`product-${product.id}`] || 0}</span><button type="button" onClick={() => add("product", product.id, 1)} disabled={product.stock !== null && Number(product.stock) <= Number(cart[`product-${product.id}`] || 0)}>+</button></div>
                </article>
              )) : <div className="empty-card">Este evento ainda não publicou produtos extras.</div>}
            </div>
          </div>

          <aside className="panel checkout-box">
            <h2>Seu pedido</h2>
            {lines.length ? lines.map((item) => <div className="row-between compact" key={`${item.type}-${item.id}`}><span>{item.quantity}× {item.name}</span><b>{money(Number(item.price) * item.quantity)}</b></div>) : <p className="muted">Nenhum item selecionado.</p>}
            <hr />
            <div className="row-between compact"><strong>Subtotal</strong><strong>{money(subtotal)}</strong></div>

            {result ? (
              result.sale?.payment_status === "paid" ? (
                <div className="success-box"><strong>Pagamento confirmado</strong><p>Pedido {result.sale.public_id}</p><Link to="/meus-ingressos">Abrir meus ingressos</Link></div>
              ) : pix ? (
                <div className="pix-box">
                  <span className="eyebrow">PIX</span><h3>Pague para emitir seus ingressos</h3>
                  {pix.qr_image ? <img className="pix-qr" src={pix.qr_image} alt="QR Code PIX" /> : <QRCodeSVG value={pix.pix_copy_paste || ""} size={210} />}
                  <textarea value={pix.pix_copy_paste || ""} readOnly aria-label="PIX copia e cola" />
                  <button type="button" className="secondary" onClick={() => copy(pix.pix_copy_paste)}>Copiar PIX copia e cola</button>
                  {pix.payment_link && <a className="primary" href={pix.payment_link} target="_blank" rel="noreferrer">Abrir pagamento</a>}
                  <p className="muted">A confirmação é automática. Esta tela verifica o pagamento periodicamente.</p>
                </div>
              ) : <div className="empty-card">Gerando cobrança PIX...</div>
            ) : (
              <form onSubmit={checkout}>
                <Field label="Nome completo" value={form.buyer_name} onChange={(input) => setForm({ ...form, buyer_name: input.target.value })} required />
                <Field label="E-mail" type="email" value={form.buyer_email} onChange={(input) => setForm({ ...form, buyer_email: input.target.value })} required />
                <Field label="CPF/CNPJ (opcional)" value={form.buyer_document} onChange={(input) => setForm({ ...form, buyer_document: input.target.value })} />
                <Field label="Telefone" value={form.buyer_phone} onChange={(input) => setForm({ ...form, buyer_phone: input.target.value })} />
                <Field label="Cupom" value={form.promotion_code} onChange={(input) => setForm({ ...form, promotion_code: input.target.value.toUpperCase() })} />
                <Field label="Código do promoter" value={form.promoter_code} onChange={(input) => setForm({ ...form, promoter_code: input.target.value.toUpperCase() })} />
                <div className="payment-choice"><b>Pagamento online</b><span>PIX · confirmação automática</span></div>
                {error && <p className="error-text">{error}</p>}
                <button className="primary" disabled={!lines.length || paying}>{paying ? "Gerando pedido..." : "Finalizar com PIX"}</button>
              </form>
            )}
          </aside>
        </div>
      </section>
    </CutinLayout>
  );
}

export function EventManagePage() {
  const { id } = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [members, setMembers] = useState([]);
  const [promoters, setPromoters] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [dashboardData, memberData, promoterData, promotionData] = await Promise.all([
        CutinService.dashboard(id), CutinService.members(id), CutinService.promoters(id), CutinService.promotions(id),
      ]);
      setDashboard(dashboardData);
      setMembers(Array.isArray(memberData) ? memberData : []);
      setPromoters(Array.isArray(promoterData) ? promoterData : []);
      setPromotions(Array.isArray(promotionData) ? promotionData : []);
      setMessage("");
    } catch (requestError) {
      setMessage(apiError(requestError, "Não foi possível carregar a gestão."));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addMember = async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(event.currentTarget);
      await CutinService.createMember(id, Object.fromEntries(formData));
      event.currentTarget.reset();
      await load();
    } catch (requestError) { setMessage(apiError(requestError, "Não foi possível adicionar a pessoa.")); }
  };

  const addPromotion = async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData);
      await CutinService.createPromotion(id, { ...payload, discount_value: Number(payload.discount_value), usage_limit: payload.usage_limit ? Number(payload.usage_limit) : null });
      event.currentTarget.reset();
      await load();
    } catch (requestError) { setMessage(apiError(requestError, "Não foi possível criar a promoção.")); }
  };

  const activatePromoter = async (memberId) => {
    try {
      await CutinService.createPromoter(id, { member_id: memberId, commission_type: "percentage", commission_value: 10 });
      await load();
    } catch (requestError) { setMessage(apiError(requestError, "Não foi possível ativar o promoter.")); }
  };

  if (!dashboard) return <CutinLayout><section className="cutin-section"><div className="empty-card">{message || "Carregando gestão..."}</div></section></CutinLayout>;
  const metrics = dashboard.metrics || {};

  return (
    <CutinLayout>
      <section className="cutin-section">
        <div className="section-head">
          <div><span className="eyebrow">Gestão do evento</span><h1>{dashboard.event?.title}</h1></div>
          <div className="hero-actions"><Link className="secondary" to={`/event/update/${id}`}>Editar evento</Link><Link className="secondary" to={`/gerenciar/evento/${id}/ingressos`}>Ingressos</Link><Link className="secondary" to={`/event/${id}/items`}>Produtos</Link><Link className="primary" to={`/evento/${id}`}>Página pública</Link></div>
        </div>
        {message && <div className="error-box">{message}</div>}
        <div className="tabs">{["dashboard", "equipe", "promoters", "promocoes", "vendas"].map((name) => <button type="button" className={tab === name ? "active" : ""} onClick={() => setTab(name)} key={name}>{name}</button>)}</div>

        {tab === "dashboard" && <><div className="dashboard-grid"><div className="metric"><span>Vendas</span><strong>{metrics.sales_count || 0}</strong></div><div className="metric"><span>Receita</span><strong>{money(metrics.revenue)}</strong></div><div className="metric"><span>Ingressos</span><strong>{metrics.tickets_issued || 0}</strong></div><div className="metric"><span>Check-ins</span><strong>{metrics.checkins || 0}</strong></div><div className="metric"><span>Comissões</span><strong>{money(metrics.commissions)}</strong></div><div className="metric"><span>Equipe</span><strong>{metrics.members || 0}</strong></div></div><div className="panel"><h3>Ranking de promoters</h3>{(dashboard.promoter_ranking || []).length ? dashboard.promoter_ranking.map((promoter) => <div className="row-between" key={promoter.id}><span>{promoter.code} · {promoter.sales_count} vendas</span><b>{money(promoter.revenue)} · {money(promoter.commissions)} comissão</b></div>) : <p className="muted">Ainda não há vendas atribuídas a promoters.</p>}</div></>}

        {tab === "equipe" && <div className="two-col"><div className="panel"><h3>Adicionar pessoa</h3><form onSubmit={addMember} className="form-grid"><input name="name" placeholder="Nome" required /><input name="email" type="email" placeholder="E-mail" /><input name="phone" placeholder="Telefone" /><select name="role" defaultValue="collaborator"><option value="manager">Gerente</option><option value="promoter">Promoter</option><option value="supplier">Fornecedor</option><option value="collaborator">Colaborador</option><option value="checker">Operador de check-in</option></select><button className="primary">Adicionar</button></form></div><div className="panel"><h3>Equipe atual</h3>{members.map((member) => <div className="row-between" key={member.id}><span><b>{member.name}</b><small>{member.role} · {member.status}<br />{member.email}</small></span><div className="inline-actions">{member.role === "promoter" && !promoters.some((promoter) => Number(promoter.member_id) === Number(member.id)) && <button type="button" onClick={() => activatePromoter(member.id)}>Ativar comissão</button>}<button type="button" className="danger-button" onClick={async () => { await CutinService.deleteMember(id, member.id); await load(); }}>Remover</button></div></div>)}</div></div>}

        {tab === "promoters" && <div className="panel"><h3>Promoters e links rastreáveis</h3>{promoters.length ? promoters.map((promoter) => <div className="row-between" key={promoter.id}><span><b>{promoter.name || promoter.code}</b><small>Código {promoter.code} · {promoter.commission_type === "percentage" ? `${promoter.commission_value}%` : money(promoter.commission_value)}</small></span><div className="inline-actions"><button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/evento/${id}?ref=${promoter.code}`)}>Copiar link</button><button type="button" onClick={async () => { await CutinService.updatePromoter(id, promoter.id, { active: !promoter.active }); await load(); }}>{promoter.active ? "Pausar" : "Ativar"}</button></div></div>) : <p className="muted">Cadastre uma pessoa com função promoter e ative sua comissão.</p>}</div>}

        {tab === "promocoes" && <div className="two-col"><div className="panel"><h3>Criar promoção</h3><form onSubmit={addPromotion} className="form-grid"><input name="name" placeholder="Nome da promoção" required /><input name="code" placeholder="Cupom (opcional)" /><select name="discount_type"><option value="percentage">Percentual</option><option value="fixed">Valor fixo</option></select><input name="discount_value" type="number" step="0.01" min="0" placeholder="Desconto" required /><input name="usage_limit" type="number" min="1" placeholder="Limite de usos (opcional)" /><button className="primary">Criar promoção</button></form></div><div className="panel"><h3>Promoções</h3>{promotions.map((promotion) => <div className="row-between" key={promotion.id}><span>{promotion.name}<small>{promotion.code || "sem cupom"} · {promotion.used_count || 0}{promotion.usage_limit ? `/${promotion.usage_limit}` : ""} usos</small></span><div className="inline-actions"><b>{promotion.discount_type === "percentage" ? `${promotion.discount_value}%` : money(promotion.discount_value)}</b><button type="button" onClick={async () => { await CutinService.updatePromotion(id, promotion.id, { active: !promotion.active }); await load(); }}>{promotion.active ? "Pausar" : "Ativar"}</button></div></div>)}</div></div>}

        {tab === "vendas" && <div className="panel"><h3>Vendas recentes</h3><table><thead><tr><th>Cliente</th><th>Status</th><th>Forma</th><th>Total</th><th>Ação</th></tr></thead><tbody>{(dashboard.recent_sales || []).map((sale) => <tr key={sale.id}><td>{sale.buyer_name}<small>{sale.buyer_email}</small></td><td><span className={`status ${sale.payment_status}`}>{sale.payment_status}</span></td><td>{sale.payment_method}</td><td>{money(sale.total)}</td><td>{sale.payment_status === "pending" && sale.payment_method !== "pix" ? <button type="button" onClick={async () => { await CutinService.confirmPayment(id, sale.id); await load(); }}>Confirmar manualmente</button> : "—"}</td></tr>)}</tbody></table></div>}
      </section>
    </CutinLayout>
  );
}

export function CheckinPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const validate = useCallback(async (value) => {
    if (!value) return;
    setError("");
    try {
      const clean = value.includes("/") ? value.split("/").pop() : value;
      const response = await CutinService.checkin(clean);
      setResult(response);
      setToken("");
      setScanning(false);
    } catch (requestError) {
      setResult(requestError?.response?.data || null);
      setError(apiError(requestError, "Ingresso inválido."));
    }
  }, []);

  useEffect(() => {
    if (!scanning) return undefined;
    let cancelled = false;
    const start = async () => {
      if (!window.BarcodeDetector) {
        setError("Leitura automática de QR não é suportada neste navegador. Use o token manual.");
        setScanning(false);
        return;
      }
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (videoRef.current) { videoRef.current.srcObject = streamRef.current; await videoRef.current.play(); }
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.[0]?.rawValue) { await validate(codes[0].rawValue); return; }
          } catch (detectorError) {
            console.warn("Falha temporária na leitura do QR.", detectorError);
          }
          window.setTimeout(loop, 500);
        };
        loop();
      } catch (cameraError) {
        setError("Não foi possível acessar a câmera.");
        setScanning(false);
      }
    };
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks()?.forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [scanning, validate]);

  return <CutinLayout><section className="cutin-section narrow"><span className="eyebrow">Operação de entrada</span><h1>Check-in</h1><p className="page-subtitle">Leia o QR do ingresso ou digite o token. A API impede reutilização do mesmo acesso.</p><div className="panel"><button type="button" className={scanning ? "secondary" : "primary"} onClick={() => setScanning((current) => !current)}>{scanning ? "Fechar câmera" : "Ler QR com câmera"}</button>{scanning && <div className="scanner"><video ref={videoRef} muted playsInline /></div>}<form onSubmit={(event) => { event.preventDefault(); validate(token); }}><Field label="Token do ingresso" value={token} onChange={(event) => setToken(event.target.value.trim())} placeholder="Cole o token do ingresso" required /><button className="secondary">Validar token</button></form>{result && <div className={result.valid ? "success-box" : "error-box"}><strong>{result.message}</strong><p>{result.admission?.holder_name}</p></div>}{error && <p className="error-text">{error}</p>}</div></section></CutinLayout>;
}
