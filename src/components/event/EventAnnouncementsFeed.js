import React, { useEffect, useState } from "react";
import { Alert, Badge } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";

const levelMeta = {
  info: { variant: "secondary", icon: "fa-circle-info", label: "Informação" },
  update: { variant: "info", icon: "fa-arrows-rotate", label: "Atualização" },
  warning: { variant: "warning", icon: "fa-triangle-exclamation", label: "Atenção" },
  critical: { variant: "danger", icon: "fa-bullhorn", label: "Urgente" },
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  : "";

export default function EventAnnouncementsFeed({ slug }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await cutinappService.publicEventAnnouncements(slug);
        if (active) setAnnouncements(response?.announcements || []);
      } catch (_) {
        // A página do evento não deve falhar se os avisos estiverem temporariamente indisponíveis.
      } finally {
        if (active) setLoaded(true);
      }
    };

    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [slug]);

  if (!loaded || announcements.length === 0) return null;

  return (
    <section id="avisos-oficiais" className="mb-5" aria-labelledby="event-announcements-title">
      <div className="cut-section-heading">
        <div>
          <span className="cut-eyebrow">Canal oficial</span>
          <h2 id="event-announcements-title">Avisos do evento</h2>
          <p className="text-secondary mb-0">Mudanças, orientações e informações publicadas diretamente pela produção.</p>
        </div>
        <Badge bg="dark">Atualização automática</Badge>
      </div>

      <div className="d-grid gap-3 mt-3">
        {announcements.map((announcement) => {
          const meta = levelMeta[announcement.level] || levelMeta.info;
          return (
            <Alert key={announcement.id} variant={meta.variant} className="mb-0 shadow-sm">
              <div className="d-flex align-items-start gap-3">
                <i className={`fa-solid ${meta.icon} fs-4 mt-1`} aria-hidden="true" />
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <strong>{announcement.title}</strong>
                    <Badge bg={announcement.level === "critical" ? "danger" : "dark"}>{meta.label}</Badge>
                    {announcement.is_pinned && <Badge bg="dark"><i className="fa-solid fa-thumbtack me-1" />Fixado</Badge>}
                  </div>
                  <p className="mb-2" style={{ whiteSpace: "pre-wrap" }}>{announcement.message}</p>
                  <small className="d-block opacity-75">Publicado em {formatDate(announcement.published_at)}</small>
                </div>
              </div>
            </Alert>
          );
        })}
      </div>
    </section>
  );
}
