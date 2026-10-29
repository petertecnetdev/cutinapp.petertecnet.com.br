import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import independenceClaimService from "../../services/IndependenceClaimService";
import { isUnverifiedListing, safeListingSourceUrl } from "../../utils/independenceListing";
import { canonicalAppId } from "../../utils/independenceAppId";
import "./unverified-listing.css";

// Showing a public transparency notice and accepting a claim are separate decisions.
// Incomplete curated records still need the notice even without ownership_status;
// verified/rejected or ambiguous ownership must not silently open a claim form.
const claimable = (entity) => {
  const ownership = String(entity?.ownership_status || "").trim().toLowerCase();
  const review = String(entity?.verification_status || "").trim().toLowerCase();
  const source = String(entity?.listing_source || "").trim().toLowerCase();
  // A negative or completed verification decision takes precedence over an
  // older unclaimed ownership flag. It must never reopen the claim form.
  if (["verified", "manual_approved", "legacy_owner_record", "rejected"].includes(review)) return false;
  if (ownership) return ["unclaimed", "pending_claim"].includes(ownership);
  return ["unclaimed", "pending_claim"].includes(review)
    || ["curated", "curatorial", "institutional"].includes(source)
    || entity?.is_institutional_listing === true;
};
const personName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || String(user?.name || "");

// A missing app identifier cannot distinguish two listings with the same entity
// ID. This reference token is only a React remount guard, NOT tenant identity.
// The backend must still derive and authorize the application on every POST.
const anonymousEntityTokens = new WeakMap();
let nextAnonymousEntityToken = 0;
const anonymousEntityToken = (entity) => {
  if (!entity || typeof entity !== "object") return "no-entity";
  if (!anonymousEntityTokens.has(entity)) {
    nextAnonymousEntityToken += 1;
    anonymousEntityTokens.set(entity, nextAnonymousEntityToken);
  }
  return anonymousEntityTokens.get(entity);
};
const hasUnambiguousAppHint = (entity) => {
  const app = canonicalAppId(entity?.app_id);
  const application = canonicalAppId(entity?.application_id);
  // Conflicting or malformed hints are not evidence of tenant identity.
  if (entity?.app_id != null && !app) return false;
  if (entity?.application_id != null && !application) return false;
  return Boolean((app || application) && (!app || !application || app === application));
};

// Remount the private claim form whenever its security context changes. A pending
// response from a previous user, listing or application must never be rendered
// in the next context, even when the same panel instance is reused by a page.
export default function UnverifiedListingPanel({ entity, entityType, user, onLogin }) {
  const hasAppHint = hasUnambiguousAppHint(entity);
  // A valid application hint is only a UI prerequisite, never proof of
  // authorization. Missing, malformed or conflicting app IDs block every POST,
  // including the first render; the API derives and authorizes the real scope.
  const canSubmitClaim = hasAppHint;
  const contextKey = JSON.stringify([
    entityType, entity?.id ?? null, entity?.app_id ?? null, entity?.application_id ?? null,
    // Even identical data in distinct unscoped records must remount the form.
    hasAppHint ? null : anonymousEntityToken(entity),
    entity?.ownership_status ?? null, entity?.verification_status ?? null,
    entity?.listing_source ?? null, entity?.is_institutional_listing ?? null,
    entity?.ownership_verified_at ?? null, user?.id ?? null, user?.email ?? null,
    user?.first_name ?? null, user?.last_name ?? null, user?.name ?? null,
  ]);
  return (
    <UnverifiedListingPanelContent
      key={contextKey}
      entity={entity}
      entityType={entityType}
      user={user}
      onLogin={onLogin}
      canSubmitClaim={canSubmitClaim}
    />
  );
}

function UnverifiedListingPanelContent({ entity, entityType, user, onLogin, canSubmitClaim }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(() => personName(user));
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;
    };
  }, []);

  // Transparency is independent from claim eligibility: rejected, suspended
  // or contradictory ownership still needs a public warning. Only the claim
  // controls below are suppressed by claimable(entity).
  if (!isUnverifiedListing(entity) || !["event", "production", "artist"].includes(entityType)) return null;
  // Preserve the legacy verified-profile presentation when the API explicitly
  // marks both fields verified and no curatorial origin is present. A curated
  // record, even with contradictory "verified" ownership, keeps its warning.
  const ownership = String(entity?.ownership_status || "").trim().toLowerCase();
  const verification = String(entity?.verification_status || "").trim().toLowerCase();
  const source = String(entity?.listing_source || "").trim().toLowerCase();
  if (ownership === "verified" && verification === "verified"
    && !["curated", "curatorial", "institutional"].includes(source)
    && entity?.is_institutional_listing !== true) return null;
  const canRequestClaim = claimable(entity);

  const sourceUrl = safeListingSourceUrl(entity?.source_url);
  const timestamp = entity?.last_verified_at ? new Date(entity.last_verified_at) : null;
  const checkedAt = timestamp && !Number.isNaN(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp) : null;

  const submit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || !canSubmitClaim || !consent || !name.trim() || !user?.id || !user?.email) return;
    submittingRef.current = true;
    const requestVersion = ++requestVersionRef.current;
    setError("");
    setResult("");
    setBusy(true);
    try {
      const response = await independenceClaimService.submit({
        entityType, entityId: entity.id,
        applicationId: canonicalAppId(entity?.app_id ?? entity?.application_id),
        userId: user?.id, name, email: user?.email, phone, message, consent,
      });
      if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
      setResult(response?.message || "Solicitação registrada para revisão.");
      setExpanded(false);
      setConsent(false);
      setPhone("");
      setMessage("");
    } catch (err) {
      if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
      // Never echo server error bodies: they may contain another tenant's PII.
      // A revoked/forbidden session must also discard the private form state.
      const status = Number(err?.response?.status);
      if (status === 401 || status === 403) {
        setExpanded(false);
        setName("");
        setPhone("");
        setMessage("");
        setConsent(false);
        setError(status === 401
          ? "Sua sessão expirou. Entre novamente para solicitar a análise."
          : "Você não tem autorização para enviar esta solicitação.");
      } else {
        setError("Não foi possível enviar a solicitação. Confira seus dados e tente novamente.");
      }
    } finally {
      if (mountedRef.current && requestVersion === requestVersionRef.current) {
        submittingRef.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <aside className="cut-unverified" aria-label="Informações sobre a titularidade deste cadastro">
      <div className="cut-unverified__heading">
        <span className="cut-unverified__icon" aria-hidden="true">i</span>
        <div>
          <strong>Informações públicas — responsável não verificado</strong>
          <p>Esta ficha foi criada pela curadoria da plataforma com base em informações públicas. Não representa confirmação ou endosso do organizador ou artista.</p>
        </div>
      </div>
      <dl className="cut-unverified__source">
        <div><dt>Fonte</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Consultar publicação original</a> : "Referência não disponível"}</dd></div>
        <div><dt>Última conferência</dt><dd>{checkedAt || "Não informada"}</dd></div>
      </dl>
      <p className="cut-unverified__disclaimer">Encontrou informações incorretas? Use a Central de Ajuda para solicitar a revisão desta ficha.</p>
      {result && <p className="cut-unverified__result" role="status">{result}</p>}
      {error && <p className="cut-unverified__error" role="alert">{error}</p>}
      {canRequestClaim && !result && (
        <>
          {!user
            ? <button className="cut-unverified__action" type="button" onClick={onLogin}>Reivindicar esta página — criar conta</button>
            : <button className="cut-unverified__action" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>Reivindicar esta página</button>}
          {expanded && user && (
            <form className="cut-unverified__form" onSubmit={submit}>
              <p>Solicite a análise de titularidade. A equipe verificará a identidade antes de liberar qualquer acesso; enviar esta solicitação não transfere o cadastro.</p>
              <label>Nome completo
                <input value={name} required minLength={2} maxLength={160} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <label>E-mail da conta
                <input type="email" value={String(user?.email || "")} readOnly aria-readonly="true" />
              </label>
              <label>Telefone (opcional)
                <input type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </label>
              <label>Informações para comprovar seu vínculo (opcional)
                <textarea rows={3} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <label className="cut-unverified__consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                Autorizo a Cutinapp a utilizar os dados informados para avaliar e responder a esta solicitação.
              </label>
              {!canSubmitClaim && (
                <p role="note">Não foi possível confirmar a aplicação desta ficha. Solicite a correção na Central de Ajuda antes de enviar uma reivindicação.</p>
              )}
              <button className="cut-unverified__submit" disabled={busy || !canSubmitClaim || !consent || !name.trim()} type="submit">
                {busy ? "Enviando..." : "Enviar solicitação de acesso"}
              </button>
            </form>
          )}
        </>
      )}
    </aside>
  );
}

UnverifiedListingPanel.propTypes = {
  entity: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    app_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    application_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    ownership_status: PropTypes.string,
    ownership_verified_at: PropTypes.string,
    verification_status: PropTypes.string,
    listing_source: PropTypes.string,
    is_institutional_listing: PropTypes.bool,
    source_url: PropTypes.string,
    last_verified_at: PropTypes.string,
  }),
  entityType: PropTypes.oneOf(["event", "production", "artist"]).isRequired,
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
  }),
  onLogin: PropTypes.func,
};

UnverifiedListingPanelContent.propTypes = {
  ...UnverifiedListingPanel.propTypes,
  canSubmitClaim: PropTypes.bool.isRequired,
};
