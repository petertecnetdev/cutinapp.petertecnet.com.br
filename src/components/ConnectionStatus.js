import React, { useEffect, useState } from "react";
import { getNetworkStatus, subscribeToNetworkStatus } from "../utils/networkStatus";

export default function ConnectionStatus() {
  const [status, setStatus] = useState(() => getNetworkStatus());

  useEffect(() => subscribeToNetworkStatus(setStatus), []);

  if (status !== "offline") return null;

  return (
    <div className="cut-connection-status" role="status" aria-live="polite" aria-atomic="true">
      <i className="fa-solid fa-wifi" aria-hidden="true" />
      <span>
        <strong>Sem conexão com a internet.</strong>
        <small>Algumas ações ficarão indisponíveis até a conexão voltar.</small>
      </span>
    </div>
  );
}
