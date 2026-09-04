import React from "react";
import PropTypes from "prop-types";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== "production") {
      // Keep the original stack visible while developing without exposing it to end users.
      console.error("Cutinapp UI error", error, info);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("petertecnet:ui-error", {
        detail: {
          message: error?.message || "Unexpected UI error",
          componentStack: info?.componentStack || "",
          path: `${window.location.pathname}${window.location.search}`,
        },
      }));
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      // Navigating to another route should always give the application a clean chance to render.
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const errorMessage = process.env.NODE_ENV !== "production"
      ? this.state.error?.message
      : null;

    return (
      <main className="app-error-boundary" role="alert" aria-live="assertive">
        <section className="app-error-boundary__card">
          <div className="app-error-boundary__icon" aria-hidden="true">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <p className="app-error-boundary__eyebrow">Falha de interface</p>
          <h1>Esta página encontrou um problema.</h1>
          <p className="app-error-boundary__description">
            Seus dados não foram apagados. Você pode tentar renderizar a página novamente,
            recarregar a aplicação ou voltar ao início.
          </p>

          {errorMessage && (
            <pre className="app-error-boundary__debug">{errorMessage}</pre>
          )}

          <div className="app-error-boundary__actions">
            <button type="button" className="btn btn-primary" onClick={this.handleRetry}>
              Tentar novamente
            </button>
            <button type="button" className="btn btn-outline-light" onClick={this.handleReload}>
              Recarregar
            </button>
            <button type="button" className="btn btn-link" onClick={this.handleHome}>
              Ir para o início
            </button>
          </div>
        </section>
      </main>
    );
  }
}

AppErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  resetKey: PropTypes.string,
};

AppErrorBoundary.defaultProps = {
  resetKey: "",
};

export default AppErrorBoundary;
