import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import authService from "../../services/AuthService";
import CutinLayout from "../../components/CutinLayout";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import "../CutinPages.css";
import "./Auth.css";

const BRAND_LOGO = "/images/logo.png?v=20260830-1631";

export default function EmailVerifyPage() {
  const [verificationCode, setVerificationCode] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [redirect, setRedirect] = useState(false);

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    setFeedback(null); setLoading(true);
    try {
      const emailVerified = await authService.emailVerify(verificationCode.trim());
      if (emailVerified) { setFeedback({ type: "success", message: "E-mail verificado com sucesso." }); setRedirect(true); }
      else setFeedback({ type: "error", message: "Código inválido. Confira o código e tente novamente." });
    } catch (error) { console.error(error); setFeedback({ type: "error", message: "Não foi possível verificar o e-mail. Tente novamente." }); }
    finally { setLoading(false); }
  };

  const handleResendVerificationCode = async () => {
    setFeedback(null); setLoading(true);
    try {
      const codeResent = await authService.resendCodeEmailVerification();
      setFeedback(codeResent ? { type: "success", message: "Novo código enviado para seu e-mail." } : { type: "error", message: "Não foi possível reenviar o código." });
    } catch (error) { console.error(error); setFeedback({ type: "error", message: "Não foi possível reenviar o código. Tente novamente." }); }
    finally { setLoading(false); }
  };

  if (redirect) return <Navigate to="/produtor" replace />;

  return (
    <CutinLayout>
      {loading && <ProcessingIndicatorComponent messages={["Validando código...", "Confirmando seu e-mail..."]} />}
      <section className="cutin-auth-page">
        <div className="cutin-auth-page__intro"><span className="eyebrow">Segurança da sua conta</span><h1>Confirme seu e-mail.</h1><p>Digite o código enviado para seu endereço de e-mail. Essa validação protege sua conta e libera o acesso completo à Cutinapp.</p></div>
        <div className="cutin-auth-card">
          <div className="cutin-auth-card__mark"><img src={BRAND_LOGO} alt="Cutinapp" /></div>
          <h2>Verificar e-mail</h2><p className="cutin-auth-card__subtitle">Informe o código de verificação recebido.</p>
          <form onSubmit={handleVerifyEmail}>
            <label className="cutin-field"><span>Código de verificação</span><input className="cutin-code-input" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} required /></label>
            {feedback && <div className={feedback.type === "success" ? "success-box" : "error-box"} role="alert">{feedback.message}</div>}
            <div className="cutin-auth-card__actions"><button className="primary" type="submit" disabled={loading || !verificationCode.trim()}>Verificar e-mail</button><button className="secondary" type="button" onClick={handleResendVerificationCode} disabled={loading}>Reenviar código</button></div>
          </form>
        </div>
      </section>
    </CutinLayout>
  );
}
