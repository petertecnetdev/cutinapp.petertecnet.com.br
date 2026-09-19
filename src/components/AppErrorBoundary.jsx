import React from "react";
import { trackTelemetry } from "../utils/telemetry";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    trackTelemetry("frontend_error", {
      message: error?.message || "Erro inesperado na interface",
      name: error?.name || null,
      component_stack: info?.componentStack || null,
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="app-error-boundary" role="alert" aria-live="assertive">
        <section className="app-error-boundary__card">
          <div className="app-error-boundary__icon" aria-hidden="true">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <p className="app-error-boundary__eyebrow">Cutinapp</p>
          <h1>Não foi possível exibir esta tela</h1>
          <p className="app-error-boundary__description">
            Seus dados continuam preservados. Tente recuperar a interface sem sair da página; se necessário, recarregue o aplicativo.
          </p>
          {process.env.NODE_ENV === "development" && (
            <pre className="app-error-boundary__debug">{error?.message}</pre>
          )}
          <div className="app-error-boundary__actions">
            <button type="button" className="btn btn-primary" onClick={this.handleRetry}>
              Tentar novamente
            </button>
            <button type="button" className="btn btn-outline-light" onClick={this.handleReload}>
              Recarregar aplicativo
            </button>
          </div>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
