import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import UpcomingFlyerCarousel from "./UpcomingFlyerCarousel";

jest.mock("./EventArtwork", () => function ArtworkMock({ title }) {
  return <span>{title}</span>;
});

global.IS_REACT_ACT_ENVIRONMENT = true;

const events = [
  { id: 1, slug: "primeiro", title: "Primeiro", start_date: "2035-01-01 20:00:00", image: "um.jpg" },
  { id: 2, slug: "segundo", title: "Segundo", start_date: "2035-01-02 20:00:00", image: "dois.jpg" },
  { id: 3, slug: "terceiro", title: "Terceiro", start_date: "2035-01-03 20:00:00", image: "tres.jpg" },
];

describe("interação do carrossel de flyers", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<MemoryRouter><UpcomingFlyerCarousel events={events} /></MemoryRouter>));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("renderiza as duas setas e navega mantendo o link do evento ativo", () => {
    const active = () => container.querySelector(".cut-next-flyers__poster.is-active");
    expect(active().getAttribute("href")).toBe("/event/primeiro");
    expect(container.querySelectorAll(".cut-next-flyers__controls button")).toHaveLength(2);

    act(() => container.querySelector('button[aria-label="Próximo flyer"]').click());
    expect(active().getAttribute("href")).toBe("/event/segundo");
    expect(active().getAttribute("aria-hidden")).toBe("false");
    expect(container.querySelectorAll('.cut-next-flyers__poster[tabindex="0"]')).toHaveLength(1);

    act(() => container.querySelector('button[aria-label="Flyer anterior"]').click());
    expect(active().getAttribute("href")).toBe("/event/primeiro");
  });

  test("navega pelo teclado e cicla até o último flyer", () => {
    const stage = container.querySelector(".cut-next-flyers__stage");
    act(() => stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })));
    expect(container.querySelector(".cut-next-flyers__poster.is-active").getAttribute("href")).toBe("/event/terceiro");
  });
});
