import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import messagingService from "../../services/MessagingService";
import { subscribeToMessagingEvents } from "../../services/RealtimeMessagingService";
import "./ChatPage.css";
import "./ChatAdvanced.css";

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍", "🔥", "👏"];
const REPORT_REASONS = [
  ["spam", "Spam"],
  ["harassment", "Assédio"],
  ["hate", "Discurso de ódio"],
  ["sexual_content", "Conteúdo sexual"],
  ["violence", "Violência"],
  ["scam", "Golpe ou fraude"],
  ["impersonation", "Fingindo ser outra pessoa"],
  ["other", "Outro"],
];

const initials = (person) => {
  const value = person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.user_name || "C";
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
};

const personName = (person) => person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.user_name || "Usuário Cutinapp";

const timeLabel = (value, detailed = false) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", detailed
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }
      : { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
  } catch (_) {
    return "";
  }
};

const dayLabel = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(date);
};

const fileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const localKind = (file) => {
  const type = String(file?.type || "");
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
};

const makeClientToken = () => {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

function Avatar({ person, size = "md" }) {
  return (
    <span className={`cut-chat-avatar cut-chat-avatar--${size}`} aria-hidden="true">
      {person?.avatar ? <img src={person.avatar} alt="" /> : <span>{initials(person)}</span>}
    </span>
  );
}

Avatar.propTypes = {
  person: PropTypes.shape({
    name: PropTypes.string,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    user_name: PropTypes.string,
    avatar: PropTypes.string,
  }),
  size: PropTypes.oneOf(["sm", "md", "lg", "xl"]),
};

Avatar.defaultProps = { person: null, size: "md" };

function SecureAttachment({ conversationId, messageId, attachment }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const isPreviewable = ["image", "video", "audio"].includes(attachment.kind);

  useEffect(() => {
    if (!isPreviewable || attachment.local) return undefined;
    let mounted = true;
    let objectUrl = "";
    setLoading(true);
    setFailed(false);

    messagingService.attachmentBlob(conversationId, messageId, attachment.id)
      .then((blob) => {
        if (!mounted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.kind, attachment.local, conversationId, isPreviewable, messageId]);

  const download = async () => {
    if (attachment.local) return;
    try {
      const blob = await messagingService.attachmentBlob(conversationId, messageId, attachment.id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = attachment.original_name || "arquivo";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
    } catch (_) {
      setFailed(true);
    }
  };

  if (attachment.local) {
    return (
      <div className="cut-chat-attachment cut-chat-attachment--file is-local">
        <i className="fa-regular fa-file" />
        <span><strong>{attachment.original_name}</strong><small>{fileSize(attachment.file_size)}</small></span>
      </div>
    );
  }

  if (loading) return <div className="cut-chat-attachment-loading"><Spinner size="sm" /> Carregando mídia...</div>;
  if (failed) return <button type="button" className="cut-chat-attachment-error" onClick={download}>Não foi possível visualizar. Baixar arquivo.</button>;
  if (attachment.kind === "image" && url) return <button type="button" className="cut-chat-media-button" onClick={download}><img src={url} alt={attachment.original_name || "Imagem enviada"} /></button>;
  if (attachment.kind === "video" && url) return <video className="cut-chat-media" src={url} controls preload="metadata" />;
  if (attachment.kind === "audio" && url) return <audio className="cut-chat-audio" src={url} controls preload="metadata" />;

  return (
    <button type="button" className="cut-chat-attachment cut-chat-attachment--file" onClick={download}>
      <i className="fa-solid fa-arrow-down" />
      <span><strong>{attachment.original_name || "Arquivo"}</strong><small>{fileSize(attachment.file_size)}</small></span>
    </button>
  );
}

SecureAttachment.propTypes = {
  conversationId: PropTypes.number.isRequired,
  messageId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  attachment: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    kind: PropTypes.string,
    original_name: PropTypes.string,
    file_size: PropTypes.number,
    local: PropTypes.bool,
  }).isRequired,
};

export default function ChatPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const currentUserId = Number(user?.id || 0);
  const activeId = Number(conversationId || 0) || null;
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingStopRef = useRef(null);
  const typingRemoteRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const [conversations, setConversations] = useState([]);
  const [threadConversation, setThreadConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagePagination, setMessagePagination] = useState({ current_page: 1, last_page: 1 });
  const [draft, setDraft] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [reactionTargetId, setReactionTargetId] = useState(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [inboxMode, setInboxMode] = useState("all");
  const [showComposer, setShowComposer] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [showThreadSearch, setShowThreadSearch] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchingThread, setSearchingThread] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDescription, setReportDescription] = useState("");
  const [typingUserId, setTypingUserId] = useState(null);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const notifyUnreadChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent("cutinapp:messages-updated"));
  }, []);

  const scrollToBottom = useCallback(() => {
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: "end" }), 0);
  }, []);

  const loadConversations = useCallback(async ({ quiet = false, mode = inboxMode } = {}) => {
    if (!quiet) setLoadingInbox(true);
    try {
      const response = await messagingService.conversations({ per_page: 50, archived: mode === "archived" ? 1 : 0 });
      setConversations(response?.conversations?.data || []);
      setError("");
    } catch (err) {
      if (!quiet) setError(err?.message || "Não foi possível carregar suas conversas.");
    } finally {
      if (!quiet) setLoadingInbox(false);
    }
  }, [inboxMode]);

  useEffect(() => {
    loadConversations({ mode: inboxMode });
  }, [inboxMode, loadConversations]);

  useEffect(() => {
    if (!activeId) {
      setThreadConversation(null);
      setMessages([]);
      setReplyingTo(null);
      setEditingMessage(null);
      return undefined;
    }

    let mounted = true;
    setLoadingThread(true);
    setError("");
    setShowConversationMenu(false);
    setShowThreadSearch(false);
    setThreadSearch("");
    setSearchResults([]);

    messagingService.messages(activeId, { per_page: 40, page: 1 })
      .then(async (response) => {
        if (!mounted) return;
        setThreadConversation(response?.conversation || null);
        setMessages(response?.messages?.data || []);
        setMessagePagination({
          current_page: Number(response?.messages?.current_page || 1),
          last_page: Number(response?.messages?.last_page || 1),
        });
        scrollToBottom();
        try {
          await messagingService.markRead(activeId);
          notifyUnreadChanged();
          loadConversations({ quiet: true });
        } catch (_) { /* leitura não deve impedir a conversa */ }
      })
      .catch((err) => {
        if (mounted) setError(err?.message || "Não foi possível abrir esta conversa.");
      })
      .finally(() => {
        if (mounted) setLoadingThread(false);
      });

    return () => { mounted = false; };
  }, [activeId, loadConversations, notifyUnreadChanged, scrollToBottom]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    return subscribeToMessagingEvents(currentUserId, {
      onMessage: (payload) => {
        const incoming = payload?.message;
        const incomingConversationId = Number(payload?.conversation_id || incoming?.conversation_id || 0);
        if (!incomingConversationId || !incoming) return;

        if (incomingConversationId === activeId) {
          setMessages((current) => {
            const withoutTemporaryDuplicate = current.filter((item) => !item.client_token || item.client_token !== incoming.client_token || !String(item.id).startsWith("temp:"));
            return withoutTemporaryDuplicate.some((item) => Number(item.id) === Number(incoming.id))
              ? withoutTemporaryDuplicate.map((item) => Number(item.id) === Number(incoming.id) ? incoming : item)
              : [...withoutTemporaryDuplicate, incoming];
          });
          setTypingUserId(null);
          scrollToBottom();
          if (Number(incoming.sender_user_id) !== currentUserId) {
            messagingService.markRead(incomingConversationId)
              .then(() => notifyUnreadChanged())
              .catch(() => {});
          }
        } else if (Number(incoming.sender_user_id) !== currentUserId) {
          notifyUnreadChanged();
        }
        loadConversations({ quiet: true });
      },
      onMessageChanged: (payload) => {
        const changed = payload?.message;
        if (!changed || Number(payload?.conversation_id) !== activeId) return;
        setMessages((current) => current.map((item) => Number(item.id) === Number(changed.id) ? changed : item));
        loadConversations({ quiet: true });
      },
      onRead: (payload) => {
        if (Number(payload?.conversation_id) !== activeId) return;
        setThreadConversation((current) => current ? {
          ...current,
          participants: (current.participants || []).map((participant) => Number(participant.id) === Number(payload.reader_user_id)
            ? { ...participant, last_read_at: payload.read_at }
            : participant),
        } : current);
      },
      onTyping: (payload) => {
        if (Number(payload?.conversation_id) !== activeId || Number(payload?.user_id) === currentUserId) return;
        window.clearTimeout(typingRemoteRef.current);
        if (payload?.is_typing) {
          setTypingUserId(Number(payload.user_id));
          typingRemoteRef.current = window.setTimeout(() => setTypingUserId(null), 3500);
        } else {
          setTypingUserId(null);
        }
      },
    });
  }, [activeId, currentUserId, loadConversations, notifyUnreadChanged, scrollToBottom]);

  useEffect(() => () => {
    window.clearTimeout(typingStopRef.current);
    window.clearTimeout(typingRemoteRef.current);
  }, []);

  useEffect(() => {
    if (!activeId || editingMessage || threadConversation?.is_blocked) return undefined;
    window.clearTimeout(typingStopRef.current);

    if (draft.trim()) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 1400) {
        lastTypingSentRef.current = now;
        messagingService.typing(activeId, true).catch(() => {});
      }
      typingStopRef.current = window.setTimeout(() => messagingService.typing(activeId, false).catch(() => {}), 1800);
    } else {
      messagingService.typing(activeId, false).catch(() => {});
    }

    return () => window.clearTimeout(typingStopRef.current);
  }, [activeId, draft, editingMessage, threadConversation?.is_blocked]);

  useEffect(() => {
    if (!showComposer) return undefined;
    let mounted = true;
    const timer = window.setTimeout(async () => {
      setLoadingPeople(true);
      try {
        const response = await messagingService.people({ q: peopleSearch.trim(), per_page: 24 });
        if (mounted) setPeople(response?.people || []);
      } catch (_) {
        if (mounted) setPeople([]);
      } finally {
        if (mounted) setLoadingPeople(false);
      }
    }, 250);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [peopleSearch, showComposer]);

  useEffect(() => {
    if (!showThreadSearch || !activeId || threadSearch.trim().length < 2) {
      setSearchResults([]);
      setSearchingThread(false);
      return undefined;
    }

    let mounted = true;
    const timer = window.setTimeout(async () => {
      setSearchingThread(true);
      try {
        const response = await messagingService.searchMessages(activeId, threadSearch.trim());
        if (mounted) setSearchResults(response?.messages || []);
      } catch (_) {
        if (mounted) setSearchResults([]);
      } finally {
        if (mounted) setSearchingThread(false);
      }
    }, 300);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [activeId, showThreadSearch, threadSearch]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      setReactionTargetId(null);
      setDeleteTargetId(null);
      setShowConversationMenu(false);
      setShowReport(false);
      setReplyingTo(null);
      if (editingMessage) {
        setEditingMessage(null);
        setDraft("");
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [editingMessage]);

  const filteredConversations = useMemo(() => {
    const term = conversationSearch.trim().toLocaleLowerCase("pt-BR");
    return conversations.filter((conversation) => {
      if (inboxMode === "unread" && Number(conversation.unread_count || 0) === 0) return false;
      if (!term) return true;
      const person = conversation.other_users?.[0];
      const lastMessage = conversation.last_message?.is_deleted ? "mensagem removida" : conversation.last_message?.body || "";
      return `${personName(person)} ${person?.user_name || ""} ${lastMessage}`.toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [conversationSearch, conversations, inboxMode]);

  const activeConversation = threadConversation || conversations.find((conversation) => Number(conversation.id) === activeId) || null;
  const otherPerson = activeConversation?.other_users?.[0] || activeConversation?.participants?.find((participant) => Number(participant.id) !== currentUserId) || null;
  const otherParticipant = activeConversation?.participants?.find((participant) => Number(participant.id) !== currentUserId) || null;
  const lastOwnMessage = [...messages].reverse().find((message) => Number(message.sender_user_id) === currentUserId && !message.is_deleted) || null;
  const seen = Boolean(lastOwnMessage?.created_at && otherParticipant?.last_read_at && new Date(otherParticipant.last_read_at).getTime() >= new Date(lastOwnMessage.created_at).getTime());
  const canLoadOlder = messagePagination.current_page < messagePagination.last_page;

  const openConversation = (id) => {
    setShowComposer(false);
    navigate(`/messages/${id}`);
  };

  const startConversation = async (person) => {
    if (!person?.id) return;
    setError("");
    try {
      const response = await messagingService.createDirect(person.id);
      const conversation = response?.conversation;
      if (!conversation?.id) throw new Error("Conversa inválida.");
      setShowComposer(false);
      setPeopleSearch("");
      await loadConversations({ quiet: true });
      navigate(`/messages/${conversation.id}`);
    } catch (err) {
      setError(err?.message || "Não foi possível iniciar a conversa.");
    }
  };

  const loadOlder = async () => {
    if (!activeId || !canLoadOlder || loadingOlder) return;
    const container = messagesContainerRef.current;
    const previousHeight = container?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const nextPage = messagePagination.current_page + 1;
      const response = await messagingService.messages(activeId, { per_page: 40, page: nextPage });
      const older = response?.messages?.data || [];
      setMessages((current) => {
        const ids = new Set(current.map((item) => String(item.id)));
        return [...older.filter((item) => !ids.has(String(item.id))), ...current];
      });
      setMessagePagination({
        current_page: Number(response?.messages?.current_page || nextPage),
        last_page: Number(response?.messages?.last_page || nextPage),
      });
      window.setTimeout(() => {
        if (container) container.scrollTop = container.scrollHeight - previousHeight;
      }, 0);
    } catch (err) {
      setError(err?.message || "Não foi possível carregar mensagens anteriores.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleFiles = (event) => {
    const incoming = Array.from(event.target.files || []);
    const accepted = incoming.filter((file) => file.size <= 20 * 1024 * 1024);
    if (accepted.length !== incoming.length) setNotice("Arquivos acima de 20 MB foram ignorados.");
    setSelectedFiles((current) => [...current, ...accepted].slice(0, 4));
    event.target.value = "";
  };

  const sendPayload = async ({ body, files, reply, token, temporaryId }) => {
    try {
      const response = await messagingService.send(activeId, {
        body,
        attachments: files,
        replyToMessageId: reply?.id || null,
        clientToken: token,
      });
      const serverMessage = response?.message;
      if (serverMessage) {
        setMessages((current) => current.map((item) => item.id === temporaryId ? serverMessage : item));
      }
      loadConversations({ quiet: true });
      scrollToBottom();
    } catch (err) {
      setMessages((current) => current.map((item) => item.id === temporaryId ? { ...item, delivery_status: "failed", _retryFiles: files, _retryReply: reply } : item));
      setError(err?.message || "Não foi possível enviar a mensagem.");
    }
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!activeId || sending || threadConversation?.is_blocked) return;

    if (editingMessage) {
      if (!body) return;
      setSending(true);
      try {
        const response = await messagingService.updateMessage(activeId, editingMessage.id, body);
        if (response?.message) setMessages((current) => current.map((item) => Number(item.id) === Number(response.message.id) ? response.message : item));
        setEditingMessage(null);
        setDraft("");
      } catch (err) {
        setError(err?.message || "Não foi possível editar a mensagem.");
      } finally {
        setSending(false);
      }
      return;
    }

    if (!body && selectedFiles.length === 0) return;
    const token = makeClientToken();
    const temporaryId = `temp:${token}`;
    const files = [...selectedFiles];
    const reply = replyingTo;
    const optimistic = {
      id: temporaryId,
      conversation_id: activeId,
      sender_user_id: currentUserId,
      body,
      type: files.length ? (body ? "mixed" : "media") : "text",
      client_token: token,
      created_at: new Date().toISOString(),
      sender: user,
      reply_to: reply ? {
        id: reply.id,
        sender_user_id: reply.sender_user_id,
        body: reply.body,
        type: reply.type,
        is_deleted: reply.is_deleted,
        sender: reply.sender,
      } : null,
      attachments: files.map((file, index) => ({ id: `local-${index}`, kind: localKind(file), original_name: file.name, file_size: file.size, local: true })),
      reactions: [],
      delivery_status: "sending",
    };

    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setSelectedFiles([]);
    setReplyingTo(null);
    scrollToBottom();
    setSending(true);
    await sendPayload({ body, files, reply, token, temporaryId });
    setSending(false);
  };

  const retryMessage = async (message) => {
    const files = message._retryFiles || [];
    const reply = message._retryReply || null;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, delivery_status: "sending" } : item));
    await sendPayload({
      body: message.body || "",
      files,
      reply,
      token: message.client_token,
      temporaryId: message.id,
    });
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const beginReply = (message) => {
    if (message.is_deleted || String(message.id).startsWith("temp:")) return;
    setReplyingTo(message);
    setEditingMessage(null);
    textareaRef.current?.focus();
  };

  const beginEdit = (message) => {
    if (message.is_deleted || String(message.id).startsWith("temp:")) return;
    setEditingMessage(message);
    setReplyingTo(null);
    setSelectedFiles([]);
    setDraft(message.body || "");
    textareaRef.current?.focus();
  };

  const removeMessage = async (messageId) => {
    if (!activeId) return;
    try {
      const response = await messagingService.deleteMessage(activeId, messageId);
      if (response?.message) setMessages((current) => current.map((item) => Number(item.id) === Number(messageId) ? response.message : item));
      setDeleteTargetId(null);
      loadConversations({ quiet: true });
    } catch (err) {
      setError(err?.message || "Não foi possível remover a mensagem.");
    }
  };

  const reactToMessage = async (messageId, emoji) => {
    setReactionTargetId(null);
    try {
      const response = await messagingService.react(activeId, messageId, emoji);
      if (response?.message) setMessages((current) => current.map((item) => Number(item.id) === Number(messageId) ? response.message : item));
    } catch (err) {
      setError(err?.message || "Não foi possível reagir à mensagem.");
    }
  };

  const updateConversation = async (preferences, message) => {
    try {
      const response = await messagingService.updateConversation(activeId, preferences);
      if (response?.conversation) setThreadConversation(response.conversation);
      setShowConversationMenu(false);
      setNotice(message || "Conversa atualizada.");
      loadConversations({ quiet: true });
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar a conversa.");
    }
  };

  const toggleBlock = async () => {
    if (!otherPerson?.id) return;
    try {
      if (threadConversation?.blocked_by_me) {
        await messagingService.unblockUser(otherPerson.id);
        setNotice("Usuário desbloqueado.");
      } else {
        await messagingService.blockUser(otherPerson.id);
        setNotice("Usuário bloqueado. Ele não poderá trocar mensagens com você.");
      }
      const response = await messagingService.messages(activeId, { per_page: 40, page: 1 });
      setThreadConversation(response?.conversation || null);
      setMessages(response?.messages?.data || []);
      setShowConversationMenu(false);
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar o bloqueio.");
    }
  };

  const submitReport = async () => {
    if (!otherPerson?.id) return;
    try {
      await messagingService.reportUser(otherPerson.id, {
        reason: reportReason,
        description: reportDescription.trim() || null,
        conversation_id: activeId,
      });
      setShowReport(false);
      setReportDescription("");
      setNotice("Denúncia enviada para análise.");
    } catch (err) {
      setError(err?.message || "Não foi possível enviar a denúncia.");
    }
  };

  const scrollToSearchResult = (message) => {
    setShowThreadSearch(false);
    const loaded = messages.some((item) => Number(item.id) === Number(message.id));
    if (!loaded) {
      setNotice("Esse resultado está em uma parte antiga da conversa. Use “Carregar anteriores” para chegar até ele.");
      return;
    }
    window.setTimeout(() => document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  return (
    <>
      <NavlogComponent />
      <main className="cut-chat-page">
        {error && <Alert variant="danger" className="cut-chat-alert" dismissible onClose={() => setError("")}>{error}</Alert>}
        {notice && <Alert variant="info" className="cut-chat-alert" dismissible onClose={() => setNotice("")}>{notice}</Alert>}

        <div className={`cut-chat-shell ${activeId ? "has-active" : ""}`}>
          <aside className="cut-chat-inbox" aria-label="Caixa de entrada">
            <div className="cut-chat-inbox__head">
              <div><span className="cut-chat-eyebrow">Cutinapp Social</span><h1>Mensagens</h1></div>
              <button type="button" className="cut-chat-icon-btn" onClick={() => setShowComposer(true)} aria-label="Nova mensagem" title="Nova mensagem"><i className="fa-regular fa-pen-to-square" /></button>
            </div>

            <div className="cut-chat-inbox-tabs" role="tablist" aria-label="Filtros de mensagens">
              {[['all', 'Todas'], ['unread', 'Não lidas'], ['archived', 'Arquivadas']].map(([value, label]) => (
                <button type="button" key={value} className={inboxMode === value ? "is-active" : ""} onClick={() => setInboxMode(value)}>{label}</button>
              ))}
            </div>

            <label className="cut-chat-search"><i className="fa-solid fa-magnifying-glass" /><input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Pesquisar mensagens" aria-label="Pesquisar conversas" /></label>

            <div className="cut-chat-conversation-list">
              {loadingInbox ? <div className="cut-chat-state"><Spinner size="sm" /><span>Carregando conversas...</span></div> : filteredConversations.length === 0 ? (
                <div className="cut-chat-empty"><span className="cut-chat-empty__icon"><i className="fa-regular fa-paper-plane" /></span><strong>{inboxMode === "archived" ? "Nenhuma conversa arquivada" : "Comece uma conversa"}</strong><p>Troque informações sobre eventos, artistas, produções e interesses com outras pessoas da Cutinapp.</p>{inboxMode !== "archived" && <button type="button" onClick={() => setShowComposer(true)}>Enviar mensagem</button>}</div>
              ) : filteredConversations.map((conversation) => {
                const person = conversation.other_users?.[0];
                const unread = Number(conversation.unread_count || 0);
                return (
                  <button type="button" key={conversation.id} className={`cut-chat-conversation ${Number(conversation.id) === activeId ? "is-active" : ""} ${unread ? "is-unread" : ""}`} onClick={() => openConversation(conversation.id)}>
                    <Avatar person={person} size="lg" />
                    <span className="cut-chat-conversation__body">
                      <span className="cut-chat-conversation__top"><strong>{conversation.is_pinned && <i className="fa-solid fa-thumbtack cut-chat-pin" />} {personName(person)}</strong><time>{timeLabel(conversation.last_message_at || conversation.last_message?.created_at)}</time></span>
                      <span className="cut-chat-conversation__preview"><span>{conversation.last_message?.is_deleted ? "Mensagem removida" : conversation.last_message?.body || (conversation.last_message?.attachments?.length ? "Mídia" : "Nova conversa")}</span>{conversation.is_muted && <i className="fa-solid fa-bell-slash" />}{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="cut-chat-thread" aria-label="Conversa">
            {!activeId ? (
              <div className="cut-chat-thread-empty"><span><i className="fa-regular fa-paper-plane" /></span><h2>Suas mensagens</h2><p>Converse diretamente com participantes, produtores, artistas e outras pessoas que usam a Cutinapp.</p><button type="button" onClick={() => setShowComposer(true)}>Enviar mensagem</button></div>
            ) : loadingThread ? <div className="cut-chat-state cut-chat-state--thread"><Spinner /><span>Abrindo conversa...</span></div> : (
              <>
                <header className="cut-chat-thread__head">
                  <button type="button" className="cut-chat-back" onClick={() => navigate("/messages")} aria-label="Voltar para mensagens"><i className="fa-solid fa-arrow-left" /></button>
                  <Avatar person={otherPerson} size="md" />
                  <div className="cut-chat-thread__identity"><strong>{personName(otherPerson)}</strong><span>{typingUserId ? "digitando..." : otherPerson?.user_name ? `@${otherPerson.user_name}` : [otherPerson?.city, otherPerson?.uf].filter(Boolean).join(" · ") || "Na Cutinapp"}</span></div>
                  <div className="cut-chat-thread-actions">
                    <button type="button" onClick={() => setShowThreadSearch((value) => !value)} aria-label="Pesquisar na conversa"><i className="fa-solid fa-magnifying-glass" /></button>
                    <button type="button" onClick={() => setShowConversationMenu((value) => !value)} aria-label="Opções da conversa"><i className="fa-solid fa-circle-info" /></button>
                  </div>
                  {showConversationMenu && (
                    <div className="cut-chat-thread-menu">
                      <button type="button" onClick={() => updateConversation({ pinned: !threadConversation?.is_pinned }, threadConversation?.is_pinned ? "Conversa desafixada." : "Conversa fixada.")}><i className="fa-solid fa-thumbtack" />{threadConversation?.is_pinned ? "Desafixar" : "Fixar conversa"}</button>
                      <button type="button" onClick={() => updateConversation({ muted_until: threadConversation?.is_muted ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() }, threadConversation?.is_muted ? "Notificações reativadas." : "Conversa silenciada por 8 horas.")}><i className={`fa-solid ${threadConversation?.is_muted ? "fa-bell" : "fa-bell-slash"}`} />{threadConversation?.is_muted ? "Reativar notificações" : "Silenciar por 8h"}</button>
                      <button type="button" onClick={() => updateConversation({ archived: !threadConversation?.is_archived }, threadConversation?.is_archived ? "Conversa restaurada." : "Conversa arquivada.")}><i className="fa-solid fa-box-archive" />{threadConversation?.is_archived ? "Restaurar conversa" : "Arquivar conversa"}</button>
                      <button type="button" className="is-danger" onClick={toggleBlock}><i className="fa-solid fa-ban" />{threadConversation?.blocked_by_me ? "Desbloquear usuário" : "Bloquear usuário"}</button>
                      <button type="button" className="is-danger" onClick={() => { setShowReport(true); setShowConversationMenu(false); }}><i className="fa-regular fa-flag" />Denunciar</button>
                    </div>
                  )}
                </header>

                {showThreadSearch && (
                  <div className="cut-chat-thread-search-panel">
                    <label><i className="fa-solid fa-magnifying-glass" /><input autoFocus value={threadSearch} onChange={(event) => setThreadSearch(event.target.value)} placeholder="Pesquisar nesta conversa" /></label>
                    <button type="button" onClick={() => { setShowThreadSearch(false); setThreadSearch(""); setSearchResults([]); }} aria-label="Fechar pesquisa"><i className="fa-solid fa-xmark" /></button>
                    {threadSearch.trim().length >= 2 && <div className="cut-chat-search-results">{searchingThread ? <span><Spinner size="sm" /> Pesquisando...</span> : searchResults.length === 0 ? <span>Nenhuma mensagem encontrada.</span> : searchResults.map((message) => <button type="button" key={message.id} onClick={() => scrollToSearchResult(message)}><strong>{personName(message.sender)}</strong><small>{message.body || message.attachments?.[0]?.original_name || "Mídia"}</small><time>{timeLabel(message.created_at, true)}</time></button>)}</div>}
                  </div>
                )}

                {threadConversation?.is_blocked && <div className="cut-chat-blocked-banner"><i className="fa-solid fa-ban" /><span>As mensagens estão bloqueadas nesta conversa. Você ainda pode consultar o histórico.</span></div>}

                <div className="cut-chat-messages" ref={messagesContainerRef}>
                  <div className="cut-chat-thread-profile"><Avatar person={otherPerson} size="xl" /><strong>{personName(otherPerson)}</strong>{otherPerson?.user_name && <span>@{otherPerson.user_name}</span>}{otherPerson?.about && <p>{otherPerson.about}</p>}</div>
                  {canLoadOlder && <div className="cut-chat-load-older"><button type="button" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? <><Spinner size="sm" /> Carregando...</> : "Carregar mensagens anteriores"}</button></div>}
                  {messages.length === 0 && <div className="cut-chat-day-divider"><span>Esta é uma nova conversa</span></div>}

                  {messages.map((message, index) => {
                    const mine = Number(message.sender_user_id) === currentUserId;
                    const previous = messages[index - 1];
                    const grouped = previous && Number(previous.sender_user_id) === Number(message.sender_user_id) && !message.is_deleted && !previous.is_deleted && Math.abs(new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()) < 5 * 60 * 1000;
                    const showDay = !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at);
                    const temporary = String(message.id).startsWith("temp:");
                    return (
                      <React.Fragment key={message.id}>
                        {showDay && <div className="cut-chat-day-divider"><span>{dayLabel(message.created_at)}</span></div>}
                        <div id={`message-${message.id}`} className={`cut-chat-message-row ${mine ? "is-mine" : "is-theirs"} ${grouped ? "is-grouped" : ""} ${message.delivery_status === "failed" ? "is-failed" : ""}`}>
                          {!mine && !grouped ? <Avatar person={message.sender || otherPerson} size="sm" /> : !mine ? <span className="cut-chat-avatar-spacer" /> : null}
                          <div className="cut-chat-message-stack">
                            {!message.is_deleted && !temporary && (
                              <div className="cut-chat-message-actions">
                                <button type="button" onClick={() => beginReply(message)} title="Responder"><i className="fa-solid fa-reply" /></button>
                                <button type="button" onClick={() => setReactionTargetId(reactionTargetId === message.id ? null : message.id)} title="Reagir"><i className="fa-regular fa-face-smile" /></button>
                                {mine && <button type="button" onClick={() => beginEdit(message)} title="Editar"><i className="fa-regular fa-pen-to-square" /></button>}
                                {mine && <button type="button" onClick={() => setDeleteTargetId(message.id)} title="Remover"><i className="fa-regular fa-trash-can" /></button>}
                              </div>
                            )}
                            {reactionTargetId === message.id && <div className="cut-chat-reaction-picker">{REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => reactToMessage(message.id, emoji)}>{emoji}</button>)}</div>}
                            <div className="cut-chat-bubble-wrap">
                              {message.reply_to && <button type="button" className="cut-chat-reply-preview" onClick={() => document.getElementById(`message-${message.reply_to.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><strong>{personName(message.reply_to.sender)}</strong><span>{message.reply_to.is_deleted ? "Mensagem removida" : message.reply_to.body || "Mídia"}</span></button>}
                              {message.is_deleted ? <div className="cut-chat-bubble cut-chat-bubble--deleted"><i className="fa-regular fa-circle-xmark" /> Mensagem removida</div> : <>
                                {message.attachments?.length > 0 && <div className="cut-chat-attachments">{message.attachments.map((attachment) => <SecureAttachment key={attachment.id} conversationId={activeId} messageId={message.id} attachment={attachment} />)}</div>}
                                {message.body && <div className="cut-chat-bubble">{message.body}</div>}
                              </>}
                              {message.reactions?.length > 0 && <div className="cut-chat-reaction-summary">{message.reactions.map((reaction) => <button type="button" key={reaction.emoji} className={reaction.user_ids?.includes(currentUserId) ? "is-mine" : ""} onClick={() => reactToMessage(message.id, reaction.emoji)}><span>{reaction.emoji}</span><b>{reaction.count}</b></button>)}</div>}
                              <div className="cut-chat-message-meta"><time>{timeLabel(message.created_at, true)}</time>{message.edited_at && !message.is_deleted && <span>Editada</span>}{message.delivery_status === "sending" && <span>Enviando...</span>}{message.delivery_status === "failed" && <button type="button" onClick={() => retryMessage(message)}>Falhou · tentar novamente</button>}</div>
                            </div>
                            {deleteTargetId === message.id && <div className="cut-chat-delete-confirm"><span>Desfazer envio desta mensagem?</span><button type="button" onClick={() => removeMessage(message.id)}>Remover</button><button type="button" onClick={() => setDeleteTargetId(null)}>Cancelar</button></div>}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {typingUserId && <div className="cut-chat-typing"><Avatar person={otherPerson} size="sm" /><span><i /><i /><i /></span></div>}
                  {lastOwnMessage && <div className="cut-chat-seen">{seen ? "Visualizado" : "Enviado"}</div>}
                  <div ref={messagesEndRef} />
                </div>

                <footer className="cut-chat-composer">
                  {(replyingTo || editingMessage) && <div className="cut-chat-composer-context"><i className={`fa-solid ${editingMessage ? "fa-pen" : "fa-reply"}`} /><span><strong>{editingMessage ? "Editando mensagem" : `Respondendo a ${personName(replyingTo?.sender)}`}</strong><small>{editingMessage?.body || replyingTo?.body || "Mídia"}</small></span><button type="button" onClick={() => { setReplyingTo(null); setEditingMessage(null); setDraft(""); }} aria-label="Cancelar"><i className="fa-solid fa-xmark" /></button></div>}
                  {selectedFiles.length > 0 && <div className="cut-chat-selected-files">{selectedFiles.map((file, index) => <span key={`${file.name}-${file.lastModified}`}><i className="fa-regular fa-file" /><b>{file.name}</b><small>{fileSize(file.size)}</small><button type="button" onClick={() => setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover ${file.name}`}><i className="fa-solid fa-xmark" /></button></span>)}</div>}
                  {threadConversation?.is_blocked ? <div className="cut-chat-composer-disabled">Envio de mensagens indisponível enquanto houver bloqueio.</div> : <>
                    <div className="cut-chat-composer__field">
                      {!editingMessage && <button type="button" className="cut-chat-attach" onClick={() => fileInputRef.current?.click()} aria-label="Adicionar foto, vídeo ou arquivo"><i className="fa-solid fa-plus" /></button>}
                      <input ref={fileInputRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav,application/pdf,text/plain,.zip,.docx,.xlsx" onChange={handleFiles} />
                      <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 4000))} onKeyDown={handleComposerKeyDown} rows={1} placeholder={editingMessage ? "Edite sua mensagem" : `Mensagem para ${personName(otherPerson)}`} aria-label="Escrever mensagem" />
                      <button type="button" className="cut-chat-send" disabled={(!draft.trim() && selectedFiles.length === 0) || sending} onClick={sendMessage} aria-label={editingMessage ? "Salvar edição" : "Enviar mensagem"}>{sending ? <Spinner size="sm" /> : <i className={`fa-solid ${editingMessage ? "fa-check" : "fa-paper-plane"}`} />}</button>
                    </div>
                    <small>{draft.length > 3600 ? `${draft.length}/4000 · ` : ""}Enter envia · Shift + Enter quebra a linha · até 4 arquivos de 20 MB</small>
                  </>}
                </footer>
              </>
            )}
          </section>

          {showComposer && <div className="cut-chat-new-panel" role="dialog" aria-modal="true" aria-label="Nova mensagem"><button type="button" className="cut-chat-new-panel__backdrop" onClick={() => setShowComposer(false)} aria-label="Fechar" /><section className="cut-chat-new-panel__card"><header><button type="button" onClick={() => setShowComposer(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button><strong>Nova mensagem</strong><span /></header><label className="cut-chat-new-search"><span>Para:</span><input autoFocus value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Pesquisar pessoas na Cutinapp" /></label><div className="cut-chat-people"><span className="cut-chat-people__title">{peopleSearch.trim() ? "Resultados" : "Pessoas na Cutinapp"}</span>{loadingPeople ? <div className="cut-chat-state"><Spinner size="sm" /><span>Buscando pessoas...</span></div> : people.length === 0 ? <div className="cut-chat-state"><i className="fa-regular fa-user" /><span>Nenhuma pessoa encontrada.</span></div> : people.map((person) => <button type="button" key={person.id} onClick={() => startConversation(person)}><Avatar person={person} size="lg" /><span><strong>{personName(person)}</strong><small>{person.user_name ? `@${person.user_name}` : [person.city, person.uf].filter(Boolean).join(" · ") || "Usuário Cutinapp"}</small></span><i className="fa-solid fa-chevron-right" /></button>)}</div></section></div>}

          {showReport && <div className="cut-chat-new-panel" role="dialog" aria-modal="true" aria-label="Denunciar usuário"><button type="button" className="cut-chat-new-panel__backdrop" onClick={() => setShowReport(false)} aria-label="Fechar" /><section className="cut-chat-report-card"><header><strong>Denunciar {personName(otherPerson)}</strong><button type="button" onClick={() => setShowReport(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button></header><p>A denúncia será enviada para análise. O usuário não recebe uma notificação sobre quem denunciou.</p><label>Motivo<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{REPORT_REASONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Detalhes adicionais<textarea value={reportDescription} onChange={(event) => setReportDescription(event.target.value.slice(0, 2000))} rows={4} placeholder="Conte o que aconteceu, se achar necessário." /></label><div><button type="button" onClick={() => setShowReport(false)}>Cancelar</button><button type="button" className="is-danger" onClick={submitReport}>Enviar denúncia</button></div></section></div>}
        </div>
      </main>
    </>
  );
}
