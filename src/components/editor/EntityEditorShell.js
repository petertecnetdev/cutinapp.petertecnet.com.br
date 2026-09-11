import React from "react";
import { Badge, Button, Container } from "react-bootstrap";
import "./EntityEditorShell.css";

const tone = (status) => {
  if (status === "error") return "danger";
  if (status === "dirty") return "warning";
  if (status === "saving") return "info";
  return "success";
};

export default function EntityEditorShell({
  eyebrow = "Editor",
  title,
  description,
  sections = [],
  activeSection,
  onSectionChange,
  status,
  statusLabel,
  lastSavedAt,
  preview,
  previewLabel = "Prévia ao vivo",
  primaryAction,
  secondaryActions,
  children,
}) {
  const select = (key) => {
    onSectionChange?.(key);
    requestAnimationFrame(() => {
      document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="cut-entity-editor">
      <header className="cut-entity-editor__header">
        <Container className="cut-page-container">
          <div className="cut-entity-editor__heading">
            <div>
              <span className="cut-eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
            <div className="cut-entity-editor__status">
              {statusLabel && <Badge bg={tone(status)}>{statusLabel}</Badge>}
              {lastSavedAt && <small>Salvo às {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}
              <div className="cut-entity-editor__actions">
                {secondaryActions}
                {primaryAction}
              </div>
            </div>
          </div>
        </Container>
      </header>

      {sections.length > 0 && (
        <nav className="cut-entity-editor__nav" aria-label="Seções do editor">
          <Container className="cut-page-container">
            <div className="cut-entity-editor__navInner">
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.key}
                  className={activeSection === section.key ? "is-active" : ""}
                  onClick={() => select(section.key)}
                >
                  {section.icon && <i className={section.icon} aria-hidden="true" />}
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
          </Container>
        </nav>
      )}

      <Container className="cut-page-container cut-entity-editor__body">
        <div className="cut-entity-editor__grid">
          <main className="cut-entity-editor__main">{children}</main>
          <aside className="cut-entity-editor__aside">
            <div className="cut-entity-editor__previewSticky">
              <div className="cut-entity-editor__previewHeading">
                <span className="cut-eyebrow">{previewLabel}</span>
                <small>Atualiza enquanto você edita</small>
              </div>
              {preview}
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}

export function EditorSection({ id, eyebrow, title, hint, children, className = "" }) {
  return (
    <section id={id} className={`cut-entity-editor__section ${className}`}>
      <div className="cut-entity-editor__sectionHeading">
        <div>
          {eyebrow && <span className="cut-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function EditorPreviewEmpty({ icon = "fa-regular fa-eye", title = "Prévia indisponível", text = "Preencha os dados para visualizar esta área." }) {
  return <div className="cut-entity-editor__previewEmpty"><i className={icon} /><strong>{title}</strong><span>{text}</span></div>;
}
