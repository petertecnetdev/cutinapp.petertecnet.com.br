import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import independenceClaimService from "../../services/IndependenceClaimService";
import { safeListingSourceUrl } from "../../utils/independenceListing";
import "./unverified-listing.css";

const claimable = (entity) => ["unclaimed", "pending_claim"].includes(String(entity?.ownership_status || "").toLowerCase());
const personName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || String(user?.name || "");

export default function UnverifiedListingPanel({ entity, entityType, user, onLogin }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setName(personName(user)); }, [user?.id, user?.first_name, user?.last_name, user?.name]);

  if (!claimable(entity) || !["event", "production", "artist"].includes(entityType)) return null;

  const sourceUrl = safeListingSourceUrl(entity?.source_url);
  const timestamp = entity?.last_verified_at ? new Date(entity.last_verified_at) : null;
  const checkedAt = timestamp && !Number.isNaN(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp) : null;

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !consent) return;
    setError("");
    setResult("");
    setBusy(true);
    try {
      const response = await independenceClaimService.submit({
        entityType, entityId: entity.id, name, email: user?.email, phone, message, consent,
      });
      setResult(response?.message || "Solicitação registrada para revisão.");
      setExpanded(false);
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível enviar a solicitação. Confira seus dados e tente novamente.");
    } finally {
      setBusy(false);
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
      {!result && (
        <>
          {!user
            ? <button className="cut-unverified__action" type="button" onClick={onLogin}>Sou responsável por este cadastro — entrar</button>
            : <button className="cut-unverified__action" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>Sou responsável por este cadastro</button>}
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
              <button className="cut-unverified__submit" disabled={busy || !consent || !name.trim()} type="submit">
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
    ownership_status: PropTypes.string,
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
