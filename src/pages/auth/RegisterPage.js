import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import authService from "../../services/AuthService";
import { trackTelemetry } from "../../utils/telemetry";

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginGoogle } = useContext(AuthContext);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const googleButtonRef = useRef(null);
  const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  const passwordOk = useMemo(
    () => password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password),
    [password]
  );
  const canSubmit = firstName.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && passwordOk && !loading && !googleLoading;
  const queryReturnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const target = String(params.get("from") || "");
    return target.startsWith("/") && !target.startsWith("//") ? target : "";
  }, [location.search]);
  const returnTo = location.state?.from || queryReturnTo || "/dashboard";
  const acquisitionSource = useMemo(() => {
    const source = String(location.state?.acquisitionSource || "").trim();
    return /^[a-z0-9_-]{1,80}$/i.test(source) ? source : "";
  }, [location.state]);
  const continuationState = useMemo(() => ({
    ...(location.state?.artistClaim ? { artistClaim: location.state.artistClaim } : {}),
    ...(acquisitionSource ? { acquisitionSource } : {}),
  }), [acquisitionSource, location.state]);

  useEffect(() => {
    if (!acquisitionSource) return;
    trackTelemetry("producer_signup_viewed", {
      target: returnTo,
      metadata: { acquisition_source: acquisitionSource },
    });
  }, [acquisitionSource, returnTo]);

  const contextMessage = useMemo(() => {
    if (returnTo.startsWith("/event/create")) return "Depois de confirmar seu e-mail, você continua direto para criar seu primeiro evento. Se ainda não tiver produção, pode criar o nome dela ali mesmo e seguir para o primeiro lote.";
    if (returnTo.startsWith("/production/create")) return "Depois de confirmar seu e-mail, você continua direto para o cadastro da sua produção.";
    if (returnTo.startsWith("/artist/invitations/")) return "Depois de confirmar seu e-mail, você volta direto para o convite artístico e decide se aceita ou recusa a participação.";
    if (returnTo.startsWith("/artist/manage")) return "Depois de confirmar seu e-mail, você continua direto para criar sua presença como artista.";
    if (returnTo.startsWith("/feed")) return "Depois de confirmar seu e-mail, você entra direto na rede da Cutinapp.";
    if (returnTo.startsWith("/event")) return "Depois de confirmar seu e-mail, você volta para o evento que estava explorando.";
    return "Crie sua conta e continue sua experiência dentro da Cutinapp.";
  }, [returnTo]);

  const finishGoogleSignup = useCallback((response) => {
    if (!response?.success) {
      setError(response?.message || "Não foi possível criar sua conta com Google.");
      return;
    }
    if (acquisitionSource) {
      trackTelemetry("producer_signup_completed", {
        target: returnTo,
        metadata: { acquisition_source: acquisitionSource, signup_method: "google" },
      });
    }
    navigate(returnTo, {
      replace: true,
      state: Object.keys(continuationState).length ? continuationState : undefined,
    });
  }, [acquisitionSource, continuationState, navigate, returnTo]);

  const waitForGoogle = useCallback(async () => {
    if (window.google?.accounts?.id) return window.google;

    const existing = document.querySelector('script[data-google-identity="true"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      document.head.appendChild(script);
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.google?.accounts?.id) return window.google;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }

    throw new Error("Não foi possível carregar o cadastro com Google.");
  }, []);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return undefined;
    let cancelled = false;

    const initializeGoogle = async () => {
      try {
        const google = await waitForGoogle();
        if (cancelled || !googleButtonRef.current) return;

        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            if (!credential) {
              setError("O Google não retornou uma credencial válida.");
              return;
            }

            setGoogleLoading(true);
            setError("");
            try {
              const response = await loginGoogle(credential);
              if (!cancelled) finishGoogleSignup(response);
            } catch (err) {
              if (!cancelled) setError(err?.message || "Não foi possível criar sua conta com Google.");
            } finally {
              if (!cancelled) setGoogleLoading(false);
            }
          },
        });

        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "signup_with",
          width: 600,
          logo_alignment: "left",
        });
      } catch (err) {
        if (!cancelled) setError(err?.message || "Cadastro com Google indisponível no momento.");
      }
    };

    initializeGoogle();
    return () => { cancelled = true; };
  }, [finishGoogleSignup, googleClientId, loginGoogle, waitForGoogle]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await authService.register({ first_name: firstName.trim(), email: normalizedEmail, password });
      await login(normalizedEmail, password);
      if (acquisitionSource) {
        trackTelemetry("producer_signup_completed", {
          target: returnTo,
          metadata: { acquisition_source: acquisitionSource, signup_method: "email" },
        });
      }
      navigate("/email-verify", {
        replace: true,
        state: { from: returnTo, ...continuationState },
      });
    } catch (err) {
      setError(err?.message || "Não foi possível criar sua conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageShell
      title="Crie sua conta grátis"
      subtitle="Use sua conta Google ou comece com nome, e-mail e senha."
    >
      {(loading || googleLoading) && <ProcessingIndicatorComponent label={googleLoading ? "Entrando com Google" : "Criando sua conta"} />}
      <Form onSubmit={submit} className="cut-auth-form">
        {error && <div className="cut-form-message cut-form-message--error">{error}</div>}
        <div className="cut-form-message cut-form-message--success">{contextMessage}</div>
        {location.state?.artistClaim && (
          <div className="cut-form-message cut-form-message--success">
            Depois de confirmar seu e-mail, você voltará ao evento para reivindicar seu vínculo artístico.
          </div>
        )}

        {googleClientId && (
          <>
            <div className="auth-google-block">
              <p>cadastre-se com</p>
              <div className="auth-google-button" ref={googleButtonRef} />
            </div>
            <div className="auth-divider"><span>ou use e-mail</span></div>
          </>
        )}

        <Form.Group>
          <Form.Label>Nome</Form.Label>
          <Form.Control
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Como podemos chamar você?"
            autoComplete="given-name"
            autoFocus={!googleClientId}
          />
        </Form.Group>

        <Form.Group>
          <Form.Label>E-mail</Form.Label>
          <Form.Control
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
          />
        </Form.Group>

        <Form.Group>
          <Form.Label>Senha</Form.Label>
          <Form.Control
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Crie uma senha segura"
            autoComplete="new-password"
          />
          <Form.Text>8+ caracteres com maiúscula, minúscula, número e símbolo.</Form.Text>
        </Form.Group>

        <Button type="submit" className="cut-primary-action" disabled={!canSubmit}>
          Criar conta grátis
        </Button>
        <div className="cut-auth-inline-links">
          <span>Já possui conta?</span>
          <Link to="/login" state={{ from: returnTo, ...(acquisitionSource ? { acquisitionSource } : {}) }}>Entrar</Link>
        </div>
      </Form>
    </AuthPageShell>
  );
}
