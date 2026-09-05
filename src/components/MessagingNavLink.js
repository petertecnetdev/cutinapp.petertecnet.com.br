import React, { useContext, useEffect, useState } from "react";
import { Nav } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import messagingService from "../services/MessagingService";
import { subscribeToMessagingEvents } from "../services/RealtimeMessagingService";
import "./MessagingNavLink.css";

export default function MessagingNavLink() {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const userId = Number(user?.id || 0);

  useEffect(() => {
    if (!userId) {
      setUnread(0);
      return undefined;
    }

    let mounted = true;
    const refresh = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const response = await messagingService.unreadCount();
        if (mounted) setUnread(Number(response?.unread_count || 0));
      } catch (_) {
        // O menu continua utilizável caso o contador esteja temporariamente indisponível.
      }
    };

    const unsubscribe = subscribeToMessagingEvents(userId, {
      onMessage: (payload) => {
        if (Number(payload?.message?.sender_user_id) !== userId) setUnread((current) => current + 1);
      },
      onRead: (payload) => {
        if (Number(payload?.reader_user_id) === userId) refresh();
      },
    });

    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("cutinapp:messages-updated", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      unsubscribe?.();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cutinapp:messages-updated", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);

  return (
    <Nav.Link as={Link} to="/messages" className={location.pathname.startsWith("/messages") ? "active cut-nav-messages" : "cut-nav-messages"}>
      <span className="cut-nav-messages__icon" aria-label={unread ? `${unread} mensagens não lidas` : "Mensagens"}>
        <i className={unread ? "fa-solid fa-paper-plane" : "fa-regular fa-paper-plane"} />
        {unread > 0 && <span className="cut-nav-messages__badge">{unread > 99 ? "99+" : unread}</span>}
      </span>
      <span>Mensagens</span>
    </Nav.Link>
  );
}
