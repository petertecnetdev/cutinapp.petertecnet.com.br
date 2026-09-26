import React, { useRef } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { storageUrl } from "../../config";
import "./ItemDiscoveryRail.css";

const money = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const mediaUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  if (/^https?:\/\//i.test(image)) return image;
  return `${storageUrl}${image.replace(/^\/?storage\//, "").replace(/^\/+/, "")}`;
};

const preferredPrice = (item) => (
  item?.promotion_enabled && Number(item?.promotion_price) >= 0
    ? Number(item.promotion_price)
    : Number(item?.price || 0)
);

const uniqueItems = (items, maxItems) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = String(item?.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxItems);
};

const prefersReducedMotion = () => (
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches
);

export default function ItemDiscoveryRail({
  items,
  eventSlug,
  eyebrow,
  title,
  description,
  maxItems,
  className,
}) {
  const railRef = useRef(null);
  const visibleItems = uniqueItems(items, maxItems);

  const scroll = (direction) => {
    const node = railRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(260, Math.round(node.clientWidth * 0.8)),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  if (!visibleItems.length) return null;

  return (
    <section className={["cut-item-discovery", className].filter(Boolean).join(" ")}>
      <div className="cut-item-discovery__head">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {visibleItems.length > 1 && (
          <div className="cut-item-discovery__controls" role="group" aria-label={`Navegar em ${title}`}>
            <button type="button" onClick={() => scroll(-1)} aria-label="Ver itens anteriores">
              <i className="fa-solid fa-chevron-left" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label="Ver próximos itens">
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
        )}
      </div>

      <div
        className="cut-item-discovery__rail"
        ref={railRef}
        role="list"
        tabIndex={0}
        aria-label={`${title}. Arraste horizontalmente para navegar.`}
      >
        {visibleItems.map((item) => {
          const slug = item?.event_slug || eventSlug;
          const href = slug && item?.id ? `/event/${encodeURIComponent(slug)}/item/${item.id}` : "#";
          const image = mediaUrl(item?.image_url || item?.image || item?.photo);
          const price = preferredPrice(item);
          return (
            <Link
              key={item.id}
              to={href}
              className="cut-item-discovery__card"
              role="listitem"
              aria-label={`Ver detalhes de ${item?.name || "item"}`}
            >
              <div className="cut-item-discovery__media">
                {image
                  ? <img src={image} alt={item?.name || "Item"} loading="lazy" decoding="async" />
                  : <span aria-hidden="true"><i className="fa-solid fa-box-open" /></span>}
                {item?.promotion_enabled && Number(item?.promotion_price) >= 0 && (
                  <small>Oferta</small>
                )}
              </div>
              <div className="cut-item-discovery__body">
                <div className="cut-item-discovery__meta">
                  <span>{item?.category || item?.type || "Item"}</span>
                </div>
                <h3>{item?.name || "Item"}</h3>
                {item?.description && <p>{item.description}</p>}
                <div className="cut-item-discovery__footer">
                  <strong>{money(price)}</strong>
                  <span>Ver item <i className="fa-solid fa-arrow-right" /></span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

ItemDiscoveryRail.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object),
  eventSlug: PropTypes.string,
  eyebrow: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.node,
  maxItems: PropTypes.number,
  className: PropTypes.string,
};

ItemDiscoveryRail.defaultProps = {
  items: [],
  eventSlug: "",
  eyebrow: "Mais para descobrir",
  title: "Outros itens",
  description: null,
  maxItems: 10,
  className: "",
};
