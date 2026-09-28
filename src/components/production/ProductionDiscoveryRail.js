import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import "./ProductionDiscoveryRail.css";

const mediaUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const initials = (name) => String(name || "P")
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const compactNumber = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatMetric = (value) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? compactNumber.format(Math.max(0, numeric)) : "0";
};

const unwrapProductions = (response) => {
  const payload = response?.productions;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const dedupeProductions = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = Number(item?.id) > 0 ? `id:${Number(item.id)}` : `slug:${String(item?.slug || "")}`;
    if (!item?.slug || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function ProductionDiscoveryRail({ currentProduction, limit = 6 }) {
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const currentId = Number(currentProduction?.id || 0);
  const currentSlug = String(currentProduction?.slug || "").trim();
  const currentCity = String(currentProduction?.city || "").trim();

  useEffect(() => {
    let active = true;

    const excludeCurrent = (items) => items.filter((item) => {
      if (currentId > 0 && Number(item?.id || 0) === currentId) return false;
      if (currentSlug && String(item?.slug || "").trim() === currentSlug) return false;
      return true;
    });

    const load = async () => {
      setLoading(true);
      setFailed(false);

      try {
        let combined = [];

        if (currentCity) {
          try {
            const localResponse = await cutinappService.publicProductions({
              city: currentCity,
              per_page: Math.max(limit + 2, 8),
            });
            combined = excludeCurrent(unwrapProductions(localResponse));
          } catch (_) {
            // A falha do recorte local não deve impedir o fallback global.
          }
        }

        if (combined.length < limit) {
          const globalResponse = await cutinappService.publicProductions({
            per_page: Math.max(limit * 2, 12),
          });
          combined = [...combined, ...excludeCurrent(unwrapProductions(globalResponse))];
        }

        if (!active) return;
        setProductions(dedupeProductions(combined).slice(0, limit));
      } catch (_) {
        if (!active) return;
        setProductions([]);
        setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [currentCity, currentId, currentSlug, limit]);

  const subtitle = useMemo(() => {
    if (currentCity && productions.some((item) => String(item?.city || "").trim() === currentCity)) {
      return `Continue explorando quem movimenta a cena em ${currentCity} e outras produções da Cutinapp.`;
    }
    return "Continue navegando por outras produções, espaços e coletivos que movimentam eventos na Cutinapp.";
  }, [currentCity, productions]);

  if (!loading && (failed || productions.length === 0)) return null;

  return (
    <section className="cut-production-discovery-rail" aria-labelledby="cut-production-discovery-rail-title" aria-busy={loading}>
      <div className="cut-production-discovery-rail__heading">
        <div>
          <span className="cut-eyebrow">Descobrir mais</span>
          <h2 id="cut-production-discovery-rail-title">Outras produções</h2>
          <p>{subtitle}</p>
        </div>
        <Link to="/productions" className="cut-production-discovery-rail__all">
          Ver todas <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className="cut-production-discovery-rail__track" aria-hidden="true">
          {["one", "two", "three", "four"].slice(0, Math.min(limit, 4)).map((slot) => (
            <div className="cut-production-discovery-rail__skeleton" key={`production-discovery-skeleton-${slot}`} />
          ))}
        </div>
      ) : (
        <div className="cut-production-discovery-rail__track">
          {productions.map((production) => {
            const cover = mediaUrl(production?.background);
            const logo = mediaUrl(production?.logo);
            const location = production?.city
              ? `${production.city}${production?.uf ? ` - ${production.uf}` : ""}`
              : "Eventos e experiências";

            return (
              <Link
                to={`/production/${encodeURIComponent(production.slug)}/public`}
                className="cut-production-discovery-rail__card"
                key={production.id || production.slug}
                aria-label={`Abrir produção ${production.name}`}
              >
                <div
                  className={`cut-production-discovery-rail__cover${cover ? " has-image" : ""}`}
                  style={cover ? { backgroundImage: `url(${JSON.stringify(cover)})` } : undefined}
                  aria-hidden="true"
                />
                <div className="cut-production-discovery-rail__body">
                  <div className="cut-production-discovery-rail__identity">
                    <div className="cut-production-discovery-rail__logo" aria-hidden="true">
                      {logo ? <img src={logo} alt="" loading="lazy" decoding="async" /> : <span>{initials(production.name)}</span>}
                    </div>
                    <div>
                      <h3>{production.name}</h3>
                      <p><i className="fa-solid fa-location-dot" aria-hidden="true" /> {location}</p>
                    </div>
                  </div>

                  <div className="cut-production-discovery-rail__meta">
                    <span><i className="fa-regular fa-calendar" aria-hidden="true" /> {formatMetric(production.upcoming_events_count ?? production.events_count)} eventos</span>
                    <span><i className="fa-solid fa-user-group" aria-hidden="true" /> {formatMetric(production.followers_count)} seguidores</span>
                  </div>

                  <div className="cut-production-discovery-rail__cta">
                    <span>Ver produção</span>
                    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

ProductionDiscoveryRail.propTypes = {
  currentProduction: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    slug: PropTypes.string,
    city: PropTypes.string,
  }),
  limit: PropTypes.number,
};
