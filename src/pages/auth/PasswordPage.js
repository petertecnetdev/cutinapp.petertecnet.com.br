import React, { useState } from "react";
import { Link } from "react-router-dom";
import CutinLayout from "../../components/CutinLayout";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import authService from "../../services/AuthService";
import "../CutinPages.css";
import "./Auth.css";

export default function PasswordPage() {
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);

    if (formData.new_password !== formData.confirm_password) {
      setFeedback({ type: "error", message: "A confirmação da nova senha não confere." });
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(
        formData.current_password,
        formData.new_password,
        formData.confirm_password
      );
      setFormData({ current_password: "", new_password: "", confirm_password: "" });
      setFeedback({ type: "success", message: "Senha atualizada com sucesso." });
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || "Não foi possível atualizar a senha.";
      setFeedback({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <CutinLayout>
      {loading && <ProcessingIndicatorComponent messages={["Atualizando senha...", "Protegendo sua conta..."]} />}
      <section className="cutin-auth-page">
        <div className="cutin-auth-page__intro">
          <span className="eyebrow">Minha conta</span>
          <h1>Atualize sua senha.</h1>
          <p>Mantenha sua conta Peter Tecnet protegida usando uma senha forte e diferente das utilizadas em outros serviços.</p>
        </div>

        <div className="cutin-auth-card">
          <div className="cutin-auth-card__mark" aria-hidden="true">C</div>
          <h2>Alterar senha</h2>
          <p className="cutin-auth-card__subtitle">Confirme sua senha atual e escolha uma nova.</p>

          <form onSubmit={handleFormSubmit}>
            <label className="cutin-field">
              <span>Senha atual</span>
              <input type="password" name="current_password" value={formData.current_password} onChange={handleInputChange} autoComplete="current-password" required />
            </label>
            <label className="cutin-field">
              <span>Nova senha</span>
              <input type="password" name="new_password" value={formData.new_password} onChange={handleInputChange} autoComplete="new-password" required />
            </label>
            <label className="cutin-field">
              <span>Confirmar nova senha</span>
              <input type="password" name="confirm_password" value={formData.confirm_password} onChange={handleInputChange} autoComplete="new-password" required />
            </label>

            {feedback && (
              <div className={feedback.type === "success" ? "success-box" : "error-box"} role="alert">
                {feedback.message}
              </div>
            )}

            <div className="cutin-auth-card__actions">
              <button className="primary" type="submit" disabled={loading}>Salvar nova senha</button>
            </div>
          </form>

          <div className="cutin-auth-card__footer">
            <Link to="/minha-conta">Voltar para minha conta</Link>
          </div>
        </div>
      </section>
    </CutinLayout>
  );
}
