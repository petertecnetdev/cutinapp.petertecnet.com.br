import React, { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Collapse } from "react-bootstrap";

const PERMISSION_EVENT = "cutinapp:notification-permission-changed";

const getPermission = () => {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission || "default";
};

const getBrowserHelp = () => {
  if (typeof navigator === "undefined") return [];

  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isEdge = /Edg\//i.test(ua);

  if (isIOS) {
    return [
      "Se a Cutinapp estiver instalada na Tela de Início, abra Ajustes > Notificações > Cutinapp.",
      "Ative Permitir Notificações e volte para a Cutinapp.",
      "Se a Cutinapp ainda não estiver instalada, adicione-a à Tela de Início pelo Safari antes de habilitar notificações web.",
    ];
  }

  if (isAndroid) {
    return [
      "No Chrome, toque nos três pontos e abra Configurações > Configurações do site > Notificações.",
      "Localize a Cutinapp entre os sites bloqueados e altere para Permitir.",
      "Volte para esta tela; a Cutinapp verificará a permissão novamente automaticamente.",
    ];
  }

  if (isFirefox) {
    return [
      "Clique no cadeado ao lado do endereço da Cutinapp.",
      "Abra as permissões do site e remova o bloqueio de Enviar notificações ou marque Permitir.",
      "Volte para esta tela e clique em Verificar novamente se o estado não atualizar sozinho.",
    ];
  }

  return [
    `Clique no ícone ${isEdge ? "de cadeado/configurações" : "de controles ou cadeado"} ao lado do endereço da Cutinapp.`,
    "Abra Configurações do site e altere Notificações para Permitir.",
    "Volte para esta tela; a Cutinapp verificará a permissão automaticamente.",
  ];
};

export default function NotificationPermissionControl({ compact = false }) {
  const [permission, setPermission] = useState(getPermission);
  const [requesting, setRequesting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const browserHelp = useMemo(getBrowserHelp, []);

  const syncPermission = useCallback(() => {
    const next = getPermission();
    setPermission((current) => {
      if (current !== next && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PERMISSION_EVENT, { detail: { permission: next } }));
      }
      return next;
    });
    if (next === "granted") setShowHelp(false);
    return next;
  }, []);

  useEffect(() => {
    if (permission === "unsupported" || typeof window === "undefined") return undefined;

    let permissionStatus;
    let mounted = true;

    const refresh = () => {
      if (mounted) syncPermission();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "notifications" }).then((status) => {
        if (!mounted) return;
        permissionStatus = status;
        permissionStatus.addEventListener?.("change", refresh);
      }).catch(() => {});
    }

    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      permissionStatus?.removeEventListener?.("change", refresh);
    };
  }, [permission, syncPermission]);

  const requestPermission = async () => {
    if (permission === "denied") {
      setShowHelp(true);
      return;
    }
    if (permission === "unsupported" || requesting) return;

    setRequesting(true);
    try {
      const result = await window.Notification.requestPermission();
      setPermission(result);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PERMISSION_EVENT, { detail: { permission: result } }));
      }
      setShowHelp(result === "denied");
    } catch (_) {
      setShowHelp(true);
    } finally {
      setRequesting(false);
    }
  };

  if (permission === "granted") {
    if (compact) return null;
    return (
      <Alert variant="success" className="d-flex align-items-center gap-3 flex-wrap">
        <i className="fa-solid fa-bell" aria-hidden="true" />
        <div className="flex-grow-1">
          <strong>Notificações do navegador ativadas.</strong>
          <div className="small">A Cutinapp pode avisar você sobre novidades importantes quando o navegador permitir.</div>
        </div>
      </Alert>
    );
  }

  if (permission === "unsupported") {
    if (compact) return null;
    return (
      <Alert variant="secondary">
        <strong>Notificações do navegador indisponíveis.</strong>{" "}
        Este navegador ou modo de navegação não oferece suporte à permissão de notificações.
      </Alert>
    );
  }

  const denied = permission === "denied";

  return (
    <Alert variant={denied ? "warning" : "info"} className={compact ? "m-2 p-3" : ""}>
      <div className="d-flex align-items-start gap-3 flex-wrap">
        <i className={`fa-solid ${denied ? "fa-bell-slash" : "fa-bell"} mt-1`} aria-hidden="true" />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <strong>{denied ? "As notificações estão bloqueadas neste navegador." : "Ative as notificações da Cutinapp."}</strong>
          {!compact && (
            <div className="small mt-1">
              {denied
                ? "O navegador não deixa a Cutinapp abrir novamente o aviso depois que Bloquear foi escolhido. Use o botão abaixo para ver como reverter a permissão."
                : "Permita as notificações para não perder atualizações importantes de eventos, ingressos, produções e interações."}
            </div>
          )}
          <div className="d-flex gap-2 flex-wrap mt-2">
            <Button size="sm" variant={denied ? "warning" : "primary"} onClick={requestPermission} disabled={requesting}>
              {requesting ? "Solicitando..." : denied ? "Reativar notificações" : "Permitir notificações"}
            </Button>
            {denied && (
              <Button size="sm" variant="outline-secondary" onClick={syncPermission}>
                Verificar novamente
              </Button>
            )}
          </div>

          <Collapse in={showHelp && denied}>
            <div className="mt-3">
              <div className="fw-semibold mb-1">Como desbloquear:</div>
              <ol className="small mb-2 ps-3">
                {browserHelp.map((step) => <li key={step} className="mb-1">{step}</li>)}
              </ol>
              <div className="small">
                Depois de permitir, volte para a Cutinapp. Esta tela detecta a mudança automaticamente; se necessário, use <strong>Verificar novamente</strong>.
              </div>
            </div>
          </Collapse>
        </div>
      </div>
    </Alert>
  );
}

NotificationPermissionControl.propTypes = {
  compact: PropTypes.bool,
};
