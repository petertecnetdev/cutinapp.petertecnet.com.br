import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import messagingService from "../services/MessagingService";
import { subscribeToConversation } from "../services/MessagingRealtimeService";
import { reconcileMessageSnapshot } from "../utils/messageReconciliation";
import "./MessagesPage.css";
import "./MessagesPageEvolved.css";

const POLL_MS = 15000;
const CONVERSATION_POLL_MS = 30000;
const REACTIONS = ["❤️", "😂", "🔥", "👍", "👏", "😮", "😢"];
const initials = (name = "U") => String(name || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const messageTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
};
const fileKind = (file) => {
  const type = String(file?.type || "");
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
};

function Avatar({ user, size = "md" }) {
  if (user?.avatar) return <img className={`cut-chat-avatar cut-chat-avatar--${size}`} src={user.avatar} alt="" />;
  return <span className={`cut-chat-avatar cut-chat-avatar--${size} cut-chat-avatar--fallback`}>{initials(user?.name || user?.user_name)}</span>;
}
Avatar.propTypes = { user: PropTypes.shape({ avatar: PropTypes.string, name: PropTypes.string, user_name: PropTypes.string }), size: PropTypes.string };

function Attachment({ attachment }) {
  const url = attachment?.url || "";
  if (attachment?.kind === "image") return <a href={url} target="_blank" rel="noreferrer"><img className="cut-chat-attachment-image" src={url} alt={attachment.original_name || "Imagem enviada"} /></a>;
  if (attachment?.kind === "video") return <video className="cut-chat-attachment-video" src={url} controls preload="metadata" />;
  if (attachment?.kind === "audio") return <audio className="cut-chat-attachment-audio" src={url} controls preload="metadata" />;
  return <a className="cut-chat-attachment-file" href={url} target="_blank" rel="noreferrer"><i className="fa-regular fa-file" /><span>{attachment?.original_name || "Arquivo"}</span></a>;
}
Attachment.propTypes = { attachment: PropTypes.object };

export default function MessagesPageEvolved() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationQuery, setConversationQuery] = useState("");
  const [conversationFilter, setConversationFilter] = useState("all");
  const [threadQuery, setThreadQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [composer, setComposer] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("fallback");
  const [recording, setRecording] = useState(false);
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const fileRef = useRef(null);
  const threadRequestSequence = useRef(0);
  const directOpenedFor = useRef(null);
  const shouldStickToBottom = useRef(true);
  const realtimeRef = useRef(null);
  const realtimeStatusRef = useRef("fallback");
  const typingTimerRef = useRef(null);
  const remoteTypingTimerRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);

  const setRealtime = useCallback((value) => {
    realtimeStatusRef.current = value;
    setRealtimeStatus(value);
  }, []);

  const isNearBottom = useCallback(() => {
    const node = messagesRef.current;
    return !node || node.scrollHeight - node.scrollTop - node.clientHeight < 140;
  }, []);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    shouldStickToBottom.current = true;
    setHasNewMessages(false);
  }, []);

  const loadConversations = useCallback(async (query = "", { quiet = false, filter = conversationFilter } = {}) => {
    try {
      const params = { filter };
      if (query.trim()) params.q = query.trim();
      const response = await messagingService.conversations(params);
      setConversations(response?.data || []);
    } catch (requestError) {
      if (!quiet) setError(requestError?.response?.data?.message || "Não foi possível carregar suas conversas.");
    } finally { if (!quiet) setLoading(false); }
  }, [conversationFilter]);

  const loadThread = useCallback(async (conversationId, { quiet = false, q = "" } = {}) => {
    if (!conversationId) return;
    const requestSequence = ++threadRequestSequence.current;
    if (!quiet) setThreadLoading(true);
    try {
      const response = await messagingService.messages(conversationId, q ? { q } : {});
      if (requestSequence !== threadRequestSequence.current) return;
      setMessages(response?.data || []);
      setHasMore(Boolean(response?.meta?.has_more));
      setNextBefore(response?.meta?.next_before || null);
      messagingService.markDelivered(conversationId).catch(() => undefined);
      messagingService.markRead(conversationId).catch(() => undefined);
    } catch (requestError) {
      if (!quiet && requestSequence === threadRequestSequence.current) setError(requestError?.response?.data?.message || "Não foi possível abrir a conversa.");
    } finally { if (!quiet && requestSequence === threadRequestSequence.current) setThreadLoading(false); }
  }, []);

  const loadOlder = useCallback(async () => {
    if (!active?.id || !hasMore || !nextBefore || loadingOlder || threadQuery) return;
    const node = messagesRef.current;
    const previousHeight = node?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const response = await messagingService.messages(active.id, { before: nextBefore });
      const older = response?.data || [];
      setMessages((current) => reconcileMessageSnapshot(older, current));
      setHasMore(Boolean(response?.meta?.has_more));
      setNextBefore(response?.meta?.next_before || null);
      requestAnimationFrame(() => { if (node) node.scrollTop += node.scrollHeight - previousHeight; });
    } catch (_) { setError("Não foi possível carregar mensagens anteriores."); }
    finally { setLoadingOlder(false); }
  }, [active?.id, hasMore, nextBefore, loadingOlder, threadQuery]);

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
    messagingService.openDirect(targetUserId).then((response) => {
      const conversation = { ...response?.data, unread_count: 0 };
      setActive(conversation);
      loadConversations("", { quiet: true });
      window.history.replaceState({}, "", "/messages");
    }).catch((requestError) => {
      directOpenedFor.current = null;
      setError(requestError?.response?.data?.message || "Não foi possível iniciar esta conversa.");
    });
  }, [user?.id, loadConversations]);

  useEffect(() => {
    threadRequestSequence.current += 1;
    setMessages([]); setThreadQuery(""); setReplyingTo(null); setHasNewMessages(false);
    shouldStickToBottom.current = true;
    realtimeRef.current?.close?.();
    realtimeRef.current = null;
    setRealtime("fallback");
    if (!active?.id) return undefined;

    loadThread(active.id);
    const realtime = subscribeToConversation(active.id, {
      onStatus: setRealtime,
      onTyping: (payload) => {
        if (Number(payload?.user_id) === Number(user?.id)) return;
        setTyping(Boolean(payload?.typing));
        if (remoteTypingTimerRef.current) window.clearTimeout(remoteTypingTimerRef.current);
        remoteTypingTimerRef.current = window.setTimeout(() => setTyping(false), 2500);
      },
      onChange: (change) => {
        const event = change?.event;
        const payload = change?.payload;
        if (event === "message.created" && payload) {
          setMessages((current) => reconcileMessageSnapshot(current, [payload]));
          messagingService.markDelivered(active.id).catch(() => undefined);
          if (document.visibilityState === "visible") messagingService.markRead(active.id).catch(() => undefined);
          if (document.visibilityState !== "visible" && Number(payload.sender_user_id) !== Number(user?.id) && window.Notification?.permission === "granted") {
            const notification = new Notification(active.user?.name || "Nova mensagem", { body: payload.body || "Enviou um anexo", tag: `cutinapp-direct-${active.id}` });
            notification.onclick = () => { window.focus(); window.location.assign(`/messages?user=${active.user?.id || ""}`); };
          }
          loadConversations(conversationQuery, { quiet: true });
        } else if (event === "message.updated" && payload) {
          setMessages((current) => current.map((item) => Number(item.id) === Number(payload.id) ? payload : item));
        } else if (event === "message.deleted" && payload?.id) {
          setMessages((current) => current.filter((item) => Number(item.id) !== Number(payload.id)));
        } else if (event === "message.reactions" && payload?.id) {
          setMessages((current) => current.map((item) => Number(item.id) === Number(payload.id) ? { ...item, reactions: payload.reactions || [] } : item));
        } else if (event === "conversation.read") {
          setMessages((current) => current.map((item) => Number(item.sender_user_id) === Number(user?.id) ? { ...item, status: "read" } : item));
        }
      },
    });
    realtimeRef.current = realtime;

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && realtimeStatusRef.current !== "connected") loadThread(active.id, { quiet: true });
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
      realtime?.close?.();
      if (remoteTypingTimerRef.current) window.clearTimeout(remoteTypingTimerRef.current);
    };
  }, [active?.id, active?.user?.id, active?.user?.name, user?.id, loadThread, loadConversations, conversationQuery, setRealtime]);

  useEffect(() => {
    if (!active?.id || threadLoading) return;
    if (shouldStickToBottom.current || isNearBottom()) requestAnimationFrame(() => scrollToBottom("auto"));
    else setHasNewMessages(true);
  }, [messages, active?.id, threadLoading, isNearBottom, scrollToBottom]);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadConversations(conversationQuery), 250);
    return () => window.clearTimeout(timeout);
  }, [conversationQuery, conversationFilter, loadConversations]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") loadConversations(conversationQuery, { quiet: true }); }, CONVERSATION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationQuery, loadConversations]);

  useEffect(() => {
    if (!active?.id) return undefined;
    const timeout = window.setTimeout(() => loadThread(active.id, { q: threadQuery.trim() }), 300);
    return () => window.clearTimeout(timeout);
  }, [threadQuery, active?.id, loadThread]);

  useEffect(() => {
    if (!newChatOpen || peopleQuery.trim().length < 2) { setPeople([]); return undefined; }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try { const response = await messagingService.searchPeople(peopleQuery.trim()); if (!cancelled) setPeople(response?.data || []); }
      catch (_) { if (!cancelled) setPeople([]); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [newChatOpen, peopleQuery]);

  const resizeComposer = useCallback((element) => {
    if (!element) return;
    element.style.height = "34px";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, []);

  const openConversation = (conversation) => {
    shouldStickToBottom.current = true;
    setActive(conversation); setError("");
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unread_count: 0 } : item));
  };

  const startChat = async (person) => {
    try {
      const response = await messagingService.openDirect(person.id);
      setNewChatOpen(false); setPeopleQuery("");
      await loadConversations("");
      setActive({ ...response?.data, user: response?.data?.user || person, unread_count: 0 });
    } catch (requestError) { setError(requestError?.response?.data?.message || "Não foi possível iniciar a conversa."); }
  };

  const sendTyping = () => {
    realtimeRef.current?.typing?.({ user_id: user?.id, typing: true });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => realtimeRef.current?.typing?.({ user_id: user?.id, typing: false }), 1200);
  };

  const send = async (event) => {
    event?.preventDefault?.();
    const body = composer.trim();
    if (!body || !active?.id || sending) return;
    const reply = replyingTo;
    setComposer(""); setReplyingTo(null); setSending(true); setError(""); shouldStickToBottom.current = true;
    const optimisticId = `local-${Date.now()}`;
    setMessages((current) => reconcileMessageSnapshot(current, [{ id: optimisticId, sender_user_id: user?.id, body, reply_to: reply, created_at: new Date().toISOString(), pending: true, status: "sending" }]));
    try {
      const response = await messagingService.send(active.id, body, reply?.id || null);
      setMessages((current) => reconcileMessageSnapshot(current.filter((item) => item.id !== optimisticId), response?.data ? [response.data] : []));
      loadConversations("", { quiet: true });
    } catch (requestError) {
      setMessages((current) => current.map((item) => item.id === optimisticId ? { ...item, pending: false, failed: true, retry_body: body, retry_reply: reply } : item));
      setError(requestError?.response?.data?.message || "Mensagem não enviada. Toque em tentar novamente.");
    } finally {
      setSending(false);
      requestAnimationFrame(() => { composerRef.current?.focus({ preventScroll: true }); resizeComposer(composerRef.current); });
    }
  };

  const retry = (message) => {
    setMessages((current) => current.filter((item) => item.id !== message.id));
    setComposer(message.retry_body || message.body || ""); setReplyingTo(message.retry_reply || null);
    requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
  };

  const sendFiles = async (files, options = {}) => {
    if (!active?.id || !files?.length) return;
    setSending(true); setError(""); shouldStickToBottom.current = true;
    try {
      const response = await messagingService.sendFiles(active.id, {
        files: Array.from(files), body: options.body || "", replyToId: replyingTo?.id || null,
        type: options.type || fileKind(files[0]), durationMs: options.durationMs || null,
      });
      if (response?.data) setMessages((current) => reconcileMessageSnapshot(current, [response.data]));
      setReplyingTo(null); loadConversations("", { quiet: true });
    } catch (requestError) { setError(requestError?.response?.data?.message || "Não foi possível enviar o arquivo."); }
    finally { setSending(false); }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setError("Gravação de áudio não é suportada neste dispositivo.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderChunksRef.current = []; recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data?.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const extension = blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: blob.type || "audio/webm" });
        sendFiles([file], { type: "audio", durationMs: Date.now() - recordingStartedAtRef.current });
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder; recorder.start(); setRecording(true);
    } catch (_) { setError("Não foi possível acessar o microfone."); }
  };
  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); setRecording(false); };

  const editMessage = async (message) => {
    const next = window.prompt("Editar mensagem", message.body || "");
    if (next == null || !next.trim() || next.trim() === message.body) return;
    try { const response = await messagingService.edit(message.id, next.trim()); if (response?.data) setMessages((current) => current.map((item) => item.id === message.id ? response.data : item)); }
    catch (_) { setError("Não foi possível editar a mensagem."); }
  };
  const deleteMessage = async (message) => {
    if (!window.confirm("Excluir esta mensagem para todos?")) return;
    try { await messagingService.remove(message.id); setMessages((current) => current.filter((item) => item.id !== message.id)); }
    catch (_) { setError("Não foi possível excluir a mensagem."); }
  };
  const react = async (message, reaction) => {
    try { const response = await messagingService.react(message.id, reaction); setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reactions: response?.data || [] } : item)); }
    catch (_) { setError("Não foi possível reagir à mensagem."); }
  };

  const updateState = async (state) => {
    if (!active?.id) return;
    try {
      const response = await messagingService.state(active.id, state);
      setActive((current) => ({ ...current, ...(response?.data || {}) }));
      setMenuOpen(false);
      if (state.archived) setActive(null);
      await loadConversations(conversationQuery, { quiet: true });
    } catch (_) { setError("Não foi possível atualizar a conversa."); }
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) return setError("Notificações não são suportadas neste dispositivo.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") setError("Permissão de notificação não concedida.");
  };

  const unreadDividerIndex = useMemo(() => {
    const count = Number(active?.unread_count || 0);
    if (!count) return -1;
    let seen = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (Number(messages[index]?.sender_user_id) !== Number(user?.id)) seen += 1;
      if (seen >= count) return index;
    }
    return -1;
  }, [active?.unread_count, messages, user?.id]);

  return <div className="cut-chat-page">
    <NavlogComponent />
    <main className={`cut-chat-shell ${active ? "has-thread" : ""}`}>
      <aside className="cut-chat-inbox">
        <header className="cut-chat-inbox__header"><div><span className="cut-chat-eyebrow">Direct</span><h1>Mensagens</h1></div><button type="button" className="cut-chat-icon-button" onClick={() => setNewChatOpen(true)} aria-label="Nova mensagem"><i className="fa-regular fa-pen-to-square" /></button></header>
        <label className="cut-chat-search"><i className="fa-solid fa-magnifying-glass" /><input value={conversationQuery} onChange={(e) => setConversationQuery(e.target.value)} placeholder="Pesquisar conversas" autoComplete="off" /></label>
        <div className="cut-chat-filters">{[["all", "Todas"], ["unread", "Não lidas"], ["archived", "Arquivadas"]].map(([value, label]) => <button key={value} type="button" className={conversationFilter === value ? "is-active" : ""} onClick={() => setConversationFilter(value)}>{label}</button>)}</div>
        <div className="cut-chat-list">
          {loading && <div className="cut-chat-state">Carregando conversas…</div>}
          {!loading && conversations.length === 0 && <div className="cut-chat-state"><i className="fa-regular fa-paper-plane" /><strong>Nenhuma conversa aqui</strong><span>Encontre alguém e envie uma mensagem.</span><button type="button" onClick={() => setNewChatOpen(true)}>Nova mensagem</button></div>}
          {conversations.map((conversation) => <button type="button" key={conversation.id} className={`cut-chat-row ${active?.id === conversation.id ? "is-active" : ""}`} onClick={() => openConversation(conversation)}><Avatar user={conversation.user} /><span className="cut-chat-row__copy"><span className="cut-chat-row__name">{conversation.pinned_at && <i className="fa-solid fa-thumbtack cut-chat-pin" />} {conversation.user?.name || conversation.user?.user_name}</span><span className="cut-chat-row__preview">{conversation.last_message?.body || (conversation.last_message?.attachments?.length ? "Anexo" : "Conversa iniciada")}</span></span><span className="cut-chat-row__meta"><time>{messageTime(conversation.updated_at)}</time>{conversation.unread_count > 0 && <b>{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</b>}</span></button>)}
        </div>
      </aside>

      <section className="cut-chat-thread">
        {!active ? <div className="cut-chat-empty"><span className="cut-chat-empty__icon"><i className="fa-regular fa-paper-plane" /></span><h2>Suas mensagens</h2><p>Converse com participantes, produtores, artistas e promoters em um só lugar.</p><button type="button" onClick={() => setNewChatOpen(true)}>Enviar mensagem</button></div> : <>
          <header className="cut-chat-thread__header cut-chat-thread__header--evolved">
            <button type="button" className="cut-chat-back" onClick={() => setActive(null)} aria-label="Voltar"><i className="fa-solid fa-arrow-left" /></button>
            <button type="button" className="cut-chat-profile-link" onClick={() => navigate(`/profile/${active.user?.id}`)}><Avatar user={active.user} size="sm" /><span><strong>{active.user?.name || active.user?.user_name}</strong><small>{typing ? "digitando…" : `@${active.user?.user_name || "usuario"}`} · {realtimeStatus === "connected" ? "tempo real" : "sincronizando"}</small></span></button>
            <button type="button" className="cut-chat-icon-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Opções da conversa"><i className="fa-solid fa-ellipsis-vertical" /></button>
            {menuOpen && <div className="cut-chat-menu">
              <button type="button" onClick={() => navigate(`/profile/${active.user?.id}`)}><i className="fa-regular fa-user" />Ver perfil</button>
              <button type="button" onClick={() => updateState({ pinned: !active.pinned_at })}><i className="fa-solid fa-thumbtack" />{active.pinned_at ? "Desafixar" : "Fixar conversa"}</button>
              <button type="button" onClick={() => updateState({ muted: !active.muted_until })}><i className="fa-regular fa-bell-slash" />{active.muted_until ? "Ativar notificações" : "Silenciar"}</button>
              <button type="button" onClick={() => updateState({ unread: true })}><i className="fa-regular fa-envelope" />Marcar não lida</button>
              <button type="button" onClick={() => updateState({ archived: true })}><i className="fa-solid fa-box-archive" />Arquivar</button>
              <button type="button" onClick={enableNotifications}><i className="fa-regular fa-bell" />Ativar push</button>
            </div>}
          </header>

          <div className="cut-chat-thread-tools"><label><i className="fa-solid fa-magnifying-glass" /><input value={threadQuery} onChange={(e) => setThreadQuery(e.target.value)} placeholder="Buscar nesta conversa" /></label></div>

          <div className="cut-chat-messages" ref={messagesRef} onScroll={(event) => { const node = event.currentTarget; shouldStickToBottom.current = isNearBottom(); if (shouldStickToBottom.current) setHasNewMessages(false); if (node.scrollTop < 80) loadOlder(); }}>
            {hasMore && !threadQuery && <button type="button" className="cut-chat-load-older" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}</button>}
            {threadLoading ? <div className="cut-chat-state">Abrindo conversa…</div> : messages.map((message, index) => {
              const mine = Number(message.sender_user_id) === Number(user?.id);
              return <React.Fragment key={message.id}>
                {index === unreadDividerIndex && <div className="cut-chat-unread-divider"><span>Mensagens não lidas</span></div>}
                <div className={`cut-chat-bubble-wrap ${mine ? "is-mine" : ""}`}>
                  <div className={`cut-chat-bubble cut-chat-bubble--evolved ${message.failed ? "is-failed" : ""}`}>
                    {message.reply_to && <button type="button" className="cut-chat-reply-preview" onClick={() => document.getElementById(`message-${message.reply_to.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><strong>Resposta</strong><span>{message.reply_to.body || message.reply_to.type}</span></button>}
                    <div id={`message-${message.id}`} />
                    {message.metadata?.share && <a className="cut-chat-share-card" href={message.metadata.share.url || "#"}><strong>{message.metadata.share.title || "Conteúdo compartilhado"}</strong><span>{message.metadata.share.subtitle || message.metadata.share.url}</span></a>}
                    {(message.attachments || []).map((attachment) => <Attachment key={attachment.id} attachment={attachment} />)}
                    {message.body && <span className="cut-chat-message-body">{message.body}</span>}
                    <small>{message.pending ? "Enviando…" : message.failed ? "Falhou" : `${messageTime(message.created_at)}${message.edited_at ? " · editada" : ""}${mine ? ` · ${message.status === "read" ? "lida" : message.status === "delivered" ? "entregue" : "enviada"}` : ""}`}</small>
                    <div className="cut-chat-reactions">{(message.reactions || []).map((item) => <button key={item.reaction} type="button" className={item.mine ? "is-mine" : ""} onClick={() => react(message, item.reaction)}>{item.reaction} {item.count}</button>)}</div>
                    {!message.pending && !message.failed && <div className="cut-chat-message-actions"><button type="button" onClick={() => setReplyingTo(message)} title="Responder"><i className="fa-solid fa-reply" /></button>{REACTIONS.slice(0, 4).map((reaction) => <button type="button" key={reaction} onClick={() => react(message, reaction)} title={`Reagir ${reaction}`}>{reaction}</button>)}{mine && <><button type="button" onClick={() => editMessage(message)} title="Editar"><i className="fa-regular fa-pen-to-square" /></button><button type="button" onClick={() => deleteMessage(message)} title="Excluir"><i className="fa-regular fa-trash-can" /></button></>}</div>}
                    {message.failed && <button type="button" className="cut-chat-retry" onClick={() => retry(message)}>Tentar novamente</button>}
                  </div>
                </div>
              </React.Fragment>;
            })}
          </div>

          {hasNewMessages && <button type="button" className="cut-chat-new-messages" onClick={() => scrollToBottom("smooth")}>Novas mensagens <i className="fa-solid fa-arrow-down" /></button>}
          {error && <div className="cut-chat-error" role="alert" aria-live="polite">{error}</div>}
          {replyingTo && <div className="cut-chat-replying"><i className="fa-solid fa-reply" /><span><strong>Respondendo</strong>{replyingTo.body || replyingTo.type}</span><button type="button" onClick={() => setReplyingTo(null)}><i className="fa-solid fa-xmark" /></button></div>}
          <form className="cut-chat-composer cut-chat-composer--evolved" onSubmit={send}>
            <input ref={fileRef} type="file" hidden multiple accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => { const files = event.target.files; if (files?.length) sendFiles(files); event.target.value = ""; }} />
            <button type="button" className="cut-chat-composer-tool" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo"><i className="fa-solid fa-plus" /></button>
            <textarea ref={composerRef} rows="1" value={composer} onChange={(event) => { setComposer(event.target.value); resizeComposer(event.currentTarget); sendTyping(); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Mensagem…" maxLength={5000} aria-label="Mensagem" autoComplete="off" enterKeyHint="send" />
            {!composer.trim() && <button type="button" className={`cut-chat-composer-tool ${recording ? "is-recording" : ""}`} onClick={recording ? stopRecording : startRecording} aria-label={recording ? "Parar gravação" : "Gravar áudio"}><i className={`fa-solid ${recording ? "fa-stop" : "fa-microphone"}`} /></button>}
            <button type="submit" disabled={!composer.trim() || sending} aria-label="Enviar"><i className="fa-solid fa-paper-plane" /></button>
          </form>
        </>}
      </section>
    </main>

    {newChatOpen && <div className="cut-chat-modal-backdrop" role="presentation" onMouseDown={() => setNewChatOpen(false)}><section className="cut-chat-modal" role="dialog" aria-modal="true" aria-label="Nova mensagem" onMouseDown={(event) => event.stopPropagation()}><header><button type="button" onClick={() => setNewChatOpen(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button><strong>Nova mensagem</strong><span /></header><label><span>Para:</span><input autoFocus value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Nome, @usuário ou e-mail" /></label><div className="cut-chat-people">{peopleQuery.trim().length < 2 && <div className="cut-chat-state">Digite pelo menos 2 caracteres.</div>}{people.map((person) => <button type="button" key={person.id} onClick={() => startChat(person)}><Avatar user={person} /><span><strong>{person.name}</strong><small>@{person.user_name}</small></span></button>)}{peopleQuery.trim().length >= 2 && people.length === 0 && <div className="cut-chat-state">Nenhuma pessoa encontrada.</div>}</div></section></div>}
  </div>;
}
