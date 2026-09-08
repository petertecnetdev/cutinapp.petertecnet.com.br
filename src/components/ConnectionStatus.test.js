import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ConnectionStatus from "./ConnectionStatus";
import { getNetworkStatus, subscribeToNetworkStatus } from "../utils/networkStatus";

jest.mock("../utils/networkStatus", () => ({
  getNetworkStatus: jest.fn(),
  subscribeToNetworkStatus: jest.fn(),
}));

describe("ConnectionStatus checkout recovery", () => {
  let subscriber;

  beforeEach(() => {
    jest.useFakeTimers();
    window.history.pushState({}, "", "/checkout/evento-teste");
    window.PeterTecnetTelemetry = { track: jest.fn() };
    getNetworkStatus.mockReturnValue("online");
    subscribeToNetworkStatus.mockImplementation((callback) => {
      subscriber = callback;
      return jest.fn();
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete window.PeterTecnetTelemetry;
    jest.clearAllMocks();
  });

  test("explains that checkout is preserved while offline", () => {
    render(<ConnectionStatus />);

    act(() => subscriber("offline"));

    expect(screen.getByText("Sem conexão com a internet.")).toBeInTheDocument();
    expect(screen.getByText(/Sua seleção continua preservada/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma nova cobrança será tentada/)).toBeInTheDocument();
    expect(window.PeterTecnetTelemetry.track).toHaveBeenCalledWith(
      "checkout_connectivity_lost",
      expect.objectContaining({ metadata: expect.objectContaining({ automatic_charge: false }) }),
    );
  });

  test("offers a manual resume after connectivity returns without charging automatically", () => {
    const scrollIntoView = jest.fn();
    const paymentSection = document.createElement("section");
    paymentSection.dataset.telemetryContext = "Pagamento";
    paymentSection.scrollIntoView = scrollIntoView;
    document.body.appendChild(paymentSection);

    render(<ConnectionStatus />);
    act(() => subscriber("offline"));
    act(() => subscriber("online"));

    expect(screen.getByText("Conexão restabelecida.")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: "Continuar pagamento" });
    fireEvent.click(continueButton);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(window.PeterTecnetTelemetry.track).toHaveBeenCalledWith(
      "checkout_connectivity_resume_clicked",
      expect.objectContaining({ metadata: expect.objectContaining({ checkout_preserved: true }) }),
    );
    expect(screen.queryByText("Conexão restabelecida.")).not.toBeInTheDocument();

    paymentSection.remove();
  });

  test("keeps the generic offline guidance outside checkout", () => {
    window.history.pushState({}, "", "/event");
    render(<ConnectionStatus />);

    act(() => subscriber("offline"));

    expect(screen.getByText("Algumas ações ficarão indisponíveis até a conexão voltar.")).toBeInTheDocument();
    expect(screen.queryByText(/Sua seleção continua preservada/)).not.toBeInTheDocument();
  });
});
