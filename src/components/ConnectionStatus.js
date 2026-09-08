import React, { useEffect, useRef, useState } from "react";
import { getNetworkStatus, subscribeToNetworkStatus } from "../utils/networkStatus";

const RECOVERY_NOTICE_MS = 10000;

const isCheckoutRoute = () => typeof window !== "undefined" && window.location.pathname.startsWith("/checkout/");

const trackCheckoutConnectivity = (type, label) => {
  if (!isCheckoutRoute()) return;
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label,
      target: window.location.pathname,
      metadata: { checkout_preserved: true, automatic_charge: false },
    });
  } catch (_) {
    // Connectivity guidance must never interrupt checkout.
  }
};

export default function ConnectionStatus() {
  const initialStatus = getNetworkStatus();
  const [status, setStatus] = useState(() => initialStatus);
  const [recentlyRestored, setRecentlyRestored] = useState(false);
  const previousStatusRef = useRef(initialStatus);
  const recoveryTimerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus((nextStatus) => {
      const previousStatus = previousStatusRef.current;
      previousStatusRef.current = nextStatus;
      setStatus(nextStatus);

      if (nextStatus === "offline") {
        window.clearTimeout(recoveryTimerRef.current);
        setRecentlyRestored(false);
        trackCheckoutConnectivity("checkout_connectivity_lost", "Conexão perdida durante o checkout");
        return;
      }

      if (previousStatus === "offline" && nextStatus === "online" && isCheckoutRoute()) {
        setRecentlyRestored(true);
        trackCheckoutConnectivity("checkout_connectivity_restored", "Conexão restabelecida durante o checkout");
        window.clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = window.setTimeout(() => setRecentlyRestored(false), RECOVERY_NOTICE_MS);
      }
    });

    return () => {
      window.clearTimeout(recoveryTimerRef.current);
      unsubscribe?.();
    };
  }, []);

  const continueCheckout = () => {
    const paymentSection = document.querySelector('[data-telemetry-context="Pagamento"]');
    paymentSection?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    trackCheckoutConnectivity("checkout_connectivity_resume_clicked", "Comprador retomou pagamento após reconexão");
    setRecentlyRestored(false);
  };

  if (status === "offline") {
    const checkout = isCheckoutRoute();
    return (
      <div className="cut-connection-status" role="status" aria-live="polite" aria-atomic="true">
        <i className="fa-solid fa-wifi" aria-hidden="true" />
        <span>
          <strong>Sem conexão com a internet.</strong>
          <small>{checkout
            ? "Sua seleção continua preservada. Nenhuma nova cobrança será tentada enquanto você estiver offline."
            : "Algumas ações ficarão indisponíveis até a conexão voltar."}</small>
        </span>
      </div>
    );
  }

  if (!recentlyRestored || !isCheckoutRoute()) return null;

  return (
    <div className="cut-connection-status" role="status" aria-live="polite" aria-atomic="true">
      <i className="fa-solid fa-circle-check" aria-hidden="true" />
      <span>
        <strong>Conexão restabelecida.</strong>
        <small>Sua compra continua preservada. Retome o pagamento quando estiver pronto.</small>
      </span>
      <button type="button" className="btn btn-sm btn-light ms-auto" onClick={continueCheckout}>
        Continuar pagamento
      </button>
    </div>
  );
}
