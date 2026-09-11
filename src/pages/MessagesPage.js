import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import MessagingPreferencesPanel from "../components/MessagingPreferencesPanel";
import messagingService from "../services/MessagingService";
import { reconcileMessageSnapshot } from "../utils/messageReconciliation";
import "./MessagesPage.css";

const POLL_MS = 5000;
const CONVERSATION_POLL_MS = 15000;
const initials = (name = "U") => String(name || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const messageTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
};

function Avatar({ user, size = "md" }) {
  if (user?.avatar) return <img className={`cut-chat-avatar cut-chat-avatar--${size}`} src={user.avatar} alt="" />;
  return <span className={`cut-chat-avatar cut-chat-avatar--${size} cut-chat-avatar--fallback`}>{initials(user?.name || user?.user_name)}</span>;
}

Avatar.propTypes = {
  user: PropTypes.shape({ avatar: PropTypes.string, name: PropTypes.string, user_name: PropTypes.string }),
  size: PropTypes.string,
};

export default function MessagesPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationQuery, setConversationQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [composer, setComposer] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const threadRequestSequence = useRef(0);
  const directOpenedFor = useRef(null);
  const shouldStickToBottom = useRef(true);

  const isNearBottom = useCallback(() => {
    const node = messagesRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    shouldStickToBottom.current = true;
    setHasNewMessages(false);
  }, []);

  const loadConversations = useCallback(async (query = "", { quiet = false } = {}) => {
    try {
      const response = await messagingService.conversations(query ? { q: query } : {});
      setConversations(response?.data || []);
    } catch (requestError) {
      if (!quiet) setError(requestError?.response?.data?.message || "Não foi possível carregar suas conversas.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId, { quiet = false } = {}) => {
    if (!conversationId) return;
    const requestSequence = ++threadRequestSequence.current;
    if (!quiet) setThreadLoading(true);
    try {
      const response = await messagingService.messages(conversationId);
      if (requestSequence !== threadRequestSequence.current) return;
      setMessages((current) => reconcileMessageSnapshot(current, response?.data || []));
      messagingService.markRead(conversationId).catch(() => undefined);
    } catch (requestError) {
      if (!quiet && requestSequence === threadRequestSequence.current) {
        setError(requestError?.response?.data?.message || "Não foi possível abrir a conversa.");
      }
    } finally {
      if (!quiet && requestSequence === threadRequestSequence.current) setThreadLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(""); }, [loadConversations]);

  useEffect(() => {
    document.body.classList.add("cut-chat-open");
    const updateViewport = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--cut-chat-viewport-height", `${Math.round(viewportHeight)}px`);
    };
    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      document.body.classList.remove("cut-chat-open");
      document.documentElement.style.removeProperty("--cut-chat-viewport-height");
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetUserId = Number(params.get("user") || 0);
    if (!targetUserId || targetUserId === Number(user?.id) || directOpenedFor.current === targetUserId) return;
    directOpenedFor.current = targetUserId;
    let cancelled = false;
    setError("");
    setThreadLoading(true);
    messagingService.openDirect(targetUserId)
      .then((response) => {
        if (cancelled) return;
        const conversation = { ...response?.data, unread_count: 0 };
        setActive(conversation);
        loadConversations("", { quiet: true });
        window.history.replaceState({}, "", "/messages");
      })
      .catch((requestError) => {
        if (!cancelled) {
          directOpenedFor.current = null;
          setError(requestError?.response?.data?.message || "Não foi possível iniciar esta conversa.");
        }
      })
      .finally(() => { if (!cancelled) setThreadLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, loadConversations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = Number(params.get("conversation") || 0);
    const engagementToken = String(params.get("engagement") || "").trim();
    let cancelled = false;

    if (engagementToken) {
      messagingService.engagementClick(engagementToken).catch(() => undefined);
    }

    if (!conversationId) {
      if (engagementToken) window.history.replaceState({}, "", "/messages");
      return () => { cancelled = true; };
    }

    setError("");
    setThreadLoading(true);
    messagingService.conversation(conversationId)
      .then((response) => {
        if (cancelled) return;
        setActive({ ...response?.data, unread_count: 0 });
        loadConversations("", { quiet: true });
        window.history.replaceState({}, "", "/messages");
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.response?.data?.message || "Não foi possível abrir esta conversa.");
      })
      .finally(() => { if (!cancelled) setThreadLoading(false); });

    return () => { cancelled = true; };
  }, [loadConversations]);

  useEffect(() => {
    const conversationId = Number(active?.id || 0);
    if (!conversationId) {
      window.sessionStorage.removeItem("cutinapp:activeConversationId");
      return undefined;
    }

    let stopped = false;
    const sync = (isActive) => {
      if (stopped && isActive) return;
      if (isActive) window.sessionStorage.setItem("cutinapp:activeConversationId", String(conversationId));
      else window.sessionStorage.removeItem("cutinapp:activeConversationId");
      messagingService.conversationActivity(conversationId, isActive).catch(() => undefined);
    };

    const updateVisibility = () => sync(document.visibilityState === "visible");
    updateVisibility();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") sync(true);
    }, 30000);
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.sessionStorage.removeItem("cutinapp:activeConversationId");
      messagingService.conversationActivity(conversationId, false).catch(() => undefined);
    };
  }, [active?.id]);

  useEffect(() => {
    threadRequestSequence.current += 1;
    setMessages([]);
    setHasNewMessages(false);
    shouldStickToBottom.current = true;
    if (!active?.id) return undefined;
    loadThread(active.id);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadThread(active.id, { quiet: true });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active?.id, loadThread]);

  useEffect(() => {
    if (!active?.id || threadLoading) return;
    if (shouldStickToBottom.current || isNearBottom()) {
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else {
      setHasNewMessages(true);
    }
  }, [messages, active?.id, threadLoading, isNearBottom, scrollToBottom]);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadConversations(conversationQuery), 250);
    return () => window.clearTimeout(timeout);
  }, [conversationQuery, loadConversations]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadConversations(conversationQuery, { quiet: true });
    }, CONVERSATION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationQuery, loadConversations]);

  useEffect(() => {
    if (!newChatOpen || peopleQuery.trim().length < 2) { setPeople([]); return undefined; }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await messagingService.searchPeople(peopleQuery.trim());
        if (!cancelled) setPeople(response?.data || []);
      } catch (_) { if (!cancelled) setPeople([]); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [newChatOpen, peopleQuery]);

  const orderedMessages = useMemo(() => messages, [messages]);

  const resizeComposer = useCallback((element) => {
    if (!element) return;
    element.style.height = "34px";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, []);

  const openConversation = (conversation) => {
    shouldStickToBottom.current = true;
    setActive(conversation);
    setError("");
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unread_count: 0 } : item));
  };

  const startChat = async (person) => {
    try {
      const response = await messagingService.openDirect(person.id);
      const conversation = { ...response?.data, user: response?.data?.user || person, unread_count: 0 };
      setNewChatOpen(false);
      setPeopleQuery("");
      await loadConversations("");
      shouldStickToBottom.current = true;
      setActive(conversation);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível iniciar a conversa.");
    }
  };

  const openProfile = () => {
    const targetUserId = Number(active?.user?.id || active?.user_id || 0);
    if (targetUserId) navigate(`/profile/${targetUserId}`);
  };

  const send = async (event) => {
    event.preventDefault();
    const body = composer.trim();
    if (!body || !active?.id || sending) return;
    setComposer("");
    setSending(true);
    setError("");
    shouldStickToBottom.current = true;
    resizeComposer(composerRef.current);
    const optimisticId = `local-${Date.now()}`;
    const optimistic = { id: optimisticId, sender_user_id: user?.id, body, created_at: new Date().toISOString(), pending: true };
    setMessages((current) => reconcileMessageSnapshot(current, [optimistic]));
    try {
      const response = await messagingService.send(active.id, body);
      setMessages((current) => reconcileMessageSnapshot(
        current.filter((item) => item.id !== optimisticId),
        response?.data ? [response.data] : [],
      ));
      loadConversations("", { quiet: true });
    } catch (requestError) {
      setMessages((current) => current.map((item) => item.id === optimisticId ? { ...item, pending: false, failed: true } : item));
      setComposer(body);
      setError(requestError?.response?.data?.message || "Mensagem não enviada. Tente novamente.");
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        composerRef.current?.focus({ preventScroll: true });
        resizeComposer(composerRef.current);
      });
    }
  };

  return <div className="cut-chat-page">
    <NavlogComponent />
    <main className={`cut-chat-shell ${active ? "has-thread" : ""}`}>
      <aside className="cut-chat-inbox">
        <header className="cut-chat-inbox__header"><div><span className="cut-chat-eyebrow">Direct</span><h1>Mensagens</h1></div><div className="cut-chat-inbox__actions"><button type="button" className="cut-chat-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Preferências do Direct"><i className="fa-solid fa-sliders" /></button><button type="button" className="cut-chat-icon-button" onClick={() => setNewChatOpen(true)} aria-label="Nova mensagem"><i className="fa-regular fa-pen-to-square" /></button></div></header>
        <label className="cut-chat-search"><i className="fa-solid fa-magnifying-glass" /><input value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} placeholder="Pesquisar conversas" autoComplete="off" /></label>
        <div className="cut-chat-list">
          {loading && <div className="cut-chat-state">Carregando conversas…</div>}
          {!loading && conversations.length === 0 && <div className="cut-chat-state"><i className="fa-regular fa-paper-plane" /><strong>Comece uma conversa</strong><span>Envie uma mensagem para alguém da Cutinapp.</span><button type="button" onClick={() => setNewChatOpen(true)}>Nova mensagem</button></div>}
          {conversations.map((conversation) => <button type="button" key={conversation.id} className={`cut-chat-row ${active?.id === conversation.id ? "is-active" : ""}`} onClick={() => openConversation(conversation)}><Avatar user={conversation.user} /><span className="cut-chat-row__copy"><span className="cut-chat-row__name">{conversation.user?.name || conversation.user?.user_name}</span><span className="cut-chat-row__preview">{conversation.last_message?.body || "Conversa iniciada"}</span></span><span className="cut-chat-row__meta"><time>{messageTime(conversation.updated_at)}</time>{conversation.unread_count > 0 && <b>{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</b>}</span></button>)}
        </div>
      </aside>

      <section className="cut-chat-thread">
        {!active ? <div className="cut-chat-empty"><span className="cut-chat-empty__icon"><i className="fa-regular fa-paper-plane" /></span><h2>Suas mensagens</h2><p>Converse com participantes, produtores, artistas e promoters em um só lugar.</p><button type="button" onClick={() => setNewChatOpen(true)}>Enviar mensagem</button></div> : <>
          <header className="cut-chat-thread__header">
            <button type="button" className="cut-chat-back" onClick={() => setActive(null)} aria-label="Voltar"><i className="fa-solid fa-arrow-left" /></button>
            <button type="button" className="cut-chat-profile-link" onClick={openProfile} aria-label={`Abrir perfil de ${active.user?.name || active.user?.user_name || "usuário"}`}>
              <Avatar user={active.user} size="sm" />
              <span><strong>{active.user?.name || active.user?.user_name}</strong><small>@{active.user?.user_name || "usuario"}</small></span>
            </button>
          </header>

          <div className="cut-chat-messages" ref={messagesRef} onScroll={() => { shouldStickToBottom.current = isNearBottom(); if (shouldStickToBottom.current) setHasNewMessages(false); }}>
            {threadLoading ? <div className="cut-chat-state">Abrindo conversa…</div> : orderedMessages.map((message) => {
              const mine = Number(message.sender_user_id) === Number(user?.id);
              return <div key={message.id} className={`cut-chat-bubble-wrap ${mine ? "is-mine" : ""}`}><div className={`cut-chat-bubble ${message.failed ? "is-failed" : ""}`}><span>{message.body}</span><small>{message.pending ? "Enviando…" : message.failed ? "Falhou" : messageTime(message.created_at)}</small></div></div>;
            })}
          </div>

          {hasNewMessages && <button type="button" className="cut-chat-new-messages" onClick={() => scrollToBottom("smooth")}>Novas mensagens <i className="fa-solid fa-arrow-down" /></button>}
          {error && <div className="cut-chat-error" role="alert" aria-live="polite">{error}</div>}
          <form className="cut-chat-composer" onSubmit={send}>
            <textarea ref={composerRef} rows="1" value={composer} onChange={(event) => { setComposer(event.target.value); resizeComposer(event.currentTarget); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Mensagem…" maxLength={5000} aria-label="Mensagem" autoComplete="off" enterKeyHint="send" />
            <button type="submit" disabled={!composer.trim() || sending} aria-label="Enviar"><i className="fa-solid fa-paper-plane" /></button>
          </form>
        </>}
      </section>
    </main>

    {newChatOpen && <div className="cut-chat-modal-backdrop" role="presentation" onMouseDown={() => setNewChatOpen(false)}><section className="cut-chat-modal" role="dialog" aria-modal="true" aria-label="Nova mensagem" onMouseDown={(event) => event.stopPropagation()}><header><button type="button" onClick={() => setNewChatOpen(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button><strong>Nova mensagem</strong><span /></header><label><span>Para:</span><input autoFocus value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Nome, @usuário ou e-mail" autoComplete="off" /></label><div className="cut-chat-people">{peopleQuery.trim().length < 2 && <div className="cut-chat-state">Digite pelo menos 2 caracteres.</div>}{people.map((person) => <button type="button" key={person.id} onClick={() => startChat(person)}><Avatar user={person} /><span><strong>{person.name || person.user_name}</strong><small>@{person.user_name}{person.email ? ` · ${person.email}` : ""}</small></span></button>)}{peopleQuery.trim().length >= 2 && people.length === 0 && <div className="cut-chat-state">Nenhuma pessoa encontrada.</div>}</div></section></div>}
    {settingsOpen && <MessagingPreferencesPanel onClose={() => setSettingsOpen(false)} />}
  </div>;
}
