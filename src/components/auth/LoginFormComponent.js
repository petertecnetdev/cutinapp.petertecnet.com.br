import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import "./LoginFormComponent.css";

const INSTAGRAM_RETURN_KEY = "cutinapp_instagram_return_to";
const INSTAGRAM_COMPLETION_KEY = "cutinapp_instagram_completion";
const INSTAGRAM_LINK_TOKEN_KEY = "cutinapp_instagram_link_token";

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

const readInstagramCompletion = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(INSTAGRAM_COMPLETION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    window.sessionStorage.removeItem(INSTAGRAM_COMPLETION_KEY);
    return null;
  }
};

export default function LoginFormComponent() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    loginGoogle,
    startInstagram,
    loginInstagram,
    completeInstagram,
    linkInstagram,
  } = useContext(AuthContext);
  const googleRef = useRef(null);
  const busyRef = useRef(false);
  const instagramCallbackHandledRef = useRef(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [instagramCompletion, setInstagramCompletion] = useState(readInstagramCompletion);
  const [completionEmail, setCompletionEmail] = useState("");
  const [completionName, setCompletionName] = useState(
    () => readInstagramCompletion()?.account?.display_name || ""
  );

  const destination = safeDestination(
    location.state?.from ||
      (typeof window !== "undefined" ? window.sessionStorage.getItem(INSTAGRAM_RETURN_KEY) : null)
  );
  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length > 0 && !loading,
    [username, password, loading]
  );
  const canCompleteInstagram = useMemo(
    () => completionEmail.trim().length > 3 && completionEmail.includes("@") && !loading,
    [completionEmail, loading]
  );

  const clearInstagramSession = (keepReturn = false) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(INSTAGRAM_COMPLETION_KEY);
    window.sessionStorage.removeItem(INSTAGRAM_LINK_TOKEN_KEY);
    if (!keepReturn) window.sessionStorage.removeItem(INSTAGRAM_RETURN_KEY);
  };

  const linkPendingInstagram = async () => {
    const completionToken = window.sessionStorage.getItem(INSTAGRAM_LINK_TOKEN_KEY);
    if (!completionToken) return false;
    await linkInstagram(completionToken);
    window.sessionStorage.removeItem(INSTAGRAM_LINK_TOKEN_KEY);
    window.sessionStorage.removeItem(INSTAGRAM_COMPLETION_KEY);
    return true;
  };

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error") || params.get("error_reason");

    if ((!code && !oauthError) || instagramCallbackHandledRef.current) return undefined;
    instagramCallbackHandledRef.current = true;

    const clearCallbackQuery = () => {
      if (typeof window !== "undefined") {
        window.history.replaceState(window.history.state, document.title, "/login");
      }
    };

    (async () => {
      setLoading(true);
      setError("");
      setInfo("");
      try {
        if (oauthError) {
          throw new Error("A autorização do Instagram foi cancelada ou recusada.");
        }
        if (!state) {
          throw new Error("O Instagram não retornou o estado de segurança da autenticação.");
        }

        const result = await loginInstagram(code, state);
        if (!active) return;

        if (result?.requires_completion) {
          const completion = {
            token: result.completion_token,
            account: result.account || {},
          };
          setInstagramCompletion(completion);
          setCompletionName(result.account?.display_name || result.account?.username || "");
          window.sessionStorage.setItem(INSTAGRAM_COMPLETION_KEY, JSON.stringify(completion));
          setInfo("Instagram confirmado. Complete seu cadastro para entrar na Cutinapp.");
          clearCallbackQuery();
          return;
        }

        clearInstagramSession();
        navigate(destination, { replace: true });
      } catch (err) {
        if (active) setError(err?.message || "Não foi possível entrar com o Instagram.");
        clearCallbackQuery();
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [destination, location.search, loginInstagram, navigate]);

  useEffect(() => {
    let active = true;

    const authenticateWithGoogle = async (credential) => {
      if (!credential || busyRef.current) return;
      busyRef.current = true;
      setLoading(true);
      setError("");
      setInfo("");
      try {
        await loginGoogle(credential);
        const linked = await linkPendingInstagram();
        clearInstagramSession();
        if (linked) setInfo("Instagram vinculado à sua conta.");
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
        if (active && !instagramCompletion) {
          setError(err?.message || "Não foi possível carregar o login com Google.");
        }
      }
    };

    bootGoogle();
    return () => {
      active = false;
    };
  }, [destination, instagramCompletion, linkInstagram, loginGoogle, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || busyRef.current) return;

    busyRef.current = true;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await login(username.trim(), password);
      await linkPendingInstagram();
      clearInstagramSession();
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err?.message || "Não foi possível entrar.");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const beginInstagram = async () => {
    if (busyRef.current || loading) return;
    busyRef.current = true;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const result = await startInstagram();
      window.sessionStorage.setItem(INSTAGRAM_RETURN_KEY, destination);
      window.location.assign(result.authorization_url);
    } catch (err) {
      setError(err?.message || "Não foi possível iniciar o login com Instagram.");
      busyRef.current = false;
      setLoading(false);
    }
  };

  const completeInstagramRegistration = async (event) => {
    event.preventDefault();
    if (!instagramCompletion?.token || !canCompleteInstagram || busyRef.current) return;

    busyRef.current = true;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await completeInstagram({
        completionToken: instagramCompletion.token,
        email: completionEmail.trim(),
        firstName: completionName.trim(),
      });
      clearInstagramSession();
      navigate("/email-verify", { replace: true });
    } catch (err) {
      if (err?.status === 409 && err?.code === "instagram_existing_account_requires_auth") {
        window.sessionStorage.setItem(INSTAGRAM_LINK_TOKEN_KEY, instagramCompletion.token);
        window.sessionStorage.removeItem(INSTAGRAM_COMPLETION_KEY);
        setUsername(completionEmail.trim());
        setInstagramCompletion(null);
        setError("");
        setInfo("Esse e-mail já tem uma conta. Entre abaixo com sua senha ou Google para vincular o Instagram com segurança.");
      } else {
        setError(err?.message || "Não foi possível concluir seu cadastro com Instagram.");
      }
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const useExistingAccount = () => {
    if (!instagramCompletion?.token) return;
    window.sessionStorage.setItem(INSTAGRAM_LINK_TOKEN_KEY, instagramCompletion.token);
    window.sessionStorage.removeItem(INSTAGRAM_COMPLETION_KEY);
    setInstagramCompletion(null);
    setError("");
    setInfo("Entre na sua conta Cutinapp para vincular este Instagram.");
  };

  const restartInstagram = () => {
    clearInstagramSession(true);
    setInstagramCompletion(null);
    setCompletionEmail("");
    setCompletionName("");
    beginInstagram();
  };

  if (instagramCompletion) {
    const account = instagramCompletion.account || {};
    const accountLabel = account.username ? `@${account.username}` : "Conta profissional do Instagram";

    return (
      <Form onSubmit={completeInstagramRegistration} className="cut-login-form" noValidate>
        {error && <div className="cut-login-form__error" role="alert">{error}</div>}
        {info && <div className="cut-login-form__info" role="status">{info}</div>}

        <div className="cut-instagram-account">
          {account.avatar_url ? (
            <img src={account.avatar_url} alt="" className="cut-instagram-account__avatar" referrerPolicy="no-referrer" />
          ) : (
            <span className="cut-instagram-account__avatar cut-instagram-account__avatar--fallback">
              <i className="fa-brands fa-instagram" aria-hidden="true" />
            </span>
          )}
          <div>
            <strong>{account.display_name || accountLabel}</strong>
            <span>{accountLabel}</span>
            <small>{account.account_type === "BUSINESS" ? "Conta Business" : "Conta Creator/Business"}</small>
          </div>
          <i className="fa-solid fa-circle-check cut-instagram-account__verified" aria-label="Instagram confirmado" />
        </div>

        <div className="cut-login-form__field">
          <label htmlFor="cut-instagram-name">Seu nome</label>
          <div className="cut-login-form__inputWrap">
            <i className="fa-regular fa-user" aria-hidden="true" />
            <Form.Control
              id="cut-instagram-name"
              type="text"
              autoComplete="name"
              placeholder="Como quer aparecer na Cutinapp"
              value={completionName}
              onChange={(event) => setCompletionName(event.target.value)}
              disabled={loading}
              maxLength={100}
            />
          </div>
        </div>

        <div className="cut-login-form__field">
          <label htmlFor="cut-instagram-email">E-mail para sua conta Cutinapp</label>
          <div className="cut-login-form__inputWrap">
            <i className="fa-regular fa-envelope" aria-hidden="true" />
            <Form.Control
              id="cut-instagram-email"
              type="email"
              autoComplete="email"
              placeholder="voce@email.com"
              value={completionEmail}
              onChange={(event) => setCompletionEmail(event.target.value)}
              disabled={loading}
              required
            />
          </div>
          <small className="cut-login-form__hint">O Instagram não fornece seu e-mail para este login. Vamos confirmar esse endereço antes de liberar todos os recursos.</small>
        </div>

        <Button type="submit" className="cut-login-form__submit" disabled={!canCompleteInstagram}>
          {loading ? <><span className="cut-login-form__spinner" /> Concluindo...</> : "Concluir cadastro"}
        </Button>

        <button type="button" className="cut-login-form__secondaryAction" onClick={useExistingAccount} disabled={loading}>
          Já tenho uma conta Cutinapp
        </button>
        <button type="button" className="cut-login-form__textAction" onClick={restartInstagram} disabled={loading}>
          Usar outro Instagram
        </button>
      </Form>
    );
  }

  return (
    <Form onSubmit={submit} className="cut-login-form" noValidate>
      {error && <div className="cut-login-form__error" role="alert">{error}</div>}
      {info && <div className="cut-login-form__info" role="status">{info}</div>}

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
      <div className="cut-login-form__providers">
        <div className="cut-login-form__google">
          <div ref={googleRef} className="cut-google-render" />
          {!googleReady && <div className="cut-google-skeleton">Carregando Google...</div>}
        </div>
        <button type="button" className="cut-login-form__instagram" onClick={beginInstagram} disabled={loading}>
          <i className="fa-brands fa-instagram" aria-hidden="true" />
          <span>
            <strong>Continuar com Instagram</strong>
            <small>Conta profissional Creator ou Business</small>
          </span>
          <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </button>
      </div>

      <div className="cut-login-form__links">
        <Link to="/register">Criar conta</Link><span>•</span><Link to="/password-email">Esqueci minha senha</Link>
      </div>
    </Form>
  );
}
