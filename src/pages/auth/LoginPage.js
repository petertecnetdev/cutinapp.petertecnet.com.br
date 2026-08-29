import React, { useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link, useLocation } from "react-router-dom";
import authService from "../../services/AuthService";
import CutinLayout from "../../components/CutinLayout";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import "../CutinPages.css";
import "./LoginPage.css";

const safeNextPath = (search) => {
  const candidate = new URLSearchParams(search).get("next");
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/produtor";
  return candidate;
};

export default function LoginPage() {
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const googleClientId = String(process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();
  const nextPath = useMemo(() => safeNextPath(location.search), [location.search]);
  const canSubmit = username.trim().length > 0 && password.length > 0;

  const finishLogin = () => {
    window.location.replace(nextPath);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setError("");
    setLoading(true);
    try {
      await authService.login(username.trim(), password);
      finishLogin();
    } catch (err) {
      setError(err?.message || "Não foi possível entrar.");
      setLoading(false);
    }
  };

  const googleSuccess = async (credentialResponse) => {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await authService.loginGoogle(credentialResponse?.credential);
      finishLogin();
    } catch (err) {
      setError(err?.message || "Não foi possível entrar com o Google.");
      setLoading(false);
    }
  };

  return (
    <CutinLayout>
      {loading && <ProcessingIndicatorComponent messages={["Entrando na Cutinapp...", "Preparando sua conta..."]} />}
      <section className="cutin-auth-wrap cutin-login-page">
        <div className="auth-copy">
          <span className="eyebrow">Uma conta. Todo o ecossistema Peter Tecnet.</span>
          <h1>Entre na Cutinapp.</h1>
          <p>Descubra eventos, acesse seus ingressos e gerencie produções, equipes e vendas com a mesma identidade de acesso das plataformas Peter Tecnet.</p>
          <div className="login-trust"><span>✓ Login centralizado</span><span>✓ Conta Peter Tecnet</span><span>✓ Acesso protegido</span></div>
        </div>

        <div className="panel auth-card cutin-login-card">
          <div className="cutin-auth-logo" aria-hidden="true">C</div>
          <span className="auth-kicker">CUTINAPP</span>
          <h2>Bem-vindo</h2>
          <p className="muted">Entre com sua conta Peter Tecnet.</p>

          <form onSubmit={submit} noValidate>
            <label className="cutin-field">
              <span>Usuário ou e-mail</span>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="seu@email.com" disabled={loading} required />
            </label>
            <label className="cutin-field">
              <span>Senha</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Sua senha" disabled={loading} required />
            </label>
            {error && <div className="error-box" role="alert">{error}</div>}
            <button type="submit" className="primary auth-submit" disabled={!canSubmit || loading}>Entrar</button>
          </form>

          <div className="auth-divider"><span>ou continue com</span></div>
          <div className="google-login-slot">
            {googleClientId ? (
              <GoogleLogin onSuccess={googleSuccess} onError={() => setError("O Google não conseguiu concluir o login. Tente novamente.")} width="320" theme="outline" size="large" text="continue_with" shape="rectangular" locale="pt-BR" />
            ) : (
              <div className="google-unavailable">Login Google aguardando configuração do Client ID.</div>
            )}
          </div>

          <div className="auth-links">
            <Link to="/password-email">Esqueci minha senha</Link>
            <span>Não tem conta? <Link to="/register">Criar conta</Link></span>
          </div>
        </div>
      </section>
    </CutinLayout>
  );
}
