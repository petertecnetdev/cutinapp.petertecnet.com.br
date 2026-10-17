import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import EventArtwork from "./EventArtwork";
import { parsePortableEventDate } from "../../utils/chronologicalDiscovery";
import { publicEventRoute } from "../../utils/entityRoutes";
import { flyerImage, flyerStart, selectUpcomingFlyers } from "./eventFlyerCarouselData";
import "./UpcomingFlyerCarousel.css";

const eventDateLabel = (event) => {
  const date = parsePortableEventDate(flyerStart(event));
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(date);
};

const circularOffset = (index, selected, count) => {
  const distance = (index - selected + count) % count;
  return distance > count / 2 ? distance - count : distance;
};

export default function UpcomingFlyerCarousel({ events = [], className = "", city = "", uf = "" }) {
  const posters = useMemo(() => selectUpcomingFlyers(events, new Date(), 9, { city, uf }), [events, city, uf]);
  const [selected, setSelected] = useState(0);
  const gesture = useRef(null);
  const swipeClickUntil = useRef(0);
  const total = posters.length;

  useEffect(() => {
    setSelected((current) => (total ? current % total : 0));
  }, [total]);

  const move = (direction) => {
    if (total < 2) return;
    setSelected((current) => (current + direction + total) % total);
  };

  const onKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    move(event.key === "ArrowLeft" ? -1 : 1);
  };

  const onTouchStart = (event) => {
    const touch = event.changedTouches[0];
    if (touch) gesture.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event) => {
    const touch = event.changedTouches[0];
    const start = gesture.current;
    gesture.current = null;
    if (!touch || !start) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Deslocamentos verticais continuam sendo gestos de rolagem da página.
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      swipeClickUntil.current = Date.now() + 450;
      move(dx < 0 ? 1 : -1);
    }
  };

  if (!total) return null;

  return (
    <section className={"cut-next-flyers " + className} aria-labelledby="cut-next-flyers-title">
      <div className="cut-next-flyers__heading">
        <div className="cut-next-flyers__headingCopy">
          <span className="cut-next-flyers__eyebrow"><span aria-hidden="true" /> NO RADAR</span>
          <h2 id="cut-next-flyers-title">Próximos <em>eventos</em></h2>
          <p>Escolha o próximo flyer. Entre na experiência.</p>
        </div>
        <div className="cut-next-flyers__controls" role="group" aria-label="Navegar pelos flyers">
          <button type="button" onClick={() => move(-1)} disabled={total < 2} aria-label="Flyer anterior">
            <i className="fa-solid fa-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => move(1)} disabled={total < 2} aria-label="Próximo flyer">
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        className="cut-next-flyers__stage"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { gesture.current = null; }}
        role="group"
        aria-label="Carrossel de flyers em 3D. Use as setas do teclado ou deslize para navegar."
      >
        <div className="cut-next-flyers__horizon" aria-hidden="true" />
        {posters.map((event, index) => {
          const offset = circularOffset(index, selected, total);
          const active = offset === 0;
          const visible = Math.abs(offset) <= 2;
          const positionClass = active ? "is-active" : offset < 0 ? "is-left-" + Math.abs(offset) : "is-right-" + offset;
          const date = parsePortableEventDate(flyerStart(event));
          return (
            <Link
              key={event.slug || event.id}
              to={publicEventRoute(event.slug)}
              className={"cut-next-flyers__poster " + positionClass + (!visible ? " is-hidden" : "")}
              aria-hidden={!active}
              tabIndex={active ? 0 : -1}
              onClick={(clickEvent) => {
                if (Date.now() < swipeClickUntil.current) {
                  clickEvent.preventDefault();
                  swipeClickUntil.current = 0;
                } else if (!active) {
                  clickEvent.preventDefault();
                  setSelected(index);
                }
              }}
            >
              <EventArtwork
                image={flyerImage(event)}
                title={event.title || event.name}
                alt={"Flyer do evento " + (event.title || event.name || "Cutinapp")}
                className="cut-next-flyers__artwork"
                loading={active ? "eager" : "lazy"}
              />
              <div className="cut-next-flyers__posterCopy">
                {date && <time dateTime={date.toISOString()}>{eventDateLabel(event)}</time>}
                <strong>{event.title || event.name || "Próximo evento"}</strong>
                <span>{[event.city, event.uf].filter(Boolean).join(" - ") || event.venue || "Descubra o evento"} <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="cut-next-flyers__footer">
        <span className="cut-next-flyers__counter" aria-live="polite">
          <b>{String(selected + 1).padStart(2, "0")}</b><span> / {String(total).padStart(2, "0")}</span>
        </span>
        <span className="cut-next-flyers__instruction">Deslize ou use as setas para explorar</span>
        <Link to="/event" className="cut-next-flyers__all">Ver todos os eventos <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

UpcomingFlyerCarousel.propTypes = {
  events: PropTypes.arrayOf(PropTypes.object),
  className: PropTypes.string,
  city: PropTypes.string,
  uf: PropTypes.string,
};
