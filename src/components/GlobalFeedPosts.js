import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";
import "../styles/global-feed-posts.css";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
}).format(new Date(value)) : "";

const mediaUrl = (value) => !value ? "" : /^https?:/.test(value)
  ? value
  : `${storageUrl}${String(value).replace(/^\//, "")}`;

const initialPollOptions = () => ["", ""];

export default function GlobalFeedPosts() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const mediaInputRef = useRef(null);
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(Boolean(user));
  const [loadingMore, setLoadingMore] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [voteBusy, setVoteBusy] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(initialPollOptions);

  const load = useCallback(async (nextPage = 1) => {
    if (!user) return;
    nextPage === 1 ? setLoading(true) : setLoadingMore(true);
    setError("");

    try {
      const response = await cutinappService.socialPosts({ page: nextPage, per_page: 10 });
      const batch = response.posts?.data || [];
      setPosts((current) => nextPage === 1
        ? batch
        : [...current, ...batch.filter((item) => !current.some((old) => old.id === item.id))]);
      setPage(response.posts?.current_page || nextPage);
      setLastPage(response.posts?.last_page || 1);
    } catch (err) {
      setError(err?.message || "Não foi possível carregar as publicações da comunidade.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load(1);
  }, [load, user]);

  const resetComposer = () => {
    setBody("");
    setMedia([]);
    setPollOpen(false);
    setPollQuestion("");
    setPollOptions(initialPollOptions());
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const selectMedia = (event) => {
    const selected = Array.from(event.target.files || []).slice(0, 4);
    setMedia(selected);
    if ((event.target.files || []).length > 4) {
      setError("Você pode anexar no máximo 4 fotos ou vídeos por publicação.");
    }
  };

  const updatePollOption = (index, value) => {
    setPollOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
  };

  const addPollOption = () => {
    setPollOptions((current) => current.length >= 6 ? current : [...current, ""]);
  };

  const removePollOption = (index) => {
    setPollOptions((current) => current.length <= 2 ? current : current.filter((_, optionIndex) => optionIndex !== index));
  };

  const publish = async () => {
    if (!user) return navigate("/login", { state: { from: "/feed" } });

    const cleanOptions = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!body.trim() && media.length === 0 && !pollOpen) {
      setError("Escreva algo, adicione uma foto ou vídeo, ou crie uma enquete.");
      return;
    }
    if (pollOpen && (!pollQuestion.trim() || cleanOptions.length < 2)) {
      setError("Para publicar uma enquete, informe a pergunta e pelo menos duas opções.");
      return;
    }

    setPublishing(true);
    setError("");

    try {
      const formData = new FormData();
      if (body.trim()) formData.append("body", body.trim());
      media.forEach((file) => formData.append("media[]", file));
      if (pollOpen) {
        formData.append("poll_question", pollQuestion.trim());
        cleanOptions.forEach((option) => formData.append("poll_options[]", option));
      }

      const response = await cutinappService.createSocialPost(formData);
      if (response.post) {
        setPosts((current) => [response.post, ...current.filter((post) => post.id !== response.post.id)]);
      }
      resetComposer();
    } catch (err) {
      setError(err?.message || "Não foi possível publicar agora.");
    } finally {
      setPublishing(false);
    }
  };

  const vote = async (postId, optionId) => {
    setVoteBusy(`${postId}:${optionId}`);
    setError("");
    try {
      const response = await cutinappService.voteSocialPost(postId, optionId);
      if (response.post) {
        setPosts((current) => current.map((post) => post.id === postId ? response.post : post));
      }
    } catch (err) {
      setError(err?.message || "Não foi possível registrar seu voto.");
    } finally {
      setVoteBusy(null);
    }
  };

  const removePost = async (postId) => {
    if (!window.confirm("Remover esta publicação do feed?")) return;
    setDeleteBusy(postId);
    setError("");
    try {
      await cutinappService.deleteSocialPost(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch (err) {
      setError(err?.message || "Não foi possível remover a publicação.");
    } finally {
      setDeleteBusy(null);
    }
  };

  const authorInitial = (name) => String(name || "U").trim().charAt(0).toUpperCase() || "U";

  return <section className="cut-global-feed" aria-label="Publicações da comunidade">
    <div className="cut-section-heading cut-global-feed__heading">
      <div><span className="cut-eyebrow">Comunidade</span><h2>O que está acontecendo agora</h2><p>Publique para toda a Cutinapp: texto, fotos, vídeos ou enquetes.</p></div>
    </div>

    {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}

    {user ? <Card className="cut-post-composer">
      <Card.Body>
        <div className="cut-post-composer__identity">
          <div className="cut-social-avatar">
            {user.avatar ? <img src={mediaUrl(user.avatar)} alt="" /> : <span>{authorInitial(user.first_name || user.user_name)}</span>}
          </div>
          <div><strong>{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.user_name || "Você"}</strong><small>Visível para toda a Cutinapp</small></div>
        </div>

        <textarea
          className="cut-post-composer__textarea"
          rows={3}
          maxLength={5000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Compartilhe uma novidade, ideia ou momento..."
          aria-label="Texto da publicação"
        />

        {media.length > 0 && <div className="cut-post-composer__attachments">
          {media.map((file, index) => <span key={`${file.name}-${file.size}-${index}`}><i className={`fa-solid ${file.type.startsWith("video/") ? "fa-video" : "fa-image"}`} /> {file.name}</span>)}
          <button type="button" onClick={() => { setMedia([]); if (mediaInputRef.current) mediaInputRef.current.value = ""; }}>Limpar mídia</button>
        </div>}

        {pollOpen && <div className="cut-poll-editor">
          <input value={pollQuestion} maxLength={300} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Faça uma pergunta" />
          {pollOptions.map((option, index) => <div className="cut-poll-editor__option" key={index}>
            <input value={option} maxLength={120} onChange={(event) => updatePollOption(index, event.target.value)} placeholder={`Opção ${index + 1}`} />
            {pollOptions.length > 2 && <button type="button" aria-label={`Remover opção ${index + 1}`} onClick={() => removePollOption(index)}><i className="fa-solid fa-xmark" /></button>}
          </div>)}
          {pollOptions.length < 6 && <Button size="sm" variant="outline-light" onClick={addPollOption}><i className="fa-solid fa-plus me-2" />Adicionar opção</Button>}
        </div>}

        <input ref={mediaInputRef} className="cut-post-composer__file" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={selectMedia} />
        <div className="cut-post-composer__actions">
          <div>
            <Button type="button" variant="ghost" onClick={() => mediaInputRef.current?.click()}><i className="fa-regular fa-image me-2" />Foto ou vídeo</Button>
            <Button type="button" variant={pollOpen ? "primary" : "ghost"} onClick={() => setPollOpen((open) => !open)}><i className="fa-solid fa-chart-simple me-2" />Enquete</Button>
          </div>
          <Button type="button" onClick={publish} disabled={publishing}>{publishing ? <><Spinner size="sm" className="me-2" />Publicando...</> : "Publicar"}</Button>
        </div>
      </Card.Body>
    </Card> : <Card className="cut-post-login-card"><Card.Body><h3>Entre para participar</h3><p>Faça login para publicar para toda a comunidade Cutinapp.</p><Button onClick={() => navigate("/login", { state: { from: "/feed" } })}>Entrar</Button></Card.Body></Card>}

    {loading ? <div className="cut-global-feed__loading"><Spinner animation="border" /><span>Carregando publicações...</span></div> : posts.length > 0 ? <div className="cut-post-list">
      {posts.map((post) => <Card className="cut-social-post" key={post.id}>
        <Card.Body>
          <header className="cut-social-post__header">
            <div className="cut-social-avatar">
              {post.author?.avatar ? <img src={mediaUrl(post.author.avatar)} alt="" loading="lazy" /> : <span>{authorInitial(post.author?.name)}</span>}
            </div>
            <div className="cut-social-post__author"><strong>{post.author?.name || "Usuário Cutinapp"}</strong><small>{fmt(post.created_at)} · Público</small></div>
            {post.is_owner && <Button size="sm" variant="ghost" disabled={deleteBusy === post.id} onClick={() => removePost(post.id)} aria-label="Remover publicação"><i className="fa-regular fa-trash-can" /></Button>}
          </header>

          {post.body && <p className="cut-social-post__body">{post.body}</p>}

          {post.media?.length > 0 && <div className={`cut-social-post__media cut-social-post__media--${Math.min(post.media.length, 4)}`}>
            {post.media.map((item) => item.kind === "video"
              ? <video key={item.id} src={mediaUrl(item.path)} controls playsInline preload="metadata" />
              : <img key={item.id} src={mediaUrl(item.path)} alt="Mídia da publicação" loading="lazy" />)}
          </div>}

          {post.poll && <div className="cut-social-poll">
            <strong>{post.poll.question}</strong>
            <div className="cut-social-poll__options">{post.poll.options?.map((option) => {
              const selected = post.poll.selected_option_id === option.id;
              return <button type="button" key={option.id} className={selected ? "is-selected" : ""} disabled={Boolean(voteBusy)} onClick={() => vote(post.id, option.id)}>
                <span>{option.label}</span><span>{option.percentage}%</span><i style={{ width: `${option.percentage}%` }} aria-hidden="true" />
              </button>;
            })}</div>
            <small>{post.poll.total_votes || 0} {(post.poll.total_votes || 0) === 1 ? "voto" : "votos"}</small>
          </div>}
        </Card.Body>
      </Card>)}
      {page < lastPage && <div className="cut-load-more"><Button variant="outline-light" disabled={loadingMore} onClick={() => load(page + 1)}>{loadingMore ? "Carregando..." : "Carregar mais publicações"}</Button></div>}
    </div> : <Card className="cut-empty-state cut-global-feed__empty"><Card.Body><div className="cut-empty-icon"><i className="fa-regular fa-comments" /></div><h3>Seja o primeiro a publicar</h3><p>As publicações dos usuários da Cutinapp vão aparecer aqui para toda a comunidade.</p></Card.Body></Card>}
  </section>;
}
