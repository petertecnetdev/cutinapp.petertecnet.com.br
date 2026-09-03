import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import "./LoginFormComponent.css";

const waitForGoogle = () =>
  new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.google?.accounts?.id) {
        window.clearInterval(timer);
        resolve(window.google.accounts.id);
      } else if (attempts >= 80) {
        window.clearInterval(timer);
        reject(new Error("O serviço de login do Google não carregou."));
      }
    }, 100);
  });

const safeDestination = (value) => {
  const destination = String(value || "");
  return destination.startsWith("/") && !destination.startsWith("//") ? destination : "/dashboard";
};

export default function LoginFormComponent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginGoogle } = useContext(AuthContext);
  const googleRef = useRef(null);
  const busyRef = useRef(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);

  const destination = safeDestination(location.state?.from);
  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length > 0 && !loading,
    [username, password, loading]
  );

  useEffect(() => {
    let active = true;

    const authenticateWithGoogle = async (credential) => {
      if (!credential || busyRef.current) return;
      busyRef.current = true;
      setLoading(true);
      setError("");
      try {
        await loginGoogle(credential);
        navigate(destination, { replace: true });
      } catch (err) {
        if (active) setError(err?.message || "Não foi possível entrar com o Google.");
      } finally {
        busyRef.current = false;
        if (active) setLoading(false);
      }
    };

    const bootGoogle = async () => {
      try {
        const runtime = await cutinappService.publicConfig().catch(() => ({}));
        const clientId = String(
          process.env.REACT_APP_GOOGLE_CLIENT_ID || runtime?.google_client_id || ""
        ).trim();

        if (!clientId) {
          throw new Error("Login com Google ainda não foi configurado para a Cutinapp.");
        }

        const googleIdentity = await waitForGoogle();
        if (!active || !googleRef.current) return;

        googleIdentity.initialize({
          client_id: clientId,
          callback: ({ credential }) => authenticateWithGoogle(credential),
          cancel_on_tap_outside: false,
        });

        googleRef.current.innerHTML = "";
        googleIdentity.renderButton(googleRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 360,
          locale: "pt-BR",
        });
        setGoogleReady(true);
      } catch (err) {
        if (active) setError(err?.message || "Não foi possível carregar o login com Google.");
      }
    };

    bootGoogle();
    return () => {
      active = false;
    };
  }, [destination, loginGoogle, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || busyRef.current) return;

    busyRef.current = true;
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err?.message || "Não foi possível entrar.");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Form onSubmit={submit} className="cut-login-form" noValidate>
      {error && <div className="cut-login-form__error" role="alert">{error}</div>}

      <div className="cut-login-form__field">
        <label htmlFor="cut-login-user">Usuário ou e-mail</label>
        <div className="cut-login-form__inputWrap">
          <i className="fa-regular fa-envelope" aria-hidden="true" />
          <Form.Control id="cut-login-user" type="text" autoComplete="username" placeholder="Digite seu usuário ou e-mail" value={username} onChange={(event) => setUsername(event.target.value)} disabled={loading} required />
        </div>
      </div>

      <div className="cut-login-form__field">
        <label htmlFor="cut-login-password">Senha</label>
        <div className="cut-login-form__inputWrap cut-login-form__inputWrap--password">
          <i className="fa-solid fa-lock" aria-hidden="true" />
          <Form.Control id="cut-login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} required />
          <button
            type="button"
            className="cut-login-form__passwordToggle"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            disabled={loading}
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      <Button type="submit" className="cut-login-form__submit" disabled={!canSubmit}>
        {loading ? <><span className="cut-login-form__spinner" /> Entrando...</> : "Entrar"}
      </Button>

      <div className="cut-login-form__divider"><span>ou continue com</span></div>
      <div className="cut-login-form__google">
        <div ref={googleRef} className="cut-google-render" />
        {!googleReady && <div className="cut-google-skeleton">Carregando Google...</div>}
      </div>

      <div className="cut-login-form__links">
        <Link to="/register">Criar conta</Link><span>•</span><Link to="/password-email">Esqueci minha senha</Link>
      </div>
    </Form>
  );
}
