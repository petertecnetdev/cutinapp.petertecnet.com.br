import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import authService from "../../services/AuthService";
import CutinLayout from "../../components/CutinLayout";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import "../CutinPages.css";
import "./Auth.css";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirm) return setError("As senhas não conferem.");
    if (form.password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.");
    setLoading(true);
    try {
      await authService.register({ first_name: form.first_name.trim(), email: form.email.trim(), password: form.password });
      navigate("/email-verify", { replace: true });
    } catch (requestError) {
      if (requestError && typeof requestError === "object" && !(requestError instanceof Error)) setError(Object.values(requestError).flat().join(" "));
      else setError(requestError?.message || "Não foi possível criar a conta.");
    } finally { setLoading(false); }
  };

  return (
    <CutinLayout>
      {loading && <ProcessingIndicatorComponent messages={["Criando sua conta...", "Preparando a Cutinapp..."]} />}
      <section className="cutin-auth-page">
        <div className="cutin-auth-page__intro"><span className="eyebrow">Uma conta para todo o ecossistema</span><h1>Crie sua conta.</h1><p>Com a mesma identidade Peter Tecnet, você pode comprar ingressos, produzir eventos, trabalhar em equipes e acompanhar suas operações na Cutinapp.</p></div>
        <div className="cutin-auth-card">
          <div className="cutin-auth-card__mark"><img src="/images/logo.png" alt="Cutinapp" /></div>
          <h2>Criar conta</h2><p className="cutin-auth-card__subtitle">Seu e-mail será validado por código após o cadastro.</p>
          <form onSubmit={submit} noValidate>
            <label className="cutin-field"><span>Nome</span><input name="first_name" value={form.first_name} onChange={change} autoComplete="name" placeholder="Seu nome" required /></label>
            <label className="cutin-field"><span>E-mail</span><input name="email" type="email" value={form.email} onChange={change} autoComplete="email" placeholder="seu@email.com" required /></label>
            <label className="cutin-field"><span>Senha</span><input name="password" type="password" value={form.password} onChange={change} autoComplete="new-password" placeholder="Crie uma senha forte" required /></label>
            <label className="cutin-field"><span>Confirmar senha</span><input name="confirm" type="password" value={form.confirm} onChange={change} autoComplete="new-password" placeholder="Repita a senha" required /></label>
            <small className="muted">Use maiúscula, minúscula, número e símbolo.</small>
            {error && <div className="error-box" role="alert">{error}</div>}
            <div className="cutin-auth-card__actions"><button className="primary" type="submit" disabled={loading}>Criar conta</button></div>
          </form>
          <div className="cutin-auth-card__footer">Já tem conta? <Link to="/login">Entrar</Link></div>
        </div>
      </section>
    </CutinLayout>
  );
}
