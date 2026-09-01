import React, { useContext, useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import authService from "../../services/AuthService";

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useContext(AuthContext);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordOk = useMemo(() => password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password), [password]);
  const canSubmit = firstName.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && passwordOk && password === confirm && !loading;
  const returnTo = location.state?.from || "/dashboard";

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await authService.register({ first_name: firstName.trim(), email: normalizedEmail, password });
      await login(normalizedEmail, password);
      navigate("/email-verify", { replace: true, state: { from: returnTo, artistClaim: location.state?.artistClaim || null } });
    } catch (err) {
      setError(err?.message || "Não foi possível criar sua conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageShell title="Crie sua conta" subtitle="Uma conta Peter Tecnet para participar de eventos ou começar a produzir.">
      {loading && <ProcessingIndicatorComponent label="Criando sua conta" />}
      <Form onSubmit={submit} className="cut-auth-form">
        {error && <div className="cut-form-message cut-form-message--error">{error}</div>}
        {location.state?.artistClaim && <div className="cut-form-message cut-form-message--success">Depois de confirmar seu e-mail, você voltará ao evento para reivindicar seu vínculo artístico.</div>}
        <Form.Group><Form.Label>Nome</Form.Label><Form.Control value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Como podemos chamar você?" autoComplete="given-name" /></Form.Group>
        <Form.Group><Form.Label>E-mail</Form.Label><Form.Control type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" /></Form.Group>
        <Form.Group><Form.Label>Senha</Form.Label><Form.Control type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Crie uma senha segura" autoComplete="new-password" /><Form.Text>8+ caracteres com maiúscula, minúscula, número e símbolo.</Form.Text></Form.Group>
        <Form.Group><Form.Label>Confirmar senha</Form.Label><Form.Control type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repita sua senha" autoComplete="new-password" /></Form.Group>
        {confirm && password !== confirm && <div className="cut-form-message cut-form-message--warning">As senhas não coincidem.</div>}
        <Button type="submit" className="cut-primary-action" disabled={!canSubmit}>Criar conta</Button>
        <div className="cut-auth-inline-links"><span>Já possui conta?</span><Link to="/login" state={{ from: returnTo }}>Entrar</Link></div>
      </Form>
    </AuthPageShell>
  );
}
