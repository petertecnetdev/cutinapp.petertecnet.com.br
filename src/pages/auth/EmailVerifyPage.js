import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import authService from "../../services/AuthService";
import { safeGetSessionItem, safeRemoveSessionItem, safeSetSessionItem } from "../../utils/safeStorage";

const RESEND_COOLDOWN_KEY = "cutinapp_email_verification_resend_available_at";
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

const initialResendCooldown = () => {
  const availableAt = Number(safeGetSessionItem(RESEND_COOLDOWN_KEY) || 0);
  if (!availableAt) return 0;
  return Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
};

const retryAfterSeconds = (error) => {
  const raw = Number(error?.retryAfter || error?.data?.retry_after || DEFAULT_RESEND_COOLDOWN_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RESEND_COOLDOWN_SECONDS;
  return Math.max(1, Math.ceil(raw));
};

export default function EmailVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser, logout } = useContext(AuthContext);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [verificationState, setVerificationState] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(initialResendCooldown);
  const resendInFlightRef = useRef(false);
  const normalized = useMemo(() => code.trim(), [code]);
  const returnTo = location.state?.from || "/dashboard";
  const resendCooldownActive = resendCooldown > 0;

  const startResendCooldown = (seconds = DEFAULT_RESEND_COOLDOWN_SECONDS) => {
    const normalizedSeconds = Math.max(1, Math.ceil(Number(seconds) || DEFAULT_RESEND_COOLDOWN_SECONDS));
    safeSetSessionItem(RESEND_COOLDOWN_KEY, Date.now() + (normalizedSeconds * 1000));
    setResendCooldown(normalizedSeconds);
  };

  useEffect(() => {
    if (!resendCooldownActive) {
      safeRemoveSessionItem(RESEND_COOLDOWN_KEY);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setResendCooldown((current) => {
        const next = Math.max(0, current - 1);
        if (next === 0) safeRemoveSessionItem(RESEND_COOLDOWN_KEY);
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldownActive]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await authService.emailVerificationState();
        if (active) {
          setVerificationState(response?.email_verification || null);
          setMessage((current) => current?.type === "error" ? null : current);
        }
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
    if (loading || resendCooldown > 0 || resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      const response = await authService.resendCodeEmailVerification();
      setCode("");
      startResendCooldown(DEFAULT_RESEND_COOLDOWN_SECONDS);
      setMessage({
        type: "success",
        text: response?.message || "Novo código enviado. Use somente o mais recente. Você poderá solicitar outro em 60 segundos.",
      });
    } catch (err) {
      if (err?.status === 429) {
        const seconds = retryAfterSeconds(err);
        startResendCooldown(seconds);
        setMessage({
          type: "error",
          text: `Aguarde ${seconds} segundos antes de solicitar outro código. O código mais recente continua válido por 30 minutos.`,
        });
      } else {
        setMessage({ type: "error", text: err?.message || "Não foi possível reenviar o código." });
      }
    } finally {
      resendInFlightRef.current = false;
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
      setMessage(null);
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
    } catch {
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
        <Button type="button" variant="outline-light" onClick={resend} disabled={loading || resendCooldown > 0}>
          {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Reenviar código"}
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
