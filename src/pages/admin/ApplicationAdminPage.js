import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import applicationAdminService from "../../services/ApplicationAdminService";
import "./ApplicationAdminPage.css";

const sections = [
  { key: "dashboard", label: "Visão geral", icon: "fa-solid fa-chart-line" },
  { key: "users", label: "Usuários", icon: "fa-solid fa-users" },
  { key: "productions", label: "Produções", icon: "fa-solid fa-building" },
  { key: "events", label: "Eventos", icon: "fa-regular fa-calendar-days" },
  { key: "activity", label: "Atividades", icon: "fa-solid fa-wave-square" },
];

const allowedSections = new Set(sections.map((item) => item.key));

const formatNumber = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
};

const statusLabel = (item) => {
  if (item?.is_cancelled) return { label: "Cancelado", tone: "danger" };
  if (item?.is_published) return { label: "Publicado", tone: "success" };
  return { label: "Rascunho", tone: "muted" };
};

const errorMessage = (error) =>
  error?.response?.data?.message
  || error?.data?.message
  || error?.message
  || "Não foi possível carregar os dados administrativos.";

export default function ApplicationAdminPage() {
  const { user } = useContext(AuthContext);
  const { section: sectionParam } = useParams();
  const navigate = useNavigate();
  const section = allowedSections.has(sectionParam) ? sectionParam : "dashboard";
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [activityType, setActivityType] = useState("");
  const [activityOutcome, setActivityOutcome] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const currentSection = useMemo(
    () => sections.find((item) => item.key === section) || sections[0],
    [section]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setActivityType("");
    setActivityOutcome("");
    setDateFrom("");
    setDateTo("");
    setMenuOpen(false);
  }, [section]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      let response;
      if (section === "users") {
        response = await applicationAdminService.users({
          search: debouncedSearch || undefined,
          status: status || undefined,
          page,
          per_page: 25,
        });
      } else if (section === "productions") {
        response = await applicationAdminService.productions({
          search: debouncedSearch || undefined,
          status: status || undefined,
          page,
          per_page: 25,
        });
      } else if (section === "events") {
        response = await applicationAdminService.events({
          search: debouncedSearch || undefined,
          status: status || undefined,
          page,
          per_page: 25,
        });
      } else if (section === "activity") {
        response = await applicationAdminService.activity({
          search: debouncedSearch || undefined,
          type: activityType || undefined,
          outcome: activityOutcome || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          page,
          per_page: 30,
        });
      } else {
        response = await applicationAdminService.overview();
      }

      setData(response);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [activityOutcome, activityType, dateFrom, dateTo, debouncedSearch, page, section, status]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (key, action, successMessage) => {
    setSaving(key);
    setNotice("");
    setError("");
    try {
      await action();
      setNotice(successMessage);
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setSaving("");
    }
  };

  const goSection = (nextSection) => {
    navigate(nextSection === "dashboard" ? "/admin" : `/admin/${nextSection}`);
    setMenuOpen(false);
  };

  const meta = data?.meta || {};
  const rows = Array.isArray(data?.data) ? data.data : [];

  const pagination = meta.last_page > 1 && (
    <div className="cut-admin-pagination">
      <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
        <i className="fa-solid fa-chevron-left" /> Anterior
      </button>
      <span>Página {meta.current_page || page} de {meta.last_page}</span>
      <button type="button" disabled={page >= meta.last_page || loading} onClick={() => setPage((current) => current + 1)}>
        Próxima <i className="fa-solid fa-chevron-right" />
      </button>
    </div>
  );

  const filters = section !== "dashboard" && (
    <div className="cut-admin-filters">
      <label className="cut-admin-search">
        <i className="fa-solid fa-magnifying-glass" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={section === "activity" ? "Buscar atividade, rota ou usuário" : "Buscar por nome, e-mail, cidade ou identificador"}
        />
      </label>

      {section === "users" && (
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Todos os acessos</option>
          <option value="active">Ativos</option>
          <option value="suspended">Suspensos</option>
          <option value="inactive">Inativos</option>
        </select>
      )}

      {section === "productions" && (
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Todos os status</option>
          <option value="published">Publicadas</option>
          <option value="draft">Rascunhos</option>
          <option value="cancelled">Canceladas</option>
        </select>
      )}

      {section === "events" && (
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Todos os eventos</option>
          <option value="published">Publicados</option>
          <option value="draft">Rascunhos</option>
          <option value="upcoming">Próximos</option>
          <option value="past">Encerrados</option>
          <option value="cancelled">Cancelados</option>
        </select>
      )}

      {section === "activity" && (
        <>
          <select value={activityType} onChange={(event) => { setActivityType(event.target.value); setPage(1); }}>
            <option value="">Todas as atividades</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="view">Visualização</option>
            <option value="create">Criação</option>
            <option value="update">Atualização</option>
            <option value="delete">Exclusão</option>
          </select>
          <select value={activityOutcome} onChange={(event) => { setActivityOutcome(event.target.value); setPage(1); }}>
            <option value="">Todos os resultados</option>
            <option value="success">Sucesso</option>
            <option value="error">Erro</option>
            <option value="failed">Falha</option>
          </select>
          <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} aria-label="Data inicial" />
          <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} aria-label="Data final" />
        </>
      )}
    </div>
  );

  const dashboardContent = () => {
    const metrics = data?.metrics || {};
    const series = Array.isArray(data?.activity_series) ? data.activity_series : [];
    const maxActivity = Math.max(1, ...series.map((item) => Number(item.total || 0)));

    return (
      <>
        <div className="cut-admin-metrics">
          {[
            ["Usuários", metrics.users_total, "fa-solid fa-users", `${formatNumber(metrics.users_new_30d)} novos em 30 dias`],
            ["Produções", metrics.productions_total, "fa-solid fa-building", `${formatNumber(metrics.productions_published)} publicadas`],
            ["Eventos", metrics.events_total, "fa-regular fa-calendar-days", `${formatNumber(metrics.events_upcoming)} próximos`],
            ["Ativos 24h", metrics.active_users_24h, "fa-solid fa-signal", `${formatNumber(metrics.interactions_today)} interações hoje`],
            ["Falhas 24h", metrics.errors_24h, "fa-solid fa-triangle-exclamation", "Erros e falhas registrados"],
          ].map(([label, value, icon, hint]) => (
            <article className="cut-admin-metric" key={label}>
              <span className="cut-admin-metric__icon"><i className={icon} /></span>
              <div><small>{label}</small><strong>{formatNumber(value)}</strong><p>{hint}</p></div>
            </article>
          ))}
        </div>

        <div className="cut-admin-dashboard-grid">
          <section className="cut-admin-card cut-admin-card--chart">
            <div className="cut-admin-card__head"><div><small>Últimos 7 dias</small><h2>Atividade da plataforma</h2></div><button type="button" onClick={() => goSection("activity")}>Ver atividades</button></div>
            <div className="cut-admin-bars" aria-label="Atividade dos últimos sete dias">
              {series.map((item) => (
                <div className="cut-admin-bar" key={item.date} title={`${item.date}: ${item.total} interações`}>
                  <strong>{formatNumber(item.total)}</strong>
                  <span><i style={{ height: `${Math.max(8, (Number(item.total || 0) / maxActivity) * 100)}%` }} /></span>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="cut-admin-card">
            <div className="cut-admin-card__head"><div><small>Agenda</small><h2>Próximos eventos</h2></div><button type="button" onClick={() => goSection("events")}>Gerenciar</button></div>
            <div className="cut-admin-compact-list">
              {(data?.upcoming_events || []).length === 0 && <p className="cut-admin-empty">Nenhum evento futuro encontrado.</p>}
              {(data?.upcoming_events || []).map((event) => (
                <Link key={event.id} to={`/event/${event.slug}`}>
                  <span><strong>{event.title}</strong><small>{event.city || "Local não informado"}{event.uf ? ` · ${event.uf}` : ""}</small></span>
                  <time>{formatDateTime(event.start_date)}</time>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="cut-admin-card">
          <div className="cut-admin-card__head"><div><small>Telemetria</small><h2>Atividades recentes</h2></div><button type="button" onClick={() => goSection("activity")}>Abrir histórico</button></div>
          <div className="cut-admin-activity-list">
            {(data?.recent_activity || []).map((activity) => (
              <div key={activity.id} className="cut-admin-activity-item">
                <span className={`cut-admin-activity-dot ${activity.outcome === "error" || activity.outcome === "failed" ? "is-error" : ""}`} />
                <div><strong>{activity.name || activity.type || "Atividade"}</strong><small>{activity.user?.name || activity.user?.email || "Visitante"} · {activity.route || activity.entity_type || "Cutinapp"}</small></div>
                <time>{formatDateTime(activity.created_at)}</time>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  };

  const usersContent = () => (
    <section className="cut-admin-card cut-admin-table-card">
      <div className="cut-admin-table-wrap">
        <table className="cut-admin-table">
          <thead><tr><th>Usuário</th><th>Vínculo</th><th>Localização</th><th>Entrada</th><th>Ações</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const isOwner = String(item.email || "").toLowerCase() === "petertecnet@gmail.com";
              const isAdmin = Boolean(item.membership?.is_admin);
              const isActive = item.membership?.status === "active";
              return (
                <tr key={item.id}>
                  <td><div className="cut-admin-person"><span>{String(item.first_name || item.name || "U").slice(0, 2).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.email}</small></div></div></td>
                  <td><div className="cut-admin-tags"><span className={`cut-admin-badge ${isActive ? "is-success" : "is-warning"}`}>{item.membership?.status || "sem status"}</span>{isAdmin && <span className="cut-admin-badge is-admin">Admin</span>}</div></td>
                  <td>{[item.city, item.uf].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{formatDateTime(item.membership?.joined_at || item.created_at)}</td>
                  <td><div className="cut-admin-actions">
                    {!isOwner && <button type="button" disabled={saving === `admin-${item.id}`} onClick={() => runAction(`admin-${item.id}`, () => applicationAdminService.updateUserAccess(item.id, { is_admin: !isAdmin }), isAdmin ? "Acesso administrativo removido." : "Acesso administrativo concedido.")}>{isAdmin ? "Remover admin" : "Tornar admin"}</button>}
                    {!isOwner && <button type="button" className={isActive ? "is-danger" : ""} disabled={saving === `status-${item.id}`} onClick={() => runAction(`status-${item.id}`, () => applicationAdminService.updateUserAccess(item.id, { status: isActive ? "suspended" : "active" }), isActive ? "Acesso à Cutinapp suspenso." : "Acesso à Cutinapp reativado.")}>{isActive ? "Suspender" : "Reativar"}</button>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="cut-admin-empty">Nenhum usuário encontrado com esses filtros.</p>}
      {pagination}
    </section>
  );

  const productionsContent = () => (
    <section className="cut-admin-card cut-admin-table-card">
      <div className="cut-admin-table-wrap">
        <table className="cut-admin-table">
          <thead><tr><th>Produção</th><th>Status</th><th>Localização</th><th>Atualização</th><th>Ações</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const currentStatus = statusLabel(item);
              return (
                <tr key={item.id}>
                  <td><div><strong>{item.name}</strong><small className="cut-admin-secondary">#{item.id} · {item.slug}</small></div></td>
                  <td><div className="cut-admin-tags"><span className={`cut-admin-badge is-${currentStatus.tone}`}>{currentStatus.label}</span>{item.is_featured && <span className="cut-admin-badge is-admin">Destaque</span>}</div></td>
                  <td>{[item.city, item.uf].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{formatDateTime(item.updated_at)}</td>
                  <td><div className="cut-admin-actions">
                    <Link to={`/production/${item.id}`}>Abrir</Link>
                    <button type="button" disabled={saving === `production-${item.id}`} onClick={() => runAction(`production-${item.id}`, () => applicationAdminService.updateProductionStatus(item.id, { is_published: !item.is_published }), item.is_published ? "Produção retirada da publicação." : "Produção publicada.")}>{item.is_published ? "Despublicar" : "Publicar"}</button>
                    <button type="button" disabled={saving === `feature-production-${item.id}`} onClick={() => runAction(`feature-production-${item.id}`, () => applicationAdminService.updateProductionStatus(item.id, { is_featured: !item.is_featured }), item.is_featured ? "Produção removida dos destaques." : "Produção destacada.")}>{item.is_featured ? "Tirar destaque" : "Destacar"}</button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="cut-admin-empty">Nenhuma produção encontrada com esses filtros.</p>}
      {pagination}
    </section>
  );

  const eventsContent = () => (
    <section className="cut-admin-card cut-admin-table-card">
      <div className="cut-admin-table-wrap">
        <table className="cut-admin-table">
          <thead><tr><th>Evento</th><th>Produção</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const currentStatus = statusLabel(item);
              return (
                <tr key={item.id}>
                  <td><div><strong>{item.title}</strong><small className="cut-admin-secondary">{item.city || "Sem cidade"}{item.uf ? ` / ${item.uf}` : ""}</small></div></td>
                  <td>{item.production?.name || "—"}</td>
                  <td><div className="cut-admin-tags"><span className={`cut-admin-badge is-${currentStatus.tone}`}>{currentStatus.label}</span>{item.is_featured && <span className="cut-admin-badge is-admin">Destaque</span>}{item.is_private && <span className="cut-admin-badge">Privado</span>}</div></td>
                  <td>{formatDateTime(item.start_date)}</td>
                  <td><div className="cut-admin-actions">
                    <Link to={`/event/${item.slug}`}>Abrir</Link>
                    <button type="button" disabled={saving === `event-${item.id}`} onClick={() => runAction(`event-${item.id}`, () => applicationAdminService.updateEventStatus(item.id, { is_published: !item.is_published }), item.is_published ? "Evento retirado da publicação." : "Evento publicado.")}>{item.is_published ? "Despublicar" : "Publicar"}</button>
                    <button type="button" disabled={saving === `feature-event-${item.id}`} onClick={() => runAction(`feature-event-${item.id}`, () => applicationAdminService.updateEventStatus(item.id, { is_featured: !item.is_featured }), item.is_featured ? "Evento removido dos destaques." : "Evento destacado.")}>{item.is_featured ? "Tirar destaque" : "Destacar"}</button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="cut-admin-empty">Nenhum evento encontrado com esses filtros.</p>}
      {pagination}
    </section>
  );

  const activityContent = () => (
    <section className="cut-admin-card cut-admin-table-card">
      <div className="cut-admin-table-wrap">
        <table className="cut-admin-table">
          <thead><tr><th>Horário</th><th>Atividade</th><th>Usuário</th><th>Contexto</th><th>Resultado</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{formatDateTime(item.created_at)}</td>
                <td><div><strong>{item.name || item.type || "Atividade"}</strong><small className="cut-admin-secondary">{item.type || "—"}</small></div></td>
                <td><div><strong>{item.user?.name || "Visitante"}</strong><small className="cut-admin-secondary">{item.user?.email || "Não autenticado"}</small></div></td>
                <td><div><strong>{item.route || item.entity_type || "—"}</strong><small className="cut-admin-secondary">{item.method || ""}{item.entity_id ? ` · #${item.entity_id}` : ""}</small></div></td>
                <td><span className={`cut-admin-badge ${item.outcome === "error" || item.outcome === "failed" ? "is-danger" : item.outcome === "success" ? "is-success" : ""}`}>{item.outcome || item.severity || "registrado"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="cut-admin-empty">Nenhuma atividade encontrada com esses filtros.</p>}
      {pagination}
    </section>
  );

  const content = () => {
    if (loading && !data) return <div className="cut-admin-loading"><span /><p>Carregando administração da Cutinapp…</p></div>;
    if (section === "users") return usersContent();
    if (section === "productions") return productionsContent();
    if (section === "events") return eventsContent();
    if (section === "activity") return activityContent();
    return dashboardContent();
  };

  return (
    <div className="cut-admin-shell">
      <aside className={`cut-admin-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="cut-admin-brand">
          <img src="/images/logo.png" alt="Cutinapp" />
          <div><strong>Cutinapp</strong><small>Administração da plataforma</small></div>
          <button type="button" className="cut-admin-sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><i className="fa-solid fa-xmark" /></button>
        </div>

        <nav aria-label="Administração Cutinapp">
          {sections.map((item) => (
            <button type="button" key={item.key} className={section === item.key ? "active" : ""} onClick={() => goSection(item.key)}>
              <i className={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="cut-admin-sidebar__footer">
          <Link to="/moderation/reports"><i className="fa-solid fa-shield-halved" /> Moderação</Link>
          <Link to="/feed"><i className="fa-solid fa-arrow-left" /> Voltar para Cutinapp</Link>
        </div>
      </aside>

      {menuOpen && <button type="button" className="cut-admin-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fechar menu administrativo" />}

      <main className="cut-admin-main">
        <header className="cut-admin-topbar">
          <div className="cut-admin-topbar__title">
            <button type="button" className="cut-admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu administrativo"><i className="fa-solid fa-bars" /></button>
            <div><small>Administração Cutinapp</small><h1>{currentSection.label}</h1></div>
          </div>
          <div className="cut-admin-topbar__actions">
            <button type="button" className="cut-admin-refresh" onClick={load} disabled={loading}><i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} /> Atualizar</button>
            <div className="cut-admin-user"><span>{String(user?.first_name || "PT").slice(0, 2).toUpperCase()}</span><div><strong>{user?.first_name || "Administrador"}</strong><small>{user?.email}</small></div></div>
          </div>
        </header>

        <div className="cut-admin-content">
          <div className="cut-admin-page-head">
            <div><p>Gestão isolada da Cutinapp</p><h2>{currentSection.label}</h2><small>Dados e ações abaixo pertencem somente ao contexto da Cutinapp.</small></div>
            {section === "users" && <span className="cut-admin-total">{formatNumber(meta.total)} usuários</span>}
            {section === "productions" && <span className="cut-admin-total">{formatNumber(meta.total)} produções</span>}
            {section === "events" && <span className="cut-admin-total">{formatNumber(meta.total)} eventos</span>}
            {section === "activity" && <span className="cut-admin-total">{formatNumber(meta.total)} atividades</span>}
          </div>

          {notice && <div className="cut-admin-feedback is-success"><i className="fa-solid fa-circle-check" /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fechar aviso"><i className="fa-solid fa-xmark" /></button></div>}
          {error && <div className="cut-admin-feedback is-error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Fechar erro"><i className="fa-solid fa-xmark" /></button></div>}

          {filters}
          {content()}
        </div>
      </main>
    </div>
  );
}
