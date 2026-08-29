import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import authService from "../../services/AuthService";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import "./PasswordEmailPage.css";

export default function PasswordEmailPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordResetForm, setShowPasswordResetForm] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const canSend = useMemo(() => String(email || "").trim().length > 3, [email]);
  const canReset = useMemo(
    () => Boolean(code && newPassword && confirmPassword),
    [code, newPassword, confirmPassword]
  );

  const getErrorMessage = (error, fallback) => {
    const data = error?.response?.data ?? error?.data ?? error;
    if (typeof data === "string") return data;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    if (data?.errors && typeof data.errors === "object") {
      return Object.values(data.errors).flat().filter(Boolean).join(" ");
    }
    return fallback;
  };

  const handleSendCode = async (event) => {
    event.preventDefault();
    if (!canSend || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const response = await authService.passwordEmail(String(email).trim());
      setFeedback({
        type: "success",
        message:
          response?.data?.message ||
          "Código enviado. Verifique seu e-mail para continuar a recuperação.",
      });
      setShowPasswordResetForm(true);
    } catch (error) {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, "Não foi possível enviar o código. Tente novamente."),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!canReset || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const response = await authService.passwordReset(
        String(email).trim(),
        String(code).trim(),
        newPassword,
        confirmPassword
      );

      setFeedback({
        type: "success",
        message: response?.data?.message || "Senha redefinida com sucesso.",
      });
      setShowPasswordResetForm(false);
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, "Não foi possível redefinir sua senha."),
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ProcessingIndicatorComponent
        messages={
          showPasswordResetForm
            ? ["Validando código...", "Atualizando sua senha...", "Quase pronto..."]
            : ["Enviando código...", "Validando e-mail...", "Quase pronto..."]
        }
      />
    );
  }

  return (
    <main className="cutin-pep">
      <div className="cutin-pep__background" aria-hidden="true">
        <span className="cutin-pep__orb cutin-pep__orb--one" />
        <span className="cutin-pep__orb cutin-pep__orb--two" />
        <span className="cutin-pep__grid" />
      </div>

      <div className="cutin-pep__container">
        <section className="cutin-pep__hero">
          <div className="cutin-pep__brand">
            <div className="cutin-pep__brand-mark">
              <img src="/images/logo.png" alt="Cutinapp" />
            </div>
            <div>
              <span className="cutin-pep__eyebrow">CUTINAPP</span>
              <h1>Recupere seu acesso com segurança.</h1>
            </div>
          </div>

          <p className="cutin-pep__hero-text">
            Informe o e-mail cadastrado. Enviaremos um código para confirmar sua identidade e permitir a criação de uma nova senha.
          </p>

          <div className="cutin-pep__steps">
            <div className="cutin-pep__step">
              <span>01</span>
              <div>
                <strong>Informe seu e-mail</strong>
                <small>Use o mesmo endereço cadastrado na sua conta.</small>
              </div>
            </div>
            <div className="cutin-pep__step">
              <span>02</span>
              <div>
                <strong>Receba o código</strong>
                <small>Confira também sua caixa de spam ou lixo eletrônico.</small>
              </div>
            </div>
            <div className="cutin-pep__step">
              <span>03</span>
              <div>
                <strong>Crie uma nova senha</strong>
                <small>Depois disso, seu acesso estará pronto novamente.</small>
              </div>
            </div>
          </div>

          <div className="cutin-pep__secure-note">
            <span aria-hidden="true">✓</span>
            Recuperação protegida pelo ecossistema Peter Tecnet.
          </div>
        </section>

        <section className="cutin-pep__panel">
          <div className="cutin-pep__card">
            <header className="cutin-pep__card-header">
              <div className="cutin-pep__logo-wrap">
                <img src="/images/logo.png" alt="Logo Cutinapp" />
              </div>
              <span className="cutin-pep__kicker">
                {showPasswordResetForm ? "ETAPA 2 DE 2" : "RECUPERAÇÃO DE CONTA"}
              </span>
              <h2>{showPasswordResetForm ? "Defina sua nova senha" : "Recuperar senha"}</h2>
              <p>
                {showPasswordResetForm
                  ? `Digite o código enviado para ${email} e escolha uma nova senha.`
                  : "Digite seu e-mail para receber o código de recuperação."}
              </p>
            </header>

            {feedback && (
              <div className={`cutin-pep__feedback cutin-pep__feedback--${feedback.type}`} role="alert">
                {feedback.message}
              </div>
            )}

            {!showPasswordResetForm ? (
              <form className="cutin-pep__form" onSubmit={handleSendCode}>
                <label className="cutin-pep__field" htmlFor="password-email">
                  <span>E-mail</span>
                  <div className="cutin-pep__input-wrap">
                    <span className="cutin-pep__input-icon" aria-hidden="true">@</span>
                    <input
                      id="password-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="seuemail@exemplo.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <small>Enviaremos um código de verificação para este endereço.</small>
                </label>

                <button className="cutin-pep__submit" type="submit" disabled={!canSend}>
                  Enviar código
                </button>
              </form>
            ) : (
              <form className="cutin-pep__form" onSubmit={handleResetPassword}>
                <label className="cutin-pep__field" htmlFor="password-code">
                  <span>Código de verificação</span>
                  <input
                    id="password-code"
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Digite o código recebido"
                    autoComplete="one-time-code"
                    required
                  />
                </label>

                <label className="cutin-pep__field" htmlFor="new-password">
                  <span>Nova senha</span>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Digite a nova senha"
                    autoComplete="new-password"
                    required
                  />
                </label>

                <label className="cutin-pep__field" htmlFor="confirm-password">
                  <span>Confirme a nova senha</span>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                    required
                  />
                </label>

                <button className="cutin-pep__submit" type="submit" disabled={!canReset}>
                  Redefinir senha
                </button>

                <button
                  className="cutin-pep__back-button"
                  type="button"
                  onClick={() => {
                    setShowPasswordResetForm(false);
                    setFeedback(null);
                  }}
                >
                  Usar outro e-mail
                </button>
              </form>
            )}

            <footer className="cutin-pep__footer">
              <div className="cutin-pep__footer-links">
                <Link to="/login">Voltar ao login</Link>
                <span>•</span>
                <Link to="/register">Criar conta</Link>
              </div>
              <small>Cutinapp · Desenvolvido por Peter Tecnet</small>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
