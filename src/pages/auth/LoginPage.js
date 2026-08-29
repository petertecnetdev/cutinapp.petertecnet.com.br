import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import authService from "../../services/AuthService";
import CutinLayout from "../../components/CutinLayout";
import "../CutinPages.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authService.login(email, password);
      const user = await authService.me();
      navigate(user?.email_verified_at ? "/produtor" : "/email-verify", { replace: true });
    } catch (err) {
      setError(err?.message || "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  };

  return <CutinLayout><section className="cutin-auth-wrap"><div className="auth-copy"><span className="eyebrow">Sua experiência começa aqui</span><h1>Entre na Cutinapp.</h1><p>Descubra eventos, acesse seus ingressos ou gerencie toda a operação como produtor, promoter ou colaborador.</p></div><div className="panel auth-card"><div className="cutin-auth-logo">C</div><h2>Entrar</h2><p className="muted">Use sua conta Peter Tecnet.</p><form onSubmit={submit}><label className="cutin-field"><span>E-mail</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required /></label><label className="cutin-field"><span>Senha</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required /></label>{error&&<div className="error-box">{error}</div>}<button className="primary auth-submit" disabled={loading}>{loading?"Entrando...":"Entrar"}</button></form><div className="auth-links"><Link to="/password-email">Esqueci minha senha</Link><span>Não tem conta? <Link to="/register">Criar conta</Link></span></div></div></section></CutinLayout>;
}
