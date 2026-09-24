import React, { useEffect, useMemo, useRef, useState } from "react";
import ProcessingIndicatorComponent from "../ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import "./EventDateCarousel.css";

const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";
const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const localDateKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const dateMeta = (key) => {
  const [year, month, day] = String(key).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return {
    weekday: WEEKDAYS[date.getDay()],
    shortDate: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
    fullLabel: new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date),
  };
};

export default function EventDateCarousel({ city = "", uf = "", selectedDate = "", onSelect }) {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef(null);

  useEffect(() => {
    let active = true;

    const loadDates = async () => {
      setLoading(true);
      try {
        const uniqueDates = new Set();
        let page = 1;
        let lastPage = 1;

        do {
          const response = await cutinappService.publicEvents({
            city: city || undefined,
            uf: uf || undefined,
            view: "compact",
            per_page: 50,
            page,
            sort: "soonest",
          });

          if (!active) return;

          const eventPage = response?.events;
          (eventPage?.data || []).forEach((event) => {
            const key = localDateKey(event?.start_date);
            if (key) uniqueDates.add(key);
          });

          lastPage = Math.max(1, Number(eventPage?.last_page || 1));
          page += 1;
        } while (page <= lastPage);

        if (active) setDates(Array.from(uniqueDates).sort());
      } catch (_) {
        if (active) setDates([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDates();
    return () => { active = false; };
  }, [city, uf]);

  const items = useMemo(() => dates.map((key) => ({ key, ...dateMeta(key) })), [dates]);

  useEffect(() => {
    if (!selectedDate || !scrollerRef.current) return;
    const selected = scrollerRef.current.querySelector(`[data-date="${selectedDate}"]`);
    selected?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedDate, items]);

  if (loading) {
    return <div className="cut-event-date-carousel__loading"><ProcessingIndicatorComponent label="Carregando datas dos eventos" /></div>;
  }

  if (items.length === 0) return null;

  return (
    <div className="cut-event-date-carousel" aria-label="Filtrar eventos por data">
      <div className="cut-event-date-carousel__track" ref={scrollerRef}>
        {items.map((item) => {
          const active = selectedDate === item.key;
          return (
            <button
              key={item.key}
              type="button"
              data-date={item.key}
              className={`cut-event-date-carousel__day${active ? " is-active" : ""}`}
              aria-pressed={active}
              aria-label={`${active ? "Remover filtro de " : "Mostrar eventos de "}${item.fullLabel}`}
              title={active ? "Clique novamente para mostrar todos os eventos" : item.fullLabel}
              onClick={() => onSelect?.(active ? "" : item.key)}
            >
              <span className="cut-event-date-carousel__weekday">{item.weekday}</span>
              <span className="cut-event-date-carousel__date">{item.shortDate}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
