import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import EventCommercePanel from "./EventCommercePanel";
import commerceService from "../../services/CommerceService";
import { readEventCart, writeEventCart, clearEventCart } from "../../utils/eventCartStorage";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/event/festa", search: "" }),
}));
jest.mock("../../services/CommerceService", () => ({
  __esModule: true,
  default: { catalog: jest.fn() },
}));
jest.mock("../../utils/eventCartStorage", () => ({
  readEventCart: jest.fn(),
  writeEventCart: jest.fn(),
  clearEventCart: jest.fn(),
}));

const catalogFor = (tickets, slug = "festa") => ({
  event: { id: 77, slug, start_date: "2026-11-01" },
  tickets,
  items: [],
  available_dates: [],
  payment_config: { connected: true },
});

const buttonWithLabel = (container, label) =>
  [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === label);

describe("EventCommercePanel — veto comercial por ingresso [agent:W2]", () => {
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    readEventCart.mockReturnValue(null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderCatalog = async (tickets, slug = "festa") => {
    commerceService.catalog.mockResolvedValue(catalogFor(tickets, slug));
    await act(async () => {
      root.render(<EventCommercePanel slug={slug} eventId={77} user={{ id: 7 }} />);
      await Promise.resolve();
    });
  };

  test("catálogo misto: informativos, preço desconhecido e price_known=false não têm stepper nem checkout", async () => {
    await renderCatalog([
      { id: 1, name: "Informativo", informational_only: true, price: 20 },
      { id: 2, name: "Curatorial", curatorial_information_only: true, price: 30 },
      { id: 3, name: "Sem preço", price: null },
      { id: 4, name: "Preço não conhecido", price: 40, price_known: false },
      { id: 5, name: "Preço inválido", price: "indefinido" },
      { id: 6, name: "Gratuito legítimo", price: 0, available: true },
      { id: 7, name: "Pago legítimo", price: "25.00", available: true },
    ]);

    for (const name of ["Informativo", "Curatorial", "Sem preço", "Preço não conhecido", "Preço inválido"]) {
      expect(buttonWithLabel(container, `Adicionar uma unidade de ${name}`)).toBeUndefined();
    }
    expect(container.textContent).toContain("Somente consulta");
    expect(container.textContent).toContain("Preço não confirmado");
    expect(buttonWithLabel(container, "Adicionar uma unidade de Gratuito legítimo")).toBeTruthy();
    expect(buttonWithLabel(container, "Adicionar uma unidade de Pago legítimo")).toBeTruthy();

    await act(async () => {
      buttonWithLabel(container, "Adicionar uma unidade de Gratuito legítimo").click();
      buttonWithLabel(container, "Adicionar uma unidade de Pago legítimo").click();
    });

    const checkout = container.querySelector(".cut-ticket-shop__checkout-btn");
    expect(checkout.disabled).toBe(false);
    await act(async () => checkout.click());
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate.mock.calls[0][1].state.checkout.tickets).toEqual([
      { id: 6, quantity: 1 }, { id: 7, quantity: 1 },
    ]);
    expect(writeEventCart.mock.calls.at(-1)[1].tickets).toEqual([
      { id: 6, quantity: 1 }, { id: 7, quantity: 1 },
    ]);
  });

  test("catálogo somente informativo nunca libera checkout ou quantidade", async () => {
    await renderCatalog([
      { id: 1, name: "Consulta", informational_only: true, price: 15 },
      { id: 2, name: "Preço nulo", price: null },
      { id: 3, name: "Não confirmado", price_known: false, price: 0 },
    ]);
    expect(container.querySelector(".cut-ticket-shop__stepper")).toBeNull();
    expect(container.querySelector(".cut-ticket-shop__checkout-btn").disabled).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(writeEventCart).not.toHaveBeenCalled();
  });

  test("restauração antiga é sanitizada no estado e no armazenamento, preservando ingresso válido", async () => {
    readEventCart.mockReturnValue({
      eventId: 77,
      tickets: [
        { id: 1, quantity: 2 }, { id: 2, quantity: 1 },
        { id: 3, quantity: 3 }, { id: 4, quantity: 1 },
      ],
      items: [],
    });
    await renderCatalog([
      { id: 1, name: "Informativo", informational_only: true, price: 20 },
      { id: 2, name: "Preço ausente", price: null },
      { id: 3, name: "Grátis legítimo", price: 0 },
      { id: 4, name: "Desconhecido", price_known: false, price: 40 },
    ]);

    expect(container.textContent).toContain("Compra em andamento recuperada");
    expect(container.textContent).toContain("3 selecionados");
    expect(writeEventCart).toHaveBeenCalledWith("festa", expect.objectContaining({
      tickets: [{ id: 3, quantity: 3 }],
    }));
    const resume = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Continuar compra"));
    await act(async () => resume.click());
    expect(mockNavigate.mock.calls[0][1].state.checkout.tickets).toEqual([{ id: 3, quantity: 3 }]);
  });

  test("carrinho restaurado contendo só ingresso informativo é limpo e não habilita CTA", async () => {
    readEventCart.mockReturnValue({ eventId: 77, tickets: [{ id: 1, quantity: 4 }], items: [] });
    await renderCatalog([{ id: 1, name: "Informativo", curatorial_information_only: true, price: 30 }]);
    expect(clearEventCart).toHaveBeenCalledWith("festa");
    expect(container.textContent).not.toContain("Compra em andamento recuperada");
    expect(container.querySelector(".cut-ticket-shop__checkout-btn").disabled).toBe(true);
  });

  test.each([null, undefined, "", "indefinido", -1, Infinity, NaN])(
    "preço desconhecido %p nunca vira gratuito",
    async (price) => {
      await renderCatalog([{ id: 9, name: "Indefinido", price }]);
      expect(buttonWithLabel(container, "Adicionar uma unidade de Indefinido")).toBeUndefined();
      expect(container.querySelector(".cut-ticket-shop__checkout-btn").disabled).toBe(true);
    }
  );

  test("resposta tardia de catálogo B não substitui a edição A após A→B→A", async () => {
    const requests = [];
    commerceService.catalog.mockImplementation((slug) => new Promise((resolve) => requests.push({ slug, resolve })));
    await act(async () => {
      root.render(<EventCommercePanel slug="a" eventId={77} user={{ id: 7 }} />);
    });
    await act(async () => {
      root.render(<EventCommercePanel slug="b" eventId={77} user={{ id: 7 }} />);
    });
    await act(async () => {
      root.render(<EventCommercePanel slug="a" eventId={77} user={{ id: 7 }} />);
    });
    expect(requests.map((request) => request.slug)).toEqual(["a", "b", "a"]);
    await act(async () => {
      requests[2].resolve(catalogFor([{ id: 10, name: "Ingresso A", price: 10 }], "a"));
      await Promise.resolve();
    });
    await act(async () => {
      requests[1].resolve(catalogFor([{ id: 20, name: "Ingresso B", price: 20 }], "b"));
      requests[0].resolve(catalogFor([{ id: 30, name: "Ingresso A antigo", price: 30 }], "a"));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Ingresso A");
    expect(container.textContent).not.toContain("Ingresso B");
    expect(container.textContent).not.toContain("Ingresso A antigo");
  });
});
