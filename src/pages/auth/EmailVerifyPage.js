import React, { useContext, useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import authService from "../../services/AuthService";

export default function EmailVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useContext(AuthContext);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const normalized = useMemo(() => code.trim(), [code]);
  const returnTo = location.state?.from || "/dashboard";

  const verify = async (event) => {
    event.preventDefault();
    if (!normalized || loading) return;
    setLoading(true); setMessage(null);
    try {
      const response = await authService.emailVerify(normalized);
      const user = await refreshUser();
      if (!user?.email_verified_at) throw new Error("A confirmação ainda não apareceu na sessão. Tente novamente.");
      setMessage({ type:"success", text:response?.message || "E-mail verificado com sucesso." });
      navigate(returnTo, { replace:true, state: { artistClaim: location.state?.artistClaim || null } });
    } catch (err) { setMessage({ type:"error", text:err?.message || "Código inválido ou expirado." }); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    if (loading) return;
    setLoading(true); setMessage(null);
    try { const response = await authService.resendCodeEmailVerification(); setCode(""); setMessage({ type:"success", text:response?.message || "Novo código enviado. Use somente o mais recente." }); }
    catch (err) { setMessage({ type:"error", text:err?.message || "Não foi possível reenviar o código." }); }
    finally { setLoading(false); }
  };

  return <AuthPageShell title="Confirme seu e-mail" subtitle="Digite o código mais recente que enviamos para ativar sua conta." compact>{loading && <ProcessingIndicatorComponent label="Validando código" />}<Form onSubmit={verify} className="cut-auth-form">{message && <div className={`cut-form-message cut-form-message--${message.type === "error" ? "error" : "success"}`}>{message.text}</div>}{location.state?.artistClaim && <div className="cut-form-message cut-form-message--success">Após a confirmação você voltará ao evento para concluir a reivindicação do vínculo artístico.</div>}<Form.Group><Form.Label>Código de verificação</Form.Label><Form.Control value={code} onChange={(e)=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="Digite o código recebido" /></Form.Group><Button type="submit" className="cut-primary-action" disabled={!normalized || loading}>Verificar e-mail</Button><Button type="button" variant="outline-light" onClick={resend} disabled={loading}>Reenviar código</Button></Form></AuthPageShell>;
}
