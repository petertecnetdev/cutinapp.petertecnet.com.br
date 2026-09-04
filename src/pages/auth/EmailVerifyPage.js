import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import authService from "../../services/AuthService";

export default function EmailVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser, logout } = useContext(AuthContext);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [verificationState, setVerificationState] = useState(null);
  const normalized = useMemo(() => code.trim(), [code]);
  const returnTo = location.state?.from || "/dashboard";

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await authService.emailVerificationState();
        if (active) setVerificationState(response?.email_verification || null);
      } catch (err) {
        if (active) {
          setMessage({
            type: "error",
            text: err?.message || "Não foi possível consultar o limite de adiamentos. Você ainda pode confirmar o e-mail ou sair da conta.",
          });
        }
      } finally {
        if (active) setStateLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const verify = async (event) => {
    event.preventDefault();
    if (!normalized || loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await authService.emailVerify(normalized);
      const user = await refreshUser();
      if (!user?.email_verified_at) throw new Error("A confirmação ainda não apareceu na sessão. Tente novamente.");
      setMessage({ type: "success", text: response?.message || "E-mail verificado com sucesso." });
      navigate(returnTo, { replace: true, state: { artistClaim: location.state?.artistClaim || null } });
    } catch (err) {
      setMessage({ type: "error", text: err?.message || "Código inválido ou expirado." });
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await authService.resendCodeEmailVerification();
      setCode("");
      setMessage({ type: "success", text: response?.message || "Novo código enviado. Use somente o mais recente." });
    } catch (err) {
      setMessage({ type: "error", text: err?.message || "Não foi possível reenviar o código." });
    } finally {
      setLoading(false);
    }
  };

  const deferVerification = async () => {
    if (loading || stateLoading || !verificationState?.can_defer) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await authService.deferEmailVerification();
      setVerificationState(response?.email_verification || verificationState);
      navigate(returnTo, { replace: true, state: { artistClaim: location.state?.artistClaim || null } });
    } catch (err) {
      if (err?.status === 403) {
        setVerificationState((current) => ({
          ...(current || {}),
          can_defer: false,
          confirmation_required: true,
          deferrals_remaining: 0,
        }));
      }
      setMessage({
        type: "error",
        text: err?.message || "Não foi possível adiar a confirmação. Confirme seu e-mail ou saia da conta.",
      });
    } finally {
      setLoading(false);
    }
  };

  const exitAccount = async () => {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    try {
      await logout();
    } catch (err) {
      // O AuthService limpa o token local mesmo quando a API de logout está indisponível.
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const canDefer = verificationState?.can_defer === true;
  const confirmationRequired = verificationState?.confirmation_required === true;
  const remainingDeferrals = verificationState?.deferrals_remaining ?? 0;

  return (
    <AuthPageShell
      title="Confirme seu e-mail"
      subtitle="Digite o código mais recente que enviamos para ativar sua conta."
      compact
    >
      {loading && <ProcessingIndicatorComponent label="Processando" />}
      <Form onSubmit={verify} className="cut-auth-form">
        {message && (
          <div className={`cut-form-message cut-form-message--${message.type === "error" ? "error" : "success"}`}>
            {message.text}
          </div>
        )}

        {location.state?.artistClaim && (
          <div className="cut-form-message cut-form-message--success">
            Após a confirmação você voltará ao evento para concluir a reivindicação do vínculo artístico.
          </div>
        )}

        {confirmationRequired && (
          <Alert variant="warning" className="mb-3">
            Você já usou os adiamentos disponíveis. Nesta 3ª solicitação, para continuar é necessário confirmar o e-mail. Se preferir não confirmar agora, saia da conta.
          </Alert>
        )}

        {!stateLoading && canDefer && (
          <Alert variant="info" className="mb-3">
            Você pode escolher “Confirmar depois” mais {remainingDeferrals} {remainingDeferrals === 1 ? "vez" : "vezes"}. Na 3ª solicitação, a confirmação será obrigatória.
          </Alert>
        )}

        <Form.Group>
          <Form.Label>Código de verificação</Form.Label>
          <Form.Control
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Digite o código recebido"
          />
        </Form.Group>

        <Button type="submit" className="cut-primary-action" disabled={!normalized || loading}>
          Verificar e-mail
        </Button>
        <Button type="button" variant="outline-light" onClick={resend} disabled={loading}>
          Reenviar código
        </Button>

        {!stateLoading && canDefer && (
          <Button type="button" variant="outline-info" onClick={deferVerification} disabled={loading}>
            Confirmar depois
          </Button>
        )}

        <Button type="button" variant="outline-danger" onClick={exitAccount} disabled={loading}>
          Sair da conta
        </Button>
      </Form>
    </AuthPageShell>
  );
}
