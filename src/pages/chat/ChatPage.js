import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import messagingService from "../../services/MessagingService";
import { subscribeToMessagingEvents } from "../../services/RealtimeMessagingService";
import "./ChatPage.css";

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

Avatar.defaultProps = {
  person: null,
  size: "md",
};

export default function ChatPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const currentUserId = Number(user?.id || 0);
  const activeId = Number(conversationId || 0) || null;
  const messagesEndRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [threadConversation, setThreadConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [showComposer, setShowComposer] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const notifyUnreadChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent("cutinapp:messages-updated"));
  }, []);

  const loadConversations = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadingInbox(true);
    try {
      const response = await messagingService.conversations({ per_page: 50 });
      setConversations(response?.conversations?.data || []);
      setError("");
    } catch (err) {
      if (!quiet) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar suas conversas.");
    } finally {
      if (!quiet) setLoadingInbox(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) {
      setThreadConversation(null);
      setMessages([]);
      return undefined;
    }

    let mounted = true;
    setLoadingThread(true);
    setError("");

    messagingService.messages(activeId, { per_page: 80 })
      .then(async (response) => {
        if (!mounted) return;
        setThreadConversation(response?.conversation || null);
        setMessages(response?.messages?.data || []);
        try {
          await messagingService.markRead(activeId);
          notifyUnreadChanged();
          loadConversations({ quiet: true });
        } catch (_) { /* leitura não deve impedir a conversa */ }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.response?.data?.message || err?.message || "Não foi possível abrir esta conversa.");
      })
      .finally(() => {
        if (mounted) setLoadingThread(false);
      });

    return () => { mounted = false; };
  }, [activeId, loadConversations, notifyUnreadChanged]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    return subscribeToMessagingEvents(currentUserId, {
      onMessage: (payload) => {
        const incoming = payload?.message;
        const incomingConversationId = Number(payload?.conversation_id || incoming?.conversation_id || 0);
        if (!incomingConversationId || !incoming) return;

        if (incomingConversationId === activeId) {
          setMessages((current) => current.some((item) => Number(item.id) === Number(incoming.id)) ? current : [...current, incoming]);
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
      onRead: (payload) => {
        if (Number(payload?.conversation_id) !== activeId) return;
        setThreadConversation((current) => {
          if (!current) return current;
          return {
            ...current,
            participants: (current.participants || []).map((participant) => Number(participant.id) === Number(payload.reader_user_id)
              ? { ...participant, last_read_at: payload.read_at }
              : participant),
          };
        });
      },
    });
  }, [activeId, currentUserId, loadConversations, notifyUnreadChanged]);

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

  const filteredConversations = useMemo(() => {
    const term = conversationSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const person = conversation.other_users?.[0];
      const haystack = `${personName(person)} ${person?.user_name || ""} ${conversation.last_message?.body || ""}`.toLocaleLowerCase("pt-BR");
      return haystack.includes(term);
    });
  }, [conversationSearch, conversations]);

  const activeConversation = threadConversation || conversations.find((conversation) => Number(conversation.id) === activeId) || null;
  const otherPerson = activeConversation?.other_users?.[0] || activeConversation?.participants?.find((participant) => Number(participant.id) !== currentUserId) || null;
  const otherParticipant = activeConversation?.participants?.find((participant) => Number(participant.id) !== currentUserId) || null;
  const lastMessage = messages[messages.length - 1] || null;
  const lastOwnMessage = [...messages].reverse().find((message) => Number(message.sender_user_id) === currentUserId) || null;
  const seen = Boolean(
    lastOwnMessage?.created_at
    && otherParticipant?.last_read_at
    && new Date(otherParticipant.last_read_at).getTime() >= new Date(lastOwnMessage.created_at).getTime()
  );

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
      setError(err?.response?.data?.message || err?.message || "Não foi possível iniciar a conversa.");
    }
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await messagingService.send(activeId, body);
      const message = response?.message;
      if (message) {
        setMessages((current) => current.some((item) => Number(item.id) === Number(message.id)) ? current : [...current, message]);
      }
      setDraft("");
      loadConversations({ quiet: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <NavlogComponent />
      <main className="cut-chat-page">
        {error && <Alert variant="danger" className="cut-chat-alert" dismissible onClose={() => setError("")}>{error}</Alert>}

        <div className={`cut-chat-shell ${activeId ? "has-active" : ""}`}>
          <aside className="cut-chat-inbox" aria-label="Caixa de entrada">
            <div className="cut-chat-inbox__head">
              <div>
                <span className="cut-chat-eyebrow">Cutinapp Social</span>
                <h1>Mensagens</h1>
              </div>
              <button type="button" className="cut-chat-icon-btn" onClick={() => setShowComposer(true)} aria-label="Nova mensagem" title="Nova mensagem">
                <i className="fa-regular fa-pen-to-square" />
              </button>
            </div>

            <label className="cut-chat-search">
              <i className="fa-solid fa-magnifying-glass" />
              <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Pesquisar mensagens" aria-label="Pesquisar conversas" />
            </label>

            <div className="cut-chat-conversation-list">
              {loadingInbox ? (
                <div className="cut-chat-state"><Spinner size="sm" /><span>Carregando conversas...</span></div>
              ) : filteredConversations.length === 0 ? (
                <div className="cut-chat-empty">
                  <span className="cut-chat-empty__icon"><i className="fa-regular fa-paper-plane" /></span>
                  <strong>Comece uma conversa</strong>
                  <p>Troque informações sobre eventos, artistas, produções e interesses com outras pessoas da Cutinapp.</p>
                  <button type="button" onClick={() => setShowComposer(true)}>Enviar mensagem</button>
                </div>
              ) : filteredConversations.map((conversation) => {
                const person = conversation.other_users?.[0];
                const isActive = Number(conversation.id) === activeId;
                const unread = Number(conversation.unread_count || 0);
                return (
                  <button type="button" key={conversation.id} className={`cut-chat-conversation ${isActive ? "is-active" : ""} ${unread ? "is-unread" : ""}`} onClick={() => openConversation(conversation.id)}>
                    <Avatar person={person} size="lg" />
                    <span className="cut-chat-conversation__body">
                      <span className="cut-chat-conversation__top">
                        <strong>{personName(person)}</strong>
                        <time>{timeLabel(conversation.last_message_at || conversation.last_message?.created_at)}</time>
                      </span>
                      <span className="cut-chat-conversation__preview">
                        <span>{conversation.last_message?.body || "Nova conversa"}</span>
                        {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="cut-chat-thread" aria-label="Conversa">
            {!activeId ? (
              <div className="cut-chat-thread-empty">
                <span><i className="fa-regular fa-paper-plane" /></span>
                <h2>Suas mensagens</h2>
                <p>Converse diretamente com participantes, produtores, artistas e outras pessoas que usam a Cutinapp.</p>
                <button type="button" onClick={() => setShowComposer(true)}>Enviar mensagem</button>
              </div>
            ) : loadingThread ? (
              <div className="cut-chat-state cut-chat-state--thread"><Spinner /><span>Abrindo conversa...</span></div>
            ) : (
              <>
                <header className="cut-chat-thread__head">
                  <button type="button" className="cut-chat-back" onClick={() => navigate("/messages")} aria-label="Voltar para mensagens"><i className="fa-solid fa-arrow-left" /></button>
                  <Avatar person={otherPerson} size="md" />
                  <div className="cut-chat-thread__identity">
                    <strong>{personName(otherPerson)}</strong>
                    <span>{otherPerson?.user_name ? `@${otherPerson.user_name}` : [otherPerson?.city, otherPerson?.uf].filter(Boolean).join(" · ") || "Na Cutinapp"}</span>
                  </div>
                  <span className="cut-chat-thread__secure" title="Conversa privada"><i className="fa-solid fa-lock" /></span>
                </header>

                <div className="cut-chat-messages">
                  <div className="cut-chat-thread-profile">
                    <Avatar person={otherPerson} size="xl" />
                    <strong>{personName(otherPerson)}</strong>
                    {otherPerson?.user_name && <span>@{otherPerson.user_name}</span>}
                    {otherPerson?.about && <p>{otherPerson.about}</p>}
                  </div>

                  {messages.length === 0 && <div className="cut-chat-day-divider"><span>Esta é uma nova conversa</span></div>}

                  {messages.map((message, index) => {
                    const mine = Number(message.sender_user_id) === currentUserId;
                    const previous = messages[index - 1];
                    const grouped = previous && Number(previous.sender_user_id) === Number(message.sender_user_id)
                      && Math.abs(new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()) < 5 * 60 * 1000;
                    return (
                      <div key={message.id} className={`cut-chat-message-row ${mine ? "is-mine" : "is-theirs"} ${grouped ? "is-grouped" : ""}`}>
                        {!mine && !grouped ? <Avatar person={message.sender || otherPerson} size="sm" /> : !mine ? <span className="cut-chat-avatar-spacer" /> : null}
                        <div className="cut-chat-bubble-wrap">
                          <div className="cut-chat-bubble">{message.body}</div>
                          {!grouped && <time>{timeLabel(message.created_at, true)}</time>}
                        </div>
                      </div>
                    );
                  })}
                  {lastMessage && Number(lastMessage.sender_user_id) === currentUserId && <div className="cut-chat-seen">{seen ? "Visualizado" : "Enviado"}</div>}
                  <div ref={messagesEndRef} />
                </div>

                <footer className="cut-chat-composer">
                  <div className="cut-chat-composer__field">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
                      onKeyDown={handleComposerKeyDown}
                      rows={1}
                      placeholder={`Mensagem para ${personName(otherPerson)}`}
                      aria-label="Escrever mensagem"
                    />
                    <button type="button" className="cut-chat-send" disabled={!draft.trim() || sending} onClick={sendMessage} aria-label="Enviar mensagem">
                      {sending ? <Spinner size="sm" /> : <i className="fa-solid fa-paper-plane" />}
                    </button>
                  </div>
                  <small>Enter envia · Shift + Enter quebra a linha</small>
                </footer>
              </>
            )}
          </section>

          {showComposer && (
            <div className="cut-chat-new-panel" role="dialog" aria-modal="true" aria-label="Nova mensagem">
              <button type="button" className="cut-chat-new-panel__backdrop" onClick={() => setShowComposer(false)} aria-label="Fechar" />
              <section className="cut-chat-new-panel__card">
                <header>
                  <button type="button" onClick={() => setShowComposer(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
                  <strong>Nova mensagem</strong>
                  <span />
                </header>
                <label className="cut-chat-new-search">
                  <span>Para:</span>
                  <input autoFocus value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Pesquisar pessoas na Cutinapp" />
                </label>
                <div className="cut-chat-people">
                  <span className="cut-chat-people__title">{peopleSearch.trim() ? "Resultados" : "Pessoas na Cutinapp"}</span>
                  {loadingPeople ? <div className="cut-chat-state"><Spinner size="sm" /><span>Buscando pessoas...</span></div> : people.length === 0 ? <div className="cut-chat-state"><i className="fa-regular fa-user" /><span>Nenhuma pessoa encontrada.</span></div> : people.map((person) => (
                    <button type="button" key={person.id} onClick={() => startConversation(person)}>
                      <Avatar person={person} size="lg" />
                      <span><strong>{personName(person)}</strong><small>{person.user_name ? `@${person.user_name}` : [person.city, person.uf].filter(Boolean).join(" · ") || "Usuário Cutinapp"}</small></span>
                      <i className="fa-solid fa-chevron-right" />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
