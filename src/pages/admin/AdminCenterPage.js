import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import adminCenterService from "../../services/AdminCenterService";
import "./AdminCenterPage.css";

const PERMISSION_LABELS = {
  "dashboard.view": "Visão geral",
  "events.view": "Visualizar eventos",
  "events.manage": "Gerenciar eventos",
  "establishments.view": "Visualizar estabelecimentos",
  "establishments.manage": "Gerenciar estabelecimentos",
  "tickets.view": "Visualizar ingressos",
  "tickets.manage": "Gerenciar ingressos",
  "checkin.view": "Visualizar check-in",
  "checkin.manage": "Gerenciar check-in",
  "finance.view": "Visualizar financeiro",
  "finance.refund": "Executar reembolsos",
  "users.view": "Visualizar usuários",
  "users.manage": "Gerenciar usuários",
  "moderation.view": "Visualizar moderação",
  "moderation.manage": "Gerenciar moderação",
  "support.view": "Visualizar suporte",
  "support.manage": "Gerenciar suporte",
  "audit.view": "Visualizar auditoria",
};

const MODULES = [
  { permission: "events.view", icon: "fa-regular fa-calendar-days", title: "Eventos", description: "Operação, publicação e acompanhamento de eventos." },
  { permission: "establishments.view", icon: "fa-solid fa-building", title: "Estabelecimentos", description: "Produções, responsáveis e recursos vinculados." },
  { permission: "tickets.view", icon: "fa-solid fa-ticket", title: "Ingressos", description: "Ingressos, lotes, cortesias e ocorrências." },
  { permission: "checkin.view", icon: "fa-solid fa-qrcode", title: "Check-in", description: "Entrada, validações e integridade dos QR Codes." },
  { permission: "finance.view", icon: "fa-solid fa-wallet", title: "Financeiro", description: "Vendas, taxas, receita e reembolsos autorizados." },
  { permission: "users.view", icon: "fa-solid fa-users", title: "Usuários", description: "Contas, histórico e suporte operacional." },
  { permission: "moderation.view", icon: "fa-solid fa-shield-halved", title: "Moderação", description: "Conteúdo, denúncias e ações de segurança." },
  { permission: "support.view", icon: "fa-solid fa-headset", title: "Suporte", description: "Problemas específicos da Cutinapp e seus fluxos." },
];

const emptyProfile = { id: null, name: "", description: "", permissions: [] };
const emptyAssignment = { email: "", profile_id: "" };

const number = (value) => value == null ? "—" : Number(value).toLocaleString("pt-BR");
const dateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
};

export default function AdminCenterPage() {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState(null);
  const [overview, setOverview] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState("");

  const can = useCallback((permission) => Boolean(
    context?.is_root || context?.permissions?.includes(permission)
  ), [context]);

  const loadRootAccessData = useCallback(async () => {
    const [permissionData, profileData, assignmentData] = await Promise.all([
      adminCenterService.permissionCatalog(),
      adminCenterService.profiles(),
      adminCenterService.assignments(),
    ]);
    setCatalog(permissionData?.permissions || []);
    setProfiles(Array.isArray(profileData) ? profileData : []);
    setAssignments(Array.isArray(assignmentData) ? assignmentData : []);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const access = await adminCenterService.context();
        if (!mounted) return;
        if (!access?.authorized) {
          setContext(access || null);
          return;
        }

        setContext(access);
        const permissions = access?.permissions || [];
        const isRoot = Boolean(access?.is_root);
        const jobs = [];

        if (isRoot || permissions.includes("dashboard.view")) {
          jobs.push(adminCenterService.overview().then((data) => mounted && setOverview(data)));
        }
        if (isRoot) {
          jobs.push(loadRootAccessData());
        }
        if (isRoot || permissions.includes("audit.view")) {
          jobs.push(adminCenterService.audit(30).then((data) => {
            if (!mounted) return;
            const rows = data?.data || data || [];
            setAudit(Array.isArray(rows) ? rows : []);
          }));
        }

        await Promise.allSettled(jobs);
      } catch (requestError) {
        if (!mounted) return;
        if (requestError?.status === 403) {
          setContext({ authorized: false, is_root: false, permissions: [] });
        } else {
          setError(requestError?.message || "Não foi possível carregar o Admin Cutinapp.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [loadRootAccessData]);

  const enabledModules = useMemo(
    () => MODULES.filter((module) => can(module.permission)),
    [can]
  );

  const resetFeedback = () => {
    setFeedback(null);
    setError("");
  };

  const togglePermission = (permission) => {
    setProfileForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  const editProfile = (profile) => {
    resetFeedback();
    setProfileForm({
      id: profile.id,
      name: profile.name || "",
      description: profile.description || "",
      permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
    });
    setActiveTab("access");
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    resetFeedback();
    setSaving(true);
    try {
      const payload = {
        name: profileForm.name.trim(),
        description: profileForm.description.trim() || null,
        permissions: profileForm.permissions,
      };
      if (profileForm.id) {
        await adminCenterService.updateProfile(profileForm.id, payload);
        setFeedback({ type: "success", message: "Perfil atualizado com sucesso." });
      } else {
        await adminCenterService.createProfile(payload);
        setFeedback({ type: "success", message: "Perfil criado com sucesso." });
      }
      setProfileForm(emptyProfile);
      await loadRootAccessData();
    } catch (requestError) {
      setError(requestError?.message || "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (profile) => {
    if (!window.confirm(`Excluir o perfil “${profile.name}”?`)) return;
    resetFeedback();
    setSaving(true);
    try {
      await adminCenterService.deleteProfile(profile.id);
      if (profileForm.id === profile.id) setProfileForm(emptyProfile);
      setFeedback({ type: "success", message: "Perfil excluído." });
      await loadRootAccessData();
    } catch (requestError) {
      setError(requestError?.message || "Não foi possível excluir o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const assignAdmin = async (event) => {
    event.preventDefault();
    resetFeedback();
    setSaving(true);
    try {
      await adminCenterService.assign({
        email: assignmentForm.email.trim(),
        profile_id: Number(assignmentForm.profile_id),
      });
      setAssignmentForm(emptyAssignment);
      setFeedback({ type: "success", message: "Privilégios administrativos concedidos." });
      await loadRootAccessData();
    } catch (requestError) {
      setError(requestError?.message || "Não foi possível conceder o acesso.");
    } finally {
      setSaving(false);
    }
  };

  const revokeAdmin = async (assignment) => {
    if (!window.confirm(`Revogar o acesso administrativo de ${assignment?.user?.email || "este usuário"}?`)) return;
    resetFeedback();
    setSaving(true);
    try {
      await adminCenterService.revoke(assignment.id);
      setFeedback({ type: "success", message: "Acesso administrativo revogado." });
      await loadRootAccessData();
    } catch (requestError) {
      setError(requestError?.message || "Não foi possível revogar o acesso.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ProcessingIndicatorComponent label="Abrindo Admin Cutinapp" />;
  }

  if (!context?.authorized) {
    return (
      <div className="cut-admin-center">
        <NavlogComponent />
        <main className="cut-admin-center__main">
          <section className="cut-admin-center__denied">
            <i className="fa-solid fa-lock" />
            <span className="cut-eyebrow">Admin Cutinapp</span>
            <h1>Acesso administrativo restrito</h1>
            <p>Este painel é exclusivo do Super Administrador e dos usuários que receberam um perfil administrativo por ele.</p>
            <Link to="/feed">Voltar para a Cutinapp</Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="cut-admin-center">
      <NavlogComponent />
      <main className="cut-admin-center__main">
        <section className="cut-admin-center__hero">
          <div>
            <span className="cut-eyebrow">Admin Cutinapp</span>
            <h1>Centro de controle da Cutinapp</h1>
            <p>Operação, segurança e administração focadas exclusivamente nesta aplicação.</p>
          </div>
          <div className="cut-admin-center__identity">
            <span>{context.is_root ? "Super Administrador" : "Perfil administrativo"}</span>
            <strong>{context.profile?.name || "Administrador"}</strong>
            <small>{context.is_root ? context.root_email : `${context.permissions?.length || 0} privilégios ativos`}</small>
          </div>
        </section>

        {(error || feedback) && (
          <div className={`cut-admin-center__notice ${error ? "is-error" : "is-success"}`}>
            <i className={`fa-solid ${error ? "fa-circle-exclamation" : "fa-circle-check"}`} />
            <span>{error || feedback?.message}</span>
          </div>
        )}

        <nav className="cut-admin-center__tabs" aria-label="Seções administrativas">
          <button type="button" className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Visão geral</button>
          {context.is_root && <button type="button" className={activeTab === "access" ? "active" : ""} onClick={() => setActiveTab("access")}>Equipe e perfis</button>}
          {can("audit.view") && <button type="button" className={activeTab === "audit" ? "active" : ""} onClick={() => setActiveTab("audit")}>Auditoria</button>}
        </nav>

        {activeTab === "overview" && (
          <>
            {can("dashboard.view") && (
              <section className="cut-admin-center__stats">
                <article><span>Usuários no app</span><strong>{number(overview?.users)}</strong><small>Vínculos ativos</small></article>
                <article><span>Estabelecimentos</span><strong>{number(overview?.establishments)}</strong><small>Escopo Cutinapp</small></article>
                <article><span>Eventos</span><strong>{number(overview?.events)}</strong><small>Escopo Cutinapp</small></article>
                <article><span>Pedidos</span><strong>{number(overview?.orders)}</strong><small>Escopo Cutinapp</small></article>
                <article><span>Admins delegados</span><strong>{number(overview?.active_admins)}</strong><small>Sem contar o root</small></article>
                <article><span>Perfis</span><strong>{number(overview?.admin_profiles)}</strong><small>Perfis administrativos</small></article>
              </section>
            )}

            <section className="cut-admin-center__section">
              <div className="cut-admin-center__section-head">
                <div><span className="cut-eyebrow">Privilégios ativos</span><h2>Áreas administrativas habilitadas</h2></div>
              </div>
              <div className="cut-admin-center__modules">
                {enabledModules.length === 0 ? (
                  <div className="cut-admin-center__empty">Seu perfil não possui módulos operacionais habilitados.</div>
                ) : enabledModules.map((module) => (
                  <article key={module.permission}>
                    <i className={module.icon} />
                    <div><h3>{module.title}</h3><p>{module.description}</p></div>
                    <span>Habilitado</span>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "access" && context.is_root && (
          <section className="cut-admin-center__access-grid">
            <div className="cut-admin-center__panel">
              <div className="cut-admin-center__section-head">
                <div><span className="cut-eyebrow">Perfis</span><h2>{profileForm.id ? "Editar perfil" : "Novo perfil administrativo"}</h2></div>
                {profileForm.id && <button type="button" className="cut-admin-center__ghost" onClick={() => setProfileForm(emptyProfile)}>Cancelar edição</button>}
              </div>
              <form onSubmit={saveProfile} className="cut-admin-center__form">
                <label>Nome do perfil<input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} required maxLength={120} placeholder="Ex.: Operação de eventos" /></label>
                <label>Descrição<textarea value={profileForm.description} onChange={(event) => setProfileForm((current) => ({ ...current, description: event.target.value }))} maxLength={1000} rows={3} placeholder="Explique a responsabilidade desse perfil." /></label>
                <fieldset>
                  <legend>Privilégios</legend>
                  <div className="cut-admin-center__permission-grid">
                    {catalog.map((permission) => (
                      <label key={permission} className={profileForm.permissions.includes(permission) ? "is-selected" : ""}>
                        <input type="checkbox" checked={profileForm.permissions.includes(permission)} onChange={() => togglePermission(permission)} />
                        <span>{PERMISSION_LABELS[permission] || permission}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <button type="submit" className="cut-admin-center__primary" disabled={saving || !profileForm.name.trim()}>{saving ? "Salvando…" : profileForm.id ? "Salvar alterações" : "Criar perfil"}</button>
              </form>
            </div>

            <div className="cut-admin-center__panel">
              <div className="cut-admin-center__section-head"><div><span className="cut-eyebrow">Equipe</span><h2>Conceder acesso</h2></div></div>
              <form onSubmit={assignAdmin} className="cut-admin-center__form cut-admin-center__assignment-form">
                <label>E-mail do usuário<input type="email" value={assignmentForm.email} onChange={(event) => setAssignmentForm((current) => ({ ...current, email: event.target.value }))} required placeholder="usuario@exemplo.com" /></label>
                <label>Perfil<select value={assignmentForm.profile_id} onChange={(event) => setAssignmentForm((current) => ({ ...current, profile_id: event.target.value }))} required><option value="">Selecione</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                <button type="submit" className="cut-admin-center__primary" disabled={saving || !assignmentForm.email || !assignmentForm.profile_id}>Conceder privilégios</button>
              </form>
              <p className="cut-admin-center__root-note"><i className="fa-solid fa-key" /> Somente {context.root_email} pode conceder, alterar ou revogar privilégios administrativos.</p>
            </div>

            <div className="cut-admin-center__panel cut-admin-center__panel--wide">
              <div className="cut-admin-center__section-head"><div><span className="cut-eyebrow">Perfis existentes</span><h2>Configuração de privilégios</h2></div></div>
              <div className="cut-admin-center__profile-list">
                {profiles.length === 0 ? <div className="cut-admin-center__empty">Nenhum perfil criado ainda.</div> : profiles.map((profile) => (
                  <article key={profile.id}>
                    <div><strong>{profile.name}</strong><small>{profile.description || "Sem descrição"}</small><span>{profile.permissions?.length || 0} privilégios · {profile.active_assignments_count || 0} usuários ativos</span></div>
                    <div className="cut-admin-center__row-actions"><button type="button" onClick={() => editProfile(profile)}>Editar</button><button type="button" className="is-danger" onClick={() => deleteProfile(profile)} disabled={saving}>Excluir</button></div>
                  </article>
                ))}
              </div>
            </div>

            <div className="cut-admin-center__panel cut-admin-center__panel--wide">
              <div className="cut-admin-center__section-head"><div><span className="cut-eyebrow">Administradores</span><h2>Acessos concedidos</h2></div></div>
              <div className="cut-admin-center__assignment-list">
                {assignments.length === 0 ? <div className="cut-admin-center__empty">Nenhum administrador delegado.</div> : assignments.map((assignment) => {
                  const active = assignment.status === "active" && !assignment.revoked_at;
                  return <article key={assignment.id} className={active ? "" : "is-revoked"}><div><strong>{assignment.user?.first_name || assignment.user?.email || "Usuário"}</strong><small>{assignment.user?.email}</small></div><span>{assignment.profile?.name || "Perfil removido"}</span><time>{active ? "Ativo" : `Revogado em ${dateTime(assignment.revoked_at)}`}</time>{active && <button type="button" className="is-danger" onClick={() => revokeAdmin(assignment)} disabled={saving}>Revogar</button>}</article>;
                })}
              </div>
            </div>
          </section>
        )}

        {activeTab === "audit" && can("audit.view") && (
          <section className="cut-admin-center__panel cut-admin-center__panel--wide">
            <div className="cut-admin-center__section-head"><div><span className="cut-eyebrow">Auditoria</span><h2>Alterações administrativas recentes</h2></div></div>
            <div className="cut-admin-center__audit-list">
              {audit.length === 0 ? <div className="cut-admin-center__empty">Nenhuma alteração administrativa registrada.</div> : audit.map((entry) => (
                <article key={entry.id}>
                  <span className="cut-admin-center__audit-icon"><i className="fa-solid fa-shield" /></span>
                  <div><strong>{String(entry.action || "ação administrativa").replaceAll("_", " ")}</strong><small>{entry.actor?.email || "Sistema"}{entry.target?.email ? ` → ${entry.target.email}` : ""}</small></div>
                  <time>{dateTime(entry.created_at)}</time>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
