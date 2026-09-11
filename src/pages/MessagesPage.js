import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import AudioRecorder from "../components/direct/AudioRecorder";
import DirectCallModal from "../components/direct/DirectCallModal";
import SecureMessageAttachment from "../components/direct/SecureMessageAttachment";
import messagingService from "../services/MessagingService";
import { subscribeToConversation } from "../services/RealtimeMessagingService";
import { reconcileMessageSnapshot } from "../utils/messageReconciliation";
import "./MessagesPage.css";

const FALLBACK_POLL_MS = 30000;
const CONVERSATION_POLL_MS = 30000;
const PRESENCE_POLL_MS = 20000;
const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👏"];

const initials = (name = "U") => String(name || "U")
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const messageTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
};

const messageDay = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (one, two) => one.getFullYear() === two.getFullYear()
    && one.getMonth() === two.getMonth()
    && one.getDate() === two.getDate();

  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, yesterday)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined }).format(date);
};

const clientUuid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `cut-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const conversationTitle = (conversation) => (
  conversation?.type === "group"
    ? (conversation?.title || "Grupo")
    : (conversation?.user?.name || conversation?.user?.user_name || "Usuário")
);

const messagePreview = (message) => {
  if (!message) return "Conversa iniciada";
  if (message.body) return message.body;
  if (message.type === "image") return "Foto";
  if (message.type === "video") return "Vídeo";
  if (message.type === "audio") return "Áudio";
  if (message.type === "file") return "Arquivo";
  if (message.type === "location") return "Localização";
  if (message.type === "share") return "Conteúdo compartilhado";
  return "Mensagem";
};

const parseCallMetadata = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};

const inferMessageType = (files, metadata) => {
  if (metadata?.share_type) return "share";
  if (metadata?.latitude != null && metadata?.longitude != null) return "location";
  if (!files?.length) return "text";
  const firstType = String(files[0]?.type || "");
  if (firstType.startsWith("image/")) return "image";
  if (firstType.startsWith("video/")) return "video";
  if (firstType.startsWith("audio/")) return "audio";
  return "file";
};

function Avatar({ user, size = "md", label }) {
  const name = label || user?.name || user?.user_name || "Usuário";
  if (user?.avatar) return <img className={`cut-chat-avatar cut-chat-avatar--${size}`} src={user.avatar} alt={name} loading="lazy" />;
  return <span className={`cut-chat-avatar cut-chat-avatar--${size} cut-chat-avatar--fallback`}>{initials(name)}</span>;
}

Avatar.propTypes = {
  user: PropTypes.shape({ avatar: PropTypes.string, name: PropTypes.string, user_name: PropTypes.string }),
  size: PropTypes.string,
  label: PropTypes.string,
};

function LocalAttachmentPreview({ file, onRemove }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const kind = String(file.type || "").split("/")[0];
  return (
    <div className="cut-direct-local-file">
      {kind === "image" && url ? <img src={url} alt={file.name} /> : <i className={kind === "video" ? "fa-solid fa-video" : kind === "audio" ? "fa-solid fa-wave-square" : "fa-regular fa-file"} />}
      <span title={file.name}>{file.name}</span>
      <button type="button" onClick={onRemove} aria-label={`Remover ${file.name}`}><i className="fa-solid fa-xmark" /></button>
    </div>
  );
}

LocalAttachmentPreview.propTypes = {
  file: PropTypes.instanceOf(File).isRequired,
  onRemove: PropTypes.func.isRequired,
};

function MessageContent({ message, onOpenImage }) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  return (
    <>
      {message.reply_to && (
        <div className="cut-direct-reply-preview">
          <strong>{message.reply_to.sender_user_id === message.sender_user_id ? "Você" : "Mensagem"}</strong>
          <span>{message.reply_to.body || messagePreview(message.reply_to)}</span>
        </div>
      )}

      {Array.isArray(message.attachments) && message.attachments.length > 0 && (
        <div className={`cut-direct-attachments ${message.attachments.length > 1 ? "is-grid" : ""}`}>
          {message.attachments.map((attachment) => (
            <SecureMessageAttachment key={attachment.id} attachment={attachment} onOpenImage={onOpenImage} />
          ))}
        </div>
      )}

      {message.type === "location" && metadata.latitude != null && metadata.longitude != null && (
        <a
          className="cut-direct-location"
          href={`https://www.google.com/maps?q=${encodeURIComponent(metadata.latitude)},${encodeURIComponent(metadata.longitude)}`}
          target="_blank"
          rel="noreferrer"
        >
          <i className="fa-solid fa-location-dot" />
          <span><strong>Localização compartilhada</strong><small>Abrir no mapa</small></span>
        </a>
      )}

      {message.type === "share" && (
        <a className="cut-direct-share-card" href={metadata.url || "#"} onClick={(event) => { if (!metadata.url) event.preventDefault(); }}>
          {metadata.image && <img src={metadata.image} alt="" loading="lazy" />}
          <span>
            <small>{metadata.share_label || "Compartilhado na Cutinapp"}</small>
            <strong>{metadata.title || "Conteúdo compartilhado"}</strong>
            {metadata.subtitle && <em>{metadata.subtitle}</em>}
          </span>
        </a>
      )}

      {message.body && <div className="cut-direct-message-text">{message.body}</div>}
    </>
  );
}

MessageContent.propTypes = {
  message: PropTypes.shape({
    body: PropTypes.string,
    type: PropTypes.string,
    sender_user_id: PropTypes.number,
    reply_to: PropTypes.object,
    metadata: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    attachments: PropTypes.arrayOf(PropTypes.object),
  }).isRequired,
  onOpenImage: PropTypes.func,
};

function MessageBubble({
  message,
  mine,
  showSender,
  sender,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin,
  onOpenImage,
  currentUserId,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const readBySomeone = Array.isArray(message.receipts) && message.receipts.some((receipt) => receipt.read_at);
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];

  return (
    <div className={`cut-chat-bubble-wrap ${mine ? "is-mine" : ""}`}>
      {!mine && showSender && <span className="cut-direct-sender">{sender?.name || sender?.user_name || "Usuário"}</span>}
      <div className={`cut-chat-bubble ${message.failed ? "is-failed" : ""} ${message.pending ? "is-pending" : ""}`}>
        <MessageContent message={message} onOpenImage={onOpenImage} />

        <div className="cut-direct-message-meta">
          <time>{message.pending ? "Enviando…" : message.failed ? "Falhou" : messageTime(message.created_at)}</time>
          {message.edited_at && <span>Editada</span>}
          {mine && !message.pending && !message.failed && <i className={readBySomeone ? "fa-solid fa-check-double" : "fa-solid fa-check"} title={readBySomeone ? "Vista" : "Enviada"} />}
        </div>

        <button type="button" className="cut-direct-message-more" onClick={() => setActionsOpen((value) => !value)} aria-label="Ações da mensagem">
          <i className="fa-solid fa-ellipsis" />
        </button>

        {actionsOpen && (
          <div className="cut-direct-message-menu">
            <button type="button" onClick={() => { onReply(message); setActionsOpen(false); }}><i className="fa-solid fa-reply" />Responder</button>
            <div className="cut-direct-quick-reactions">
              {QUICK_REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => { onReact(message, emoji); setActionsOpen(false); }}>{emoji}</button>)}
            </div>
            <button type="button" onClick={() => { onPin(message); setActionsOpen(false); }}><i className="fa-solid fa-thumbtack" />Fixar</button>
            {mine && message.type === "text" && !message.pending && <button type="button" onClick={() => { onEdit(message); setActionsOpen(false); }}><i className="fa-regular fa-pen-to-square" />Editar</button>}
            {mine && !message.pending && <button type="button" className="is-danger" onClick={() => { onDelete(message); setActionsOpen(false); }}><i className="fa-regular fa-trash-can" />Cancelar envio</button>}
          </div>
        )}
      </div>

      {reactions.length > 0 && (
        <div className="cut-direct-reactions">
          {reactions.map((reaction) => (
            <button
              type="button"
              key={reaction.emoji}
              className={Array.isArray(reaction.user_ids) && reaction.user_ids.includes(Number(currentUserId)) ? "is-mine" : ""}
              onClick={() => onReact(message, reaction.emoji)}
              title={`${reaction.count} reação(ões)`}
            >
              {reaction.emoji}<small>{reaction.count}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

MessageBubble.propTypes = {
  message: PropTypes.object.isRequired,
  mine: PropTypes.bool.isRequired,
  showSender: PropTypes.bool,
  sender: PropTypes.object,
  onReply: PropTypes.func.isRequired,
  onReact: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onPin: PropTypes.func.isRequired,
  onOpenImage: PropTypes.func,
  currentUserId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export default function MessagesPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadMeta, setThreadMeta] = useState({});
  const [conversationQuery, setConversationQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [newChatMode, setNewChatMode] = useState("direct");
  const [groupTitle, setGroupTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [files, setFiles] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [ephemeral, setEphemeral] = useState(false);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [presence, setPresence] = useState(null);
  const [realtimeState, setRealtimeState] = useState("idle");
  const [lightbox, setLightbox] = useState(null);
  const [recording, setRecording] = useState(false);
  const [callUi, setCallUi] = useState(null);
  const [callSignal, setCallSignal] = useState(null);
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const threadRequestSequence = useRef(0);
  const directOpenedFor = useRef(null);
  const conversationOpenedFor = useRef(null);
  const shouldStickToBottom = useRef(true);
  const typingTimeoutRef = useRef(null);
  const lastTypingState = useRef(false);

  const filterParams = useMemo(() => ({
    ...(filter === "unread" ? { unread: 1 } : {}),
    ...(filter === "pinned" ? { pinned: 1 } : {}),
    ...(filter === "archived" ? { archived: 1 } : {}),
    ...(filter === "requests" ? { requests: 1 } : {}),
  }), [filter]);

  const isNearBottom = useCallback(() => {
    const node = messagesRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight < 140;
  }, []);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    shouldStickToBottom.current = true;
    setHasNewMessages(false);
  }, []);

  const resizeComposer = useCallback((element) => {
    if (!element) return;
    element.style.height = "42px";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, []);

  const loadConversations = useCallback(async (query = "", { quiet = false } = {}) => {
    try {
      const response = await messagingService.conversations({ ...(query ? { q: query } : {}), ...filterParams });
      setConversations(response?.data || []);
    } catch (requestError) {
      if (!quiet) setError(requestError?.response?.data?.message || "Não foi possível carregar suas conversas.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [filterParams]);

  const loadThread = useCallback(async (conversationId, { quiet = false, before = 0, search = "" } = {}) => {
    if (!conversationId) return;
    const requestSequence = ++threadRequestSequence.current;
    if (!quiet && !before) setThreadLoading(true);
    if (before) setHistoryLoading(true);

    try {
      const response = await messagingService.messages(conversationId, {
        ...(before ? { before } : {}),
        ...(search ? { q: search } : {}),
      });
      if (requestSequence !== threadRequestSequence.current) return;
      setThreadMeta(response?.meta || {});
      if (before) {
        setMessages((current) => reconcileMessageSnapshot(response?.data || [], current));
      } else {
        setMessages((current) => reconcileMessageSnapshot(current, response?.data || []));
      }
      messagingService.markRead(conversationId).catch(() => undefined);
    } catch (requestError) {
      if (!quiet && requestSequence === threadRequestSequence.current) {
        setError(requestError?.response?.data?.message || "Não foi possível abrir a conversa.");
      }
    } finally {
      if (!quiet && !before && requestSequence === threadRequestSequence.current) setThreadLoading(false);
      if (before) setHistoryLoading(false);
    }
  }, []);

  const refreshActiveConversation = useCallback(async (conversationId) => {
    try {
      const response = await messagingService.conversation(conversationId);
      if (response?.data) setActive(response.data);
    } catch (_) {}
  }, []);

  const handleRealtime = useCallback((eventName, payload) => {
    if (!active?.id || Number(payload?.conversation_id || active.id) !== Number(active.id)) return;

    if (eventName === "messaging.message.created" && payload.message) {
      const incoming = payload.message;
      setMessages((current) => reconcileMessageSnapshot(current, [incoming]));
      if (Number(incoming.sender_user_id) !== Number(user?.id)) {
        messagingService.markRead(active.id).catch(() => undefined);
      }
      loadConversations(conversationQuery, { quiet: true });
      return;
    }

    if (eventName === "messaging.message.updated" && payload.message) {
      setMessages((current) => current.map((item) => Number(item.id) === Number(payload.message.id) ? { ...item, ...payload.message } : item));
      return;
    }

    if (eventName === "messaging.message.deleted" && payload.message_id) {
      setMessages((current) => current.filter((item) => Number(item.id) !== Number(payload.message_id)));
      loadConversations(conversationQuery, { quiet: true });
      return;
    }

    if (eventName === "messaging.reaction.updated" && payload.message_id) {
      setMessages((current) => current.map((item) => Number(item.id) === Number(payload.message_id) ? { ...item, reactions: payload.reactions || [] } : item));
      return;
    }

    if (eventName === "messaging.typing") {
      const targetId = Number(payload.user_id || 0);
      if (!targetId || targetId === Number(user?.id)) return;
      setTypingUsers((current) => payload.typing
        ? Array.from(new Set([...current, targetId]))
        : current.filter((id) => id !== targetId));
      return;
    }

    if (eventName === "messaging.message.read") {
      if (Number(payload.user_id) !== Number(user?.id)) loadThread(active.id, { quiet: true });
      return;
    }

    if (eventName === "messaging.call.updated" && payload.call) {
      const call = payload.call;
      const metadata = parseCallMetadata(call.metadata);
      setCallSignal(call);
      if (
        call.status === "ringing"
        && metadata.kind === "offer"
        && Number(call.started_by) !== Number(user?.id)
      ) {
        setCallUi((current) => current || {
          mode: "incoming",
          type: call.type === "video" ? "video" : "audio",
          initialCall: call,
        });
      }
      return;
    }

    if (eventName === "messaging.conversation.updated" || eventName === "messaging.pins.updated") {
      refreshActiveConversation(active.id);
      loadConversations(conversationQuery, { quiet: true });
    }
  }, [active?.id, user?.id, loadConversations, conversationQuery, loadThread, refreshActiveConversation]);

  useEffect(() => {
    loadConversations("");
  }, [loadConversations]);

  useEffect(() => {
    document.body.classList.add("cut-chat-open");
    const updateViewport = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--cut-chat-viewport-height", `${Math.round(viewportHeight)}px`);
    };
    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      document.body.classList.remove("cut-chat-open");
      document.documentElement.style.removeProperty("--cut-chat-viewport-height");
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetUserId = Number(params.get("user") || 0);
    const targetConversationId = Number(params.get("conversation") || 0);

    if (targetUserId && targetUserId !== Number(user?.id) && directOpenedFor.current !== targetUserId) {
      directOpenedFor.current = targetUserId;
      setThreadLoading(true);
      messagingService.openDirect(targetUserId)
        .then((response) => {
          if (response?.data) setActive({ ...response.data, unread_count: 0 });
          loadConversations("", { quiet: true });
          window.history.replaceState({}, "", `/messages?conversation=${response?.data?.id || ""}`);
        })
        .catch((requestError) => {
          directOpenedFor.current = null;
          setError(requestError?.response?.data?.message || "Não foi possível iniciar esta conversa.");
        })
        .finally(() => setThreadLoading(false));
      return;
    }

    if (targetConversationId && conversationOpenedFor.current !== targetConversationId) {
      conversationOpenedFor.current = targetConversationId;
      messagingService.conversation(targetConversationId)
        .then((response) => { if (response?.data) setActive(response.data); })
        .catch(() => { conversationOpenedFor.current = null; });
    }
  }, [user?.id, loadConversations]);

  useEffect(() => {
    threadRequestSequence.current += 1;
    setMessages([]);
    setThreadMeta({});
    setMessageQuery("");
    setTypingUsers([]);
    setHasNewMessages(false);
    setDetailsOpen(false);
    shouldStickToBottom.current = true;

    if (!active?.id) return undefined;

    loadThread(active.id);
    const unsubscribe = subscribeToConversation(active.id, handleRealtime, setRealtimeState);
    const fallback = window.setInterval(() => {
      if (document.visibilityState === "visible") loadThread(active.id, { quiet: true });
    }, FALLBACK_POLL_MS);

    return () => {
      unsubscribe?.();
      window.clearInterval(fallback);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [active?.id, loadThread, handleRealtime]);

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
    if (!newChatOpen || peopleQuery.trim().length < 2) {
      setPeople([]);
      return undefined;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await messagingService.searchPeople(peopleQuery.trim());
        if (!cancelled) setPeople(response?.data || []);
      } catch (_) {
        if (!cancelled) setPeople([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [newChatOpen, peopleQuery]);

  useEffect(() => {
    messagingService.heartbeat().catch(() => undefined);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") messagingService.heartbeat().catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const targetId = Number(active?.user?.id || 0);
    if (!active?.id || active?.type !== "direct" || !targetId) {
      setPresence(null);
      return undefined;
    }
    let cancelled = false;
    const update = async () => {
      try {
        const response = await messagingService.presence(targetId);
        if (!cancelled) setPresence(response?.data || null);
      } catch (_) {}
    };
    update();
    const timer = window.setInterval(update, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active?.id, active?.type, active?.user?.id]);

  const openConversation = (conversation) => {
    shouldStickToBottom.current = true;
    setActive(conversation);
    setError("");
    setConversations((current) => current.map((item) => Number(item.id) === Number(conversation.id) ? { ...item, unread_count: 0 } : item));
    window.history.replaceState({}, "", `/messages?conversation=${conversation.id}`);
  };

  const closeThread = () => {
    setActive(null);
    window.history.replaceState({}, "", "/messages");
  };

  const startDirect = async (person) => {
    try {
      const response = await messagingService.openDirect(person.id);
      const conversation = { ...response?.data, user: response?.data?.user || person, unread_count: 0 };
      setNewChatOpen(false);
      setPeopleQuery("");
      setSelectedPeople([]);
      await loadConversations("");
      openConversation(conversation);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível iniciar a conversa.");
    }
  };

  const toggleSelectedPerson = (person) => {
    setSelectedPeople((current) => current.some((item) => Number(item.id) === Number(person.id))
      ? current.filter((item) => Number(item.id) !== Number(person.id))
      : [...current, person]);
  };

  const createGroup = async () => {
    if (!groupTitle.trim() || selectedPeople.length < 1) return;
    try {
      const response = await messagingService.createGroup(groupTitle.trim(), selectedPeople.map((person) => person.id));
      setNewChatOpen(false);
      setPeopleQuery("");
      setSelectedPeople([]);
      setGroupTitle("");
      setNewChatMode("direct");
      await loadConversations("");
      if (response?.data) openConversation(response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível criar o grupo.");
    }
  };

  const openProfile = () => {
    const targetUserId = Number(active?.user?.id || active?.user_id || 0);
    if (targetUserId) navigate(`/profile/${targetUserId}`);
  };

  const notifyTyping = useCallback((value) => {
    if (!active?.id) return;
    if (lastTypingState.current !== value) {
      lastTypingState.current = value;
      messagingService.typing(active.id, value).catch(() => undefined);
    }
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    if (value) {
      typingTimeoutRef.current = window.setTimeout(() => {
        lastTypingState.current = false;
        messagingService.typing(active.id, false).catch(() => undefined);
      }, 1800);
    }
  }, [active?.id]);

  const selectFiles = (incoming) => {
    const next = Array.from(incoming || []).filter(Boolean);
    setFiles((current) => [...current, ...next].slice(0, 10));
    composerRef.current?.focus({ preventScroll: true });
  };

  const send = async (event) => {
    event?.preventDefault?.();
    const body = composer.trim();
    if ((!body && files.length === 0) || !active?.id || sending) return;

    setSending(true);
    setError("");
    notifyTyping(false);
    shouldStickToBottom.current = true;

    const currentFiles = files;
    const currentReply = replyTo;
    const type = inferMessageType(currentFiles, null);
    const uuid = clientUuid();
    const scheduledIso = scheduleAt ? new Date(scheduleAt).toISOString() : null;
    const expiresIso = ephemeral ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    const optimisticId = `local-${uuid}`;
    const optimistic = {
      id: optimisticId,
      client_uuid: uuid,
      sender_user_id: user?.id,
      body: body || null,
      type,
      reply_to_id: currentReply?.id || null,
      reply_to: currentReply ? {
        id: currentReply.id,
        sender_user_id: currentReply.sender_user_id,
        type: currentReply.type,
        body: currentReply.body,
      } : null,
      attachments: [],
      reactions: [],
      receipts: [],
      created_at: new Date().toISOString(),
      pending: true,
    };

    setComposer("");
    setFiles([]);
    setReplyTo(null);
    setScheduleAt("");
    setEphemeral(false);
    setScheduleOpen(false);
    resizeComposer(composerRef.current);
    setMessages((current) => reconcileMessageSnapshot(current, [optimistic]));

    try {
      const response = await messagingService.sendRich(active.id, {
        body,
        type,
        client_uuid: uuid,
        reply_to_id: currentReply?.id || null,
        scheduled_at: scheduledIso,
        expires_at: expiresIso,
      }, currentFiles);

      setMessages((current) => reconcileMessageSnapshot(
        current.filter((item) => item.id !== optimisticId),
        response?.data && !scheduledIso ? [response.data] : [],
      ));
      loadConversations(conversationQuery, { quiet: true });
    } catch (requestError) {
      setMessages((current) => current.map((item) => item.id === optimisticId ? { ...item, pending: false, failed: true } : item));
      setComposer(body);
      setFiles(currentFiles);
      setReplyTo(currentReply);
      setError(requestError?.response?.data?.message || "Mensagem não enviada. Tente novamente.");
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        composerRef.current?.focus({ preventScroll: true });
        resizeComposer(composerRef.current);
      });
    }
  };

  const sendLocation = () => {
    if (!active?.id || !navigator.geolocation) {
      setError("Localização não está disponível neste navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await messagingService.sendRich(active.id, {
          type: "location",
          client_uuid: clientUuid(),
          metadata: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        });
        if (response?.data) setMessages((current) => reconcileMessageSnapshot(current, [response.data]));
      } catch (requestError) {
        setError(requestError?.response?.data?.message || "Não foi possível enviar a localização.");
      }
    }, () => setError("Permita o acesso à localização para compartilhar onde você está."), {
      enableHighAccuracy: false,
      timeout: 10000,
    });
  };

  const reactToMessage = async (message, emoji) => {
    if (!active?.id || String(message.id).startsWith("local-")) return;
    const mine = Array.isArray(message.reactions)
      && message.reactions.some((reaction) => reaction.emoji === emoji && reaction.user_ids?.includes(Number(user?.id)));
    try {
      const response = mine
        ? await messagingService.removeReaction(active.id, message.id, emoji)
        : await messagingService.react(active.id, message.id, emoji);
      setMessages((current) => current.map((item) => Number(item.id) === Number(message.id) ? { ...item, reactions: response?.data || [] } : item));
    } catch (_) {}
  };

  const editMessage = async (message) => {
    const nextBody = window.prompt("Editar mensagem", message.body || "");
    if (nextBody == null || !nextBody.trim() || nextBody.trim() === message.body) return;
    try {
      const response = await messagingService.editMessage(active.id, message.id, nextBody.trim());
      if (response?.data) setMessages((current) => current.map((item) => Number(item.id) === Number(message.id) ? response.data : item));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível editar a mensagem.");
    }
  };

  const deleteMessage = async (message) => {
    if (!window.confirm("Cancelar o envio desta mensagem para todos?")) return;
    try {
      await messagingService.deleteMessage(active.id, message.id);
      setMessages((current) => current.filter((item) => Number(item.id) !== Number(message.id)));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível cancelar o envio.");
    }
  };

  const pinMessage = async (message) => {
    try {
      await messagingService.pinMessage(active.id, message.id, true);
      refreshActiveConversation(active.id);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível fixar a mensagem.");
    }
  };

  const toggleConversationOption = async (key, value) => {
    if (!active?.id) return;
    try {
      const response = await messagingService.updateConversation(active.id, { [key]: value });
      if (response?.data) setActive(response.data);
      loadConversations(conversationQuery, { quiet: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível atualizar a conversa.");
    }
  };

  const acceptMessageRequest = async () => {
    if (!active?.id) return;
    try {
      const response = await messagingService.acceptRequest(active.id);
      if (response?.data) setActive(response.data);
      loadConversations(conversationQuery, { quiet: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível aceitar a solicitação.");
    }
  };

  const rejectMessageRequest = async () => {
    if (!active?.id || !window.confirm("Recusar esta solicitação de mensagem?")) return;
    try {
      await messagingService.rejectRequest(active.id);
      closeThread();
      loadConversations(conversationQuery);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível recusar a solicitação.");
    }
  };

  const archiveConversation = async () => {
    if (!active?.id) return;
    try {
      await messagingService.archive(active.id);
      closeThread();
      loadConversations(conversationQuery);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível arquivar a conversa.");
    }
  };

  const blockUser = async (kind) => {
    const targetId = Number(active?.user?.id || 0);
    if (!targetId) return;
    const label = kind === "restrict" ? "restringir" : "bloquear";
    if (!window.confirm(`Deseja ${label} este usuário?`)) return;
    try {
      await messagingService.block(targetId, kind);
      if (kind === "block") closeThread();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível aplicar esta opção.");
    }
  };

  const reportConversation = async () => {
    if (!active?.id) return;
    const reason = window.prompt("Motivo da denúncia (spam, assédio, conteúdo impróprio, outro)");
    if (!reason?.trim()) return;
    try {
      await messagingService.report(active.id, { reason: reason.trim() });
      setError("Denúncia enviada para análise.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Não foi possível enviar a denúncia.");
    }
  };

  const searchMessages = () => {
    if (!active?.id) return;
    setMessages([]);
    loadThread(active.id, { search: messageQuery.trim() });
  };

  const loadOlder = () => {
    if (!threadMeta?.has_more || !threadMeta?.next_before || historyLoading) return;
    const node = messagesRef.current;
    const previousHeight = node?.scrollHeight || 0;
    loadThread(active.id, { before: threadMeta.next_before, search: messageQuery.trim() })
      .then?.(() => requestAnimationFrame(() => {
        if (node) node.scrollTop = node.scrollHeight - previousHeight;
      }));
  };

  const orderedMessages = useMemo(() => messages, [messages]);
  const participantMap = useMemo(() => {
    const map = new Map();
    (active?.participants || []).forEach((participant) => map.set(Number(participant.id), participant));
    if (active?.user?.id) map.set(Number(active.user.id), active.user);
    return map;
  }, [active]);

  const activeSubtitle = useMemo(() => {
    if (typingUsers.length > 0) return "Digitando…";
    if (active?.type === "group") return `${active?.participants?.length || 0} participantes`;
    if (presence?.online === true) return "Ativo agora";
    if (presence?.last_seen_at) {
      const date = new Date(presence.last_seen_at);
      if (!Number.isNaN(date.getTime())) return `Ativo ${messageTime(date)}`;
    }
    return `@${active?.user?.user_name || "usuario"}`;
  }, [active, presence, typingUsers]);

  return (
    <div className="cut-chat-page">
      <NavlogComponent />
      <main className={`cut-chat-shell ${active ? "has-thread" : ""} ${detailsOpen ? "has-details" : ""}`}>
        <aside className="cut-chat-inbox">
          <header className="cut-chat-inbox__header">
            <div><span className="cut-chat-eyebrow">Direct</span><h1>Mensagens</h1></div>
            <button type="button" className="cut-chat-icon-button" onClick={() => setNewChatOpen(true)} aria-label="Nova mensagem"><i className="fa-regular fa-pen-to-square" /></button>
          </header>

          <label className="cut-chat-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} placeholder="Pesquisar conversas" autoComplete="off" />
          </label>

          <div className="cut-direct-filter-bar" role="tablist" aria-label="Filtros da caixa de entrada">
            {[
              ["all", "Todas"],
              ["unread", "Não lidas"],
              ["pinned", "Fixadas"],
              ["requests", "Solicitações"],
            ].map(([value, label]) => (
              <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>

          <div className="cut-chat-list">
            {loading && <div className="cut-chat-state">Carregando conversas…</div>}
            {!loading && conversations.length === 0 && (
              <div className="cut-chat-state cut-chat-state--empty">
                <i className="fa-regular fa-paper-plane" />
                <strong>Comece uma conversa</strong>
                <span>Envie texto, foto, vídeo ou áudio para alguém da Cutinapp.</span>
                <button type="button" onClick={() => setNewChatOpen(true)}>Nova mensagem</button>
              </div>
            )}
            {conversations.map((conversation) => (
              <button type="button" key={conversation.id} className={`cut-chat-row ${active?.id === conversation.id ? "is-active" : ""}`} onClick={() => openConversation(conversation)}>
                <div className="cut-direct-avatar-wrap">
                  <Avatar user={conversation.user} label={conversationTitle(conversation)} />
                  {conversation.type === "direct" && conversation.user?.id === active?.user?.id && presence?.online && <span className="cut-direct-online-dot" />}
                </div>
                <span className="cut-chat-row__copy">
                  <span className="cut-chat-row__name">{conversationTitle(conversation)} {conversation.pinned && <i className="fa-solid fa-thumbtack" />}</span>
                  <span className={`cut-chat-row__preview ${conversation.unread_count > 0 ? "is-unread" : ""}`}>{messagePreview(conversation.last_message)}</span>
                </span>
                <span className="cut-chat-row__meta">
                  <time>{messageTime(conversation.updated_at)}</time>
                  {conversation.unread_count > 0 && <b>{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</b>}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="cut-chat-thread">
          {!active ? (
            <div className="cut-chat-empty">
              <span className="cut-chat-empty__icon"><i className="fa-regular fa-paper-plane" /></span>
              <h2>Seu Direct evoluiu</h2>
              <p>Converse em tempo real com participantes, produtores, artistas e promoters.</p>
              <button type="button" onClick={() => setNewChatOpen(true)}>Enviar mensagem</button>
            </div>
          ) : (
            <>
              <header className="cut-chat-thread__header">
                <button type="button" className="cut-chat-back" onClick={closeThread} aria-label="Voltar"><i className="fa-solid fa-arrow-left" /></button>
                <button type="button" className="cut-chat-profile-link" onClick={active.type === "direct" ? openProfile : () => setDetailsOpen(true)}>
                  <Avatar user={active.user} size="sm" label={conversationTitle(active)} />
                  <span><strong>{conversationTitle(active)}</strong><small className={typingUsers.length ? "is-typing" : ""}>{activeSubtitle}</small></span>
                </button>
                <div className="cut-direct-header-actions">
                  <span className={`cut-direct-live-state is-${realtimeState}`} title={realtimeState === "subscribed" ? "Tempo real conectado" : "Reconectando"} />
                  {active.type === "direct" && active.request_state !== "pending" && (
                    <>
                      <button type="button" onClick={() => { setCallSignal(null); setCallUi({ mode: "outgoing", type: "audio", initialCall: null }); }} aria-label="Chamada de áudio"><i className="fa-solid fa-phone" /></button>
                      <button type="button" onClick={() => { setCallSignal(null); setCallUi({ mode: "outgoing", type: "video", initialCall: null }); }} aria-label="Chamada de vídeo"><i className="fa-solid fa-video" /></button>
                    </>
                  )}
                  <button type="button" onClick={() => setDetailsOpen((value) => !value)} aria-label="Detalhes da conversa"><i className="fa-solid fa-circle-info" /></button>
                </div>
              </header>

              <div className="cut-direct-thread-tools">
                <form onSubmit={(event) => { event.preventDefault(); searchMessages(); }}>
                  <i className="fa-solid fa-magnifying-glass" />
                  <input value={messageQuery} onChange={(event) => setMessageQuery(event.target.value)} placeholder="Pesquisar nesta conversa" />
                  {messageQuery && <button type="button" onClick={() => { setMessageQuery(""); loadThread(active.id); }} aria-label="Limpar busca"><i className="fa-solid fa-xmark" /></button>}
                </form>
                {active?.pinned_messages?.length > 0 && (
                  <button type="button" className="cut-direct-pinned-summary" onClick={() => setDetailsOpen(true)}>
                    <i className="fa-solid fa-thumbtack" />{active.pinned_messages.length} fixada(s)
                  </button>
                )}
              </div>

              <div
                className="cut-chat-messages"
                ref={messagesRef}
                onScroll={() => {
                  const node = messagesRef.current;
                  shouldStickToBottom.current = isNearBottom();
                  if (shouldStickToBottom.current) setHasNewMessages(false);
                  if (node?.scrollTop < 80) loadOlder();
                }}
              >
                {threadMeta?.has_more && <button type="button" className="cut-direct-load-more" onClick={loadOlder} disabled={historyLoading}>{historyLoading ? "Carregando…" : "Carregar mensagens anteriores"}</button>}
                {threadLoading ? <div className="cut-chat-state">Abrindo conversa…</div> : orderedMessages.map((message, index) => {
                  const mine = Number(message.sender_user_id) === Number(user?.id);
                  const previous = orderedMessages[index - 1];
                  const next = orderedMessages[index + 1];
                  const showDay = !previous || messageDay(previous.created_at) !== messageDay(message.created_at);
                  const showSender = active.type === "group" && (!previous || Number(previous.sender_user_id) !== Number(message.sender_user_id));
                  const compactNext = next && Number(next.sender_user_id) === Number(message.sender_user_id) && messageDay(next.created_at) === messageDay(message.created_at);
                  return (
                    <React.Fragment key={message.id}>
                      {showDay && <div className="cut-direct-day-divider"><span>{messageDay(message.created_at)}</span></div>}
                      <div className={compactNext ? "cut-direct-message-group is-compact" : "cut-direct-message-group"}>
                        <MessageBubble
                          message={message}
                          mine={mine}
                          showSender={showSender}
                          sender={participantMap.get(Number(message.sender_user_id))}
                          onReply={setReplyTo}
                          onReact={reactToMessage}
                          onEdit={editMessage}
                          onDelete={deleteMessage}
                          onPin={pinMessage}
                          onOpenImage={(url, label) => setLightbox({ url, label })}
                          currentUserId={user?.id}
                        />
                      </div>
                    </React.Fragment>
                  );
                })}
                {!threadLoading && orderedMessages.length === 0 && <div className="cut-chat-state cut-chat-state--empty"><i className="fa-regular fa-comments" /><strong>Nenhuma mensagem ainda</strong><span>Envie a primeira mensagem.</span></div>}
              </div>

              {hasNewMessages && <button type="button" className="cut-chat-new-messages" onClick={() => scrollToBottom("smooth")}>Novas mensagens <i className="fa-solid fa-arrow-down" /></button>}
              {error && <div className="cut-chat-error" role="alert" aria-live="polite">{error}<button type="button" onClick={() => setError("")}><i className="fa-solid fa-xmark" /></button></div>}

              {active.request_state === "pending" && (
                <div className="cut-direct-request-banner">
                  <div><i className="fa-regular fa-message" /><span><strong>Solicitação de mensagem</strong><small>Aceite para responder e mover esta conversa para a caixa principal.</small></span></div>
                  <div><button type="button" className="is-secondary" onClick={rejectMessageRequest}>Recusar</button><button type="button" className="is-primary" onClick={acceptMessageRequest}>Aceitar</button></div>
                </div>
              )}

              <div className={`cut-direct-composer-zone ${active.request_state === "pending" ? "is-request-locked" : ""}`}>
                {replyTo && (
                  <div className="cut-direct-composer-reply">
                    <i className="fa-solid fa-reply" />
                    <span><strong>Respondendo</strong><small>{replyTo.body || messagePreview(replyTo)}</small></span>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta"><i className="fa-solid fa-xmark" /></button>
                  </div>
                )}

                {files.length > 0 && (
                  <div className="cut-direct-local-files">
                    {files.map((file, index) => <LocalAttachmentPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} onRemove={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}
                  </div>
                )}

                {scheduleOpen && (
                  <div className="cut-direct-schedule">
                    <i className="fa-regular fa-clock" />
                    <label>Enviar em <input type="datetime-local" value={scheduleAt} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} onChange={(event) => setScheduleAt(event.target.value)} /></label>
                    <label className="cut-direct-toggle"><input type="checkbox" checked={ephemeral} onChange={(event) => setEphemeral(event.target.checked)} /><span />Expirar em 24h</label>
                    <button type="button" onClick={() => { setScheduleOpen(false); setScheduleAt(""); setEphemeral(false); }} aria-label="Fechar agendamento"><i className="fa-solid fa-xmark" /></button>
                  </div>
                )}

                <form className="cut-chat-composer" onSubmit={send}>
                  <input ref={fileInputRef} className="cut-direct-hidden-input" type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.zip" onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />
                  <input ref={cameraInputRef} className="cut-direct-hidden-input" type="file" accept="image/*,video/*" capture="environment" onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />

                  <div className="cut-direct-composer-actions">
                    <button type="button" className="cut-direct-composer__action" onClick={() => fileInputRef.current?.click()} aria-label="Adicionar foto, vídeo, áudio ou arquivo"><i className="fa-regular fa-image" /></button>
                    <button type="button" className="cut-direct-composer__action is-camera" onClick={() => cameraInputRef.current?.click()} aria-label="Abrir câmera"><i className="fa-solid fa-camera" /></button>
                    <AudioRecorder disabled={sending || active.request_state === "pending"} onRecordingChange={setRecording} onReady={(file) => selectFiles([file])} />
                  </div>

                  <textarea
                    ref={composerRef}
                    rows="1"
                    value={composer}
                    onChange={(event) => {
                      setComposer(event.target.value);
                      resizeComposer(event.currentTarget);
                      notifyTyping(Boolean(event.target.value.trim()));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !recording) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={recording ? "Gravando áudio…" : "Mensagem…"}
                    maxLength={5000}
                    aria-label="Mensagem"
                    autoComplete="off"
                    enterKeyHint="send"
                    disabled={recording || active.request_state === "pending"}
                  />

                  <div className="cut-direct-composer-actions is-end">
                    <button type="button" className="cut-direct-composer__action" onClick={sendLocation} aria-label="Compartilhar localização"><i className="fa-solid fa-location-arrow" /></button>
                    <button type="button" className="cut-direct-composer__action" onClick={() => setScheduleOpen((value) => !value)} aria-label="Agendar ou definir mensagem temporária"><i className="fa-regular fa-clock" /></button>
                    <button type="submit" className="cut-direct-send" disabled={active.request_state === "pending" || (!composer.trim() && files.length === 0) || sending || recording} aria-label={scheduleAt ? "Agendar mensagem" : "Enviar"}>
                      <i className={scheduleAt ? "fa-regular fa-clock" : "fa-solid fa-arrow-up"} />
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </section>

        {active && detailsOpen && (
          <aside className="cut-direct-details">
            <header><strong>Detalhes</strong><button type="button" onClick={() => setDetailsOpen(false)}><i className="fa-solid fa-xmark" /></button></header>
            <div className="cut-direct-details__hero">
              <Avatar user={active.user} size="lg" label={conversationTitle(active)} />
              <h2>{conversationTitle(active)}</h2>
              {active.type === "direct" && <span>@{active.user?.user_name || "usuario"}</span>}
            </div>

            <div className="cut-direct-detail-actions">
              <button type="button" onClick={() => toggleConversationOption("pinned", !active.pinned)}><i className="fa-solid fa-thumbtack" /><span>{active.pinned ? "Desafixar" : "Fixar chat"}</span></button>
              <button type="button" onClick={() => toggleConversationOption("muted", !active.muted_until)}><i className={active.muted_until ? "fa-solid fa-bell" : "fa-solid fa-bell-slash"} /><span>{active.muted_until ? "Ativar" : "Silenciar"}</span></button>
              {active.type === "direct" && <button type="button" onClick={openProfile}><i className="fa-regular fa-user" /><span>Perfil</span></button>}
            </div>

            {active?.pinned_messages?.length > 0 && (
              <section className="cut-direct-details-section">
                <h3>Mensagens fixadas</h3>
                {active.pinned_messages.map((message) => <button type="button" key={message.id} className="cut-direct-pinned-item"><i className="fa-solid fa-thumbtack" /><span>{message.body || messagePreview(message)}</span></button>)}
              </section>
            )}

            {active.type === "group" && (
              <section className="cut-direct-details-section">
                <h3>Participantes · {active.participants?.length || 0}</h3>
                {(active.participants || []).map((participant) => (
                  <button type="button" className="cut-direct-participant" key={participant.id} onClick={() => navigate(`/profile/${participant.id}`)}>
                    <Avatar user={participant} size="xs" />
                    <span><strong>{participant.name || participant.user_name}</strong><small>{participant.role === "owner" ? "Criador" : participant.role === "admin" ? "Administrador" : `@${participant.user_name || "usuario"}`}</small></span>
                  </button>
                ))}
              </section>
            )}

            <section className="cut-direct-details-section">
              <h3>Privacidade e segurança</h3>
              <button type="button" onClick={archiveConversation}><i className="fa-solid fa-box-archive" />Arquivar conversa</button>
              {active.type === "direct" && <button type="button" onClick={() => blockUser("restrict")}><i className="fa-solid fa-user-shield" />Restringir</button>}
              {active.type === "direct" && <button type="button" className="is-danger" onClick={() => blockUser("block")}><i className="fa-solid fa-ban" />Bloquear</button>}
              <button type="button" className="is-danger" onClick={reportConversation}><i className="fa-regular fa-flag" />Denunciar</button>
            </section>
          </aside>
        )}
      </main>

      {newChatOpen && (
        <div className="cut-chat-modal-backdrop" role="presentation" onMouseDown={() => setNewChatOpen(false)}>
          <section className="cut-chat-modal" role="dialog" aria-modal="true" aria-label="Nova mensagem" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <button type="button" onClick={() => setNewChatOpen(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
              <strong>{newChatMode === "group" ? "Novo grupo" : "Nova mensagem"}</strong>
              {newChatMode === "group" ? <button type="button" className="is-primary" onClick={createGroup} disabled={!groupTitle.trim() || selectedPeople.length < 1}>Criar</button> : <span />}
            </header>

            <div className="cut-direct-new-mode">
              <button type="button" className={newChatMode === "direct" ? "is-active" : ""} onClick={() => { setNewChatMode("direct"); setSelectedPeople([]); }}>Pessoa</button>
              <button type="button" className={newChatMode === "group" ? "is-active" : ""} onClick={() => setNewChatMode("group")}>Grupo</button>
            </div>

            {newChatMode === "group" && (
              <label className="cut-direct-group-title"><span>Nome:</span><input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={120} placeholder="Nome do grupo" /></label>
            )}

            {selectedPeople.length > 0 && (
              <div className="cut-direct-selected-people">
                {selectedPeople.map((person) => <button type="button" key={person.id} onClick={() => toggleSelectedPerson(person)}><Avatar user={person} size="xs" /><span>{person.name || person.user_name}</span><i className="fa-solid fa-xmark" /></button>)}
              </div>
            )}

            <label className="cut-direct-modal-search"><span>Para:</span><input autoFocus value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Nome, @usuário ou e-mail" autoComplete="off" /></label>
            <div className="cut-chat-people">
              {peopleQuery.trim().length < 2 && <div className="cut-chat-state">Digite pelo menos 2 caracteres.</div>}
              {people.map((person) => (
                <button type="button" key={person.id} onClick={() => newChatMode === "group" ? toggleSelectedPerson(person) : startDirect(person)}>
                  <Avatar user={person} />
                  <span><strong>{person.name || person.user_name}</strong><small>@{person.user_name}{person.email ? ` · ${person.email}` : ""}</small></span>
                  {newChatMode === "group" && <i className={selectedPeople.some((item) => Number(item.id) === Number(person.id)) ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />}
                </button>
              ))}
              {peopleQuery.trim().length >= 2 && people.length === 0 && <div className="cut-chat-state">Nenhuma pessoa encontrada.</div>}
            </div>
          </section>
        </div>
      )}

      {callUi && active?.id && (
        <DirectCallModal
          conversationId={Number(active.id)}
          remoteUser={active.user}
          mode={callUi.mode}
          type={callUi.type}
          initialCall={callUi.initialCall}
          signal={callSignal}
          onClose={() => { setCallUi(null); setCallSignal(null); }}
        />
      )}

      {lightbox && (
        <div className="cut-direct-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <button type="button" onClick={() => setLightbox(null)} aria-label="Fechar imagem"><i className="fa-solid fa-xmark" /></button>
          <img src={lightbox.url} alt={lightbox.label || "Imagem enviada"} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
