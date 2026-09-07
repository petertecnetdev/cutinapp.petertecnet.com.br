import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Card, Form } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";
import { clearTimelineDraft, createTimelineClientToken, readTimelineDraft, writeTimelineDraft } from "../../utils/timelineDraft";

const EMPTY_POLL = ["", ""];
const types = [
  { value: "text", label: "Texto", icon: "fa-regular fa-pen-to-square" },
  { value: "image", label: "Foto", icon: "fa-regular fa-image" },
  { value: "video", label: "Vídeo", icon: "fa-solid fa-video" },
  { value: "poll", label: "Enquete", icon: "fa-solid fa-square-poll-horizontal" },
  { value: "location", label: "Local", icon: "fa-solid fa-location-dot" },
  { value: "story", label: "Story", icon: "fa-regular fa-clock" },
];

export default function TimelineComposer({ eventOptions, onNeedEvents, onPublished, isPromoter = false }) {
  const saved = useMemo(() => readTimelineDraft(), []);
  const [type, setType] = useState(saved?.type || "text");
  const [body, setBody] = useState(saved?.body || "");
  const [eventId, setEventId] = useState(saved?.event_id ? String(saved.event_id) : "");
  const [locationName, setLocationName] = useState(saved?.location_name || "");
  const [pollQuestion, setPollQuestion] = useState(saved?.poll_question || "");
  const [pollOptions, setPollOptions] = useState(Array.isArray(saved?.poll_options) && saved.poll_options.length >= 2 ? saved.poll_options : EMPTY_POLL);
  const [campaign, setCampaign] = useState(saved?.campaign || "");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [clientToken, setClientToken] = useState(saved?.client_token || createTimelineClientToken());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    writeTimelineDraft({ type, body, event_id: eventId || null, location_name: locationName, poll_question: pollQuestion, poll_options: pollOptions, campaign, client_token: clientToken });
  }, [type, body, eventId, locationName, pollQuestion, pollOptions, campaign, clientToken]);

  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const next = URL.createObjectURL(file);
    setPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const setPostType = (nextType) => {
    setType(nextType);
    setMessage(null);
    if (!["image", "video", "story"].includes(nextType)) setFile(null);
  };

  const updatePollOption = (index, value) => setPollOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
  const addPollOption = () => setPollOptions((current) => current.length >= 6 ? current : [...current, ""]);
  const removePollOption = (index) => setPollOptions((current) => current.length <= 2 ? current : current.filter((_, optionIndex) => optionIndex !== index));

  const reset = () => {
    setType("text"); setBody(""); setEventId(""); setLocationName(""); setPollQuestion(""); setPollOptions(EMPTY_POLL); setCampaign(""); setFile(null);
    const nextToken = createTimelineClientToken(); setClientToken(nextToken); clearTimelineDraft();
  };

  const submit = async (event) => {
    event.preventDefault();
    const cleanBody = body.trim();
    const cleanOptions = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!cleanBody && !file && type !== "poll" && !eventId) {
      setMessage({ type: "danger", text: "Escreva algo, adicione uma mídia, enquete ou relacione um evento." }); return;
    }
    if (type === "poll" && (!pollQuestion.trim() || cleanOptions.length < 2)) {
      setMessage({ type: "danger", text: "Sua enquete precisa de uma pergunta e pelo menos duas opções." }); return;
    }
    setBusy(true); setMessage(null);
    try {
      const data = new FormData();
      data.append("client_token", clientToken);
      data.append("type", type);
      if (cleanBody) data.append("body", cleanBody);
      if (eventId) data.append("event_id", eventId);
      if (file) data.append("media", file);
      if (locationName.trim()) data.append("location_name", locationName.trim());
      if (type === "poll") {
        data.append("poll_question", pollQuestion.trim());
        cleanOptions.forEach((option) => data.append("poll_options[]", option));
      }
      if (type === "story") data.append("story_hours", "24");
      if (campaign.trim()) data.append("campaign", campaign.trim());
      await cutinappService.createTimelinePost(data);
      reset();
      setMessage({ type: "success", text: "Publicado na timeline." });
      await onPublished?.();
    } catch (error) {
      const offline = !navigator.onLine || !error?.response;
      setMessage({ type: offline ? "warning" : "danger", text: offline ? "Sem conexão. Seu rascunho ficou salvo e pode ser enviado quando a internet voltar." : (error?.response?.data?.message || "Não foi possível publicar agora.") });
    } finally { setBusy(false); }
  };

  return <Card className="cut-feed-card cut-timeline-composer mb-4">
    <Card.Body>
      <div className="cut-timeline-composer__header">
        <div><span className="cut-eyebrow">Criar</span><h2>Compartilhe com a Cutinapp</h2><p>Evento é opcional. Publique como em uma rede social.</p></div>
        {saved && <Badge bg="secondary">Rascunho recuperado</Badge>}
      </div>
      <div className="cut-timeline-typebar" role="toolbar" aria-label="Tipo de publicação">
        {types.map((item) => <Button key={item.value} type="button" size="sm" variant={type === item.value ? "primary" : "outline-light"} onClick={() => setPostType(item.value)} disabled={busy}><i className={`${item.icon} me-2`} />{item.label}</Button>)}
      </div>
      <Form onSubmit={submit}>
        <Form.Group className="mb-3">
          <Form.Control as="textarea" rows={3} maxLength={3000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="O que está acontecendo? Conte pra galera..." disabled={busy} />
          <Form.Text>{body.length}/3000</Form.Text>
        </Form.Group>

        {(type === "image" || type === "video" || type === "story") && <Form.Group className="mb-3">
          <Form.Label>{type === "video" ? "Vídeo" : "Foto ou vídeo"}</Form.Label>
          <Form.Control type="file" accept={type === "video" ? "video/mp4,video/webm,video/quicktime" : type === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "image/*,video/mp4,video/webm,video/quicktime"} onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={busy} />
          <Form.Text>Até 50 MB. A mídia é enviada apenas quando você publicar.</Form.Text>
          {preview && <div className="cut-timeline-media-preview mt-3">{file?.type?.startsWith("video/") ? <video src={preview} controls preload="metadata" /> : <img src={preview} alt="Prévia da publicação" />}</div>}
        </Form.Group>}

        {type === "poll" && <div className="cut-timeline-poll-editor mb-3">
          <Form.Group className="mb-2"><Form.Label>Pergunta</Form.Label><Form.Control value={pollQuestion} maxLength={500} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ex.: Quem merece ganhar o combo?" disabled={busy} /></Form.Group>
          {pollOptions.map((option, index) => <div className="d-flex gap-2 mb-2" key={index}><Form.Control value={option} maxLength={240} onChange={(event) => updatePollOption(index, event.target.value)} placeholder={`Opção ${index + 1}`} disabled={busy} />{pollOptions.length > 2 && <Button type="button" variant="outline-danger" onClick={() => removePollOption(index)} disabled={busy} aria-label="Remover opção"><i className="fa-solid fa-xmark" /></Button>}</div>)}
          {pollOptions.length < 6 && <Button type="button" size="sm" variant="outline-light" onClick={addPollOption} disabled={busy}>Adicionar opção</Button>}
        </div>}

        {type === "location" && <Form.Group className="mb-3"><Form.Label>Local</Form.Label><Form.Control value={locationName} maxLength={180} onChange={(event) => setLocationName(event.target.value)} placeholder="Ex.: Setor Marista, Goiânia" disabled={busy} /></Form.Group>}

        <div className="cut-timeline-composer__context">
          <Form.Group>
            <Form.Label>Relacionar a um evento <span className="text-secondary">(opcional)</span></Form.Label>
            <Form.Select value={eventId} onFocus={onNeedEvents} onPointerDown={onNeedEvents} onChange={(event) => setEventId(event.target.value)} disabled={busy}>
              <option value="">Publicação geral</option>
              {eventOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Form.Select>
          </Form.Group>
          {isPromoter && <Form.Group><Form.Label>Campanha <span className="text-secondary">(opcional)</span></Form.Label><Form.Control value={campaign} maxLength={120} onChange={(event) => setCampaign(event.target.value)} placeholder="Ex.: setembro-marista" disabled={busy} /></Form.Group>}
        </div>

        {message && <div className={`alert alert-${message.type} mt-3 mb-0`}>{message.text}</div>}
        <div className="cut-timeline-composer__footer">
          <span>{!navigator.onLine ? "Offline · rascunho protegido" : "Rascunho salvo automaticamente"}</span>
          <Button type="submit" disabled={busy}>{busy ? "Publicando..." : type === "story" ? "Publicar story" : "Publicar"}</Button>
        </div>
      </Form>
    </Card.Body>
  </Card>;
}

TimelineComposer.propTypes = {
  eventOptions: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired, title: PropTypes.string.isRequired })),
  onNeedEvents: PropTypes.func,
  onPublished: PropTypes.func,
  isPromoter: PropTypes.bool,
};

TimelineComposer.defaultProps = { eventOptions: [], onNeedEvents: undefined, onPublished: undefined, isPromoter: false };
