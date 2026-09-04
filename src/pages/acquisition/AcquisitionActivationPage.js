import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import acquisitionService from "../../services/AcquisitionService";
import "./AcquisitionActivationPage.css";

const errorMessage = (error) => error?.response?.data?.message || error?.response?.data?.error || "Não foi possível validar este convite.";

export default function AcquisitionActivationPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => String(params.get("ref") || "").trim(), [params]);
  const [loading, setLoading] = useState(true);
  const [referral, setReferral] = useState(null);
  const [application, setApplication] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setFeedback({ type: "error", text: "O link de ativação está incompleto." });
      setLoading(false);
      return () => { active = false; };
    }
    acquisitionService.publicReferral(token)
      .then((data) => {
        if (!active) return;
        setReferral(data.referral);
        setApplication(data.application);
      })
      .catch((error) => active && setFeedback({ type: "error", text: errorMessage(error) }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setFeedback(null);
    if (referral?.requires_password && password !== confirmation) {
      setFeedback({ type: "error", text: "A confirmação da senha não confere." });
      return;
    }
    setSaving(true);
    try {
      const result = await acquisitionService.activate({
        token,
        activation_code: code.trim().toUpperCase(),
        password: password || null,
        password_confirmation: confirmation || null,
      });
      setDone(true);
      setFeedback({ type: "success", text: result.message });
    } catch (error) {
      const validation = error?.response?.data?.errors;
      const firstValidation = validation ? Object.values(validation).flat()[0] : null;
      setFeedback({ type: "error", text: firstValidation || errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ProcessingIndicatorComponent label="Validando convite" />;

  return (
    <div className="acq-activate-page">
      <NavlogComponent />
      <main className="acq-activate-shell">
        <section className="acq-activate-card">
          <div className="acq-activate-brand"><img src="/images/logo.png" alt="Cutinapp" /><span>{application?.name || "Cutinapp"}</span></div>
          {!done && <>
            <span className="acq-activate-kicker">Convite de produção</span>
            <h1>Confirme seu acesso</h1>
            {referral && <p>Olá, <strong>{referral.name || referral.email}</strong>. Sua produção <strong>{referral.production?.name}</strong> e os eventos abaixo já foram preparados.</p>}

            {referral?.events?.length > 0 && <div className="acq-activate-events">{referral.events.map((eventItem) => <article key={eventItem.id}><i className="fa-regular fa-calendar-days" /><div><strong>{eventItem.title}</strong><small>{eventItem.start_date ? new Date(eventItem.start_date).toLocaleString("pt-BR") : "Data a confirmar"}</small></div></article>)}</div>}

            {feedback && <div className={`acq-activate-feedback acq-activate-feedback--${feedback.type}`}>{feedback.text}</div>}

            {referral && <form onSubmit={submit}>
              <label><span>Código recebido por e-mail</span><input required autoComplete="one-time-code" maxLength={16} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" /></label>
              {referral.requires_password && <div className="acq-activate-grid"><label><span>Crie sua senha</span><input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><label><span>Confirme a senha</span><input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label></div>}
              {!referral.requires_password && <p className="acq-activate-note">Sua conta Peter Tecnet já existe. Este código confirma o vínculo com a produção sem alterar sua senha atual.</p>}
              <button type="submit" disabled={saving}>{saving ? "Ativando..." : "Confirmar e ativar acesso"}</button>
            </form>}
          </>}

          {done && <div className="acq-activate-success"><i className="fa-solid fa-circle-check" /><h1>Acesso ativado</h1><p>{feedback?.text}</p><Link to="/login">Entrar na Cutinapp</Link></div>}
        </section>
      </main>
    </div>
  );
}
