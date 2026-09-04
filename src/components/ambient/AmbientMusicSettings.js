import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import ambientMediaService from "../../services/AmbientMediaService";
import { defaultAmbientMediaForm, detectAmbientProvider } from "../../utils/ambientMedia";
import "./AmbientMusic.css";

const providerLabels = {
  youtube: "YouTube",
  spotify: "Spotify",
  audio: "Áudio por URL",
};

export default function AmbientMusicSettings({
  subjectType,
  subjectId,
  recommendationSubjectType,
  recommendationSubjectId,
  allowInheritance = false,
}) {
  const [form, setForm] = useState(defaultAmbientMediaForm);
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [seed, setSeed] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await ambientMediaService.manageMedia(subjectType, subjectId);
      setMedia(current);
      setForm(current ? {
        provider: current.provider || "youtube",
        source_url: current.source_url || "",
        title: current.title || "",
        artist: current.artist || "",
        enabled: current.enabled !== false,
        autoplay: current.autoplay !== false,
        loop: current.loop !== false,
        volume: Number(current.volume ?? 35),
        start_seconds: Number(current.start_seconds ?? 0),
      } : { ...defaultAmbientMediaForm });
    } catch (err) {
      setError(err?.message || "Não foi possível carregar a trilha.");
    } finally {
      setLoading(false);
    }
  }, [subjectType, subjectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    if (!recommendationSubjectId) {
      setRecommendations([]);
      setSeed(null);
      return () => { active = false; };
    }
    setRecommendationsLoading(true);
    ambientMediaService.recommendations(recommendationSubjectType, recommendationSubjectId)
      .then((response) => {
        if (!active) return;
        setSeed(response.seed || null);
        setRecommendations(response.recommendations || []);
      })
      .catch(() => active && setRecommendations([]))
      .finally(() => active && setRecommendationsLoading(false));
    return () => { active = false; };
  }, [recommendationSubjectType, recommendationSubjectId]);

  const change = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setError("");
    setSuccess("");
  };

  const changeUrl = (event) => {
    const value = event.target.value;
    const detected = detectAmbientProvider(value);
    setForm((current) => ({ ...current, source_url: value, provider: detected || current.provider }));
    setError("");
  };

  const preventParentSubmit = (event) => {
    if (event.key === "Enter" && ["INPUT", "SELECT"].includes(event.target?.tagName)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const canSave = useMemo(() => /^https:\/\//i.test(form.source_url.trim()) && !saving, [form.source_url, saving]);

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await ambientMediaService.saveMedia(subjectType, subjectId, {
        ...form,
        volume: Number(form.volume),
        start_seconds: Number(form.start_seconds || 0),
      });
      setMedia(response.media);
      setForm((current) => ({
        ...current,
        title: response.media?.title || current.title,
        artist: response.media?.artist || current.artist,
      }));
      setSuccess(response.message || "Trilha salva.");
    } catch (err) {
      const validationMessage = Object.values(err?.errors || {}).flat()[0];
      setError(validationMessage || err?.message || "Não foi possível salvar a trilha.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await ambientMediaService.removeMedia(subjectType, subjectId);
      setMedia(null);
      setForm({ ...defaultAmbientMediaForm });
      setSuccess(allowInheritance ? "Trilha própria removida. Este evento passará a usar a trilha da produção, quando houver." : response.message || "Trilha removida.");
    } catch (err) {
      setError(err?.message || "Não foi possível remover a trilha.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card className="cut-panel cut-music-settings"><Card.Body className="p-4 text-center"><Spinner size="sm" className="me-2" />Carregando trilha...</Card.Body></Card>;

  return (
    <Card className="cut-panel cut-music-settings" onKeyDown={preventParentSubmit}>
      <Card.Body className="p-4 p-lg-5">
        <div className="cut-music-settings__heading">
          <div>
            <span className="cut-eyebrow">Experiência sonora</span>
            <h2 className="cut-section-title mt-2">Música ambiente</h2>
            <p>Defina uma trilha para acompanhar a entrada do visitante nesta página.</p>
          </div>
          {media ? <Badge bg="success">Configurada</Badge> : allowInheritance ? <Badge bg="secondary">Usando produção</Badge> : <Badge bg="secondary">Sem trilha</Badge>}
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {allowInheritance && !media && <div className="cut-music-inheritance mb-4">
          <i className="fa-solid fa-wand-magic-sparkles" />
          <div><strong>Herança inteligente ativa</strong><span>Sem uma música própria, o evento reproduz a trilha configurada na produção.</span></div>
        </div>}

        <Row className="g-3">
          <Col md={4}>
            <Form.Group>
              <Form.Label>Origem</Form.Label>
              <Form.Select name="provider" value={form.provider} onChange={change}>
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
                <option value="audio">Arquivo de áudio / CDN</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={8}>
            <Form.Group>
              <Form.Label>Link da música ou playlist</Form.Label>
              <Form.Control type="url" name="source_url" value={form.source_url} onChange={changeUrl} placeholder={form.provider === "youtube" ? "https://www.youtube.com/watch?v=..." : form.provider === "spotify" ? "https://open.spotify.com/track/..." : "https://cdn.seudominio.com/musica.mp3"} />
              <Form.Text>Somente HTTPS. Para Spotify, use o link completo de open.spotify.com. O provedor é reconhecido automaticamente.</Form.Text>
            </Form.Group>
          </Col>
          <Col md={6}><Form.Group><Form.Label>Título opcional</Form.Label><Form.Control name="title" value={form.title} onChange={change} placeholder="A API tenta identificar automaticamente" /></Form.Group></Col>
          <Col md={6}><Form.Group><Form.Label>Artista opcional</Form.Label><Form.Control name="artist" value={form.artist} onChange={change} placeholder="Ajuda nas recomendações" /></Form.Group></Col>
          <Col md={6}><Form.Group><Form.Label>Volume inicial: {form.volume}%</Form.Label><Form.Range name="volume" min="0" max="100" step="5" value={form.volume} onChange={change} /></Form.Group></Col>
          <Col md={6}><Form.Group><Form.Label>Começar em</Form.Label><div className="cut-music-seconds"><Form.Control type="number" name="start_seconds" min="0" max="86400" value={form.start_seconds} onChange={change} /><span>segundos</span></div></Form.Group></Col>
          <Col xs={12}><div className="cut-music-toggles">
            <Form.Check type="switch" id={`${subjectType}-${subjectId}-music-enabled`} name="enabled" checked={Boolean(form.enabled)} onChange={change} label="Trilha ativa" />
            <Form.Check type="switch" id={`${subjectType}-${subjectId}-music-autoplay`} name="autoplay" checked={Boolean(form.autoplay)} onChange={change} label="Tentar iniciar ao entrar" />
            <Form.Check type="switch" id={`${subjectType}-${subjectId}-music-loop`} name="loop" checked={Boolean(form.loop)} onChange={change} label="Repetir" />
          </div></Col>
        </Row>

        <div className="cut-music-provider-note mt-4">
          <i className={`fa-brands ${form.provider === "youtube" ? "fa-youtube" : form.provider === "spotify" ? "fa-spotify" : "fa-chromecast"}`} />
          <span>{providerLabels[form.provider]}. Navegadores podem exigir uma interação do visitante antes de liberar áudio automático; a Cutinapp mostra um controle de ativação quando necessário.</span>
        </div>

        <div className="cut-card-actions mt-4">
          <Button type="button" onClick={save} disabled={!canSave}>{saving ? "Salvando..." : media ? "Atualizar trilha" : "Salvar trilha"}</Button>
          {media && <Button type="button" variant="outline-light" onClick={remove} disabled={saving}>{allowInheritance ? "Usar trilha da produção" : "Remover trilha"}</Button>}
        </div>

        {recommendationSubjectId && <section className="cut-music-recommendations mt-5">
          <div className="cut-section-heading mb-3"><div><span className="cut-eyebrow">Curadoria automática</span><h3>Recomendações para este evento</h3><p>{seed?.title ? `Inspiradas em “${seed.title}”${seed.artist ? ` · ${seed.artist}` : ""}, escolhida na produção.` : "Configure uma música na produção para gerar sugestões relacionadas."}</p></div></div>
          {recommendationsLoading && <div className="py-3"><Spinner size="sm" className="me-2" />Buscando referências...</div>}
          {!recommendationsLoading && recommendations.length > 0 && <div className="cut-music-recommendations__grid">{recommendations.map((item, index) => <article key={`${item.artist}-${item.title}-${index}`}>
            {item.artwork_url ? <img src={item.artwork_url} alt="" loading="lazy" /> : <div className="cut-music-recommendations__placeholder"><i className="fa-solid fa-music" /></div>}
            <div><strong>{item.title}</strong><span>{item.artist}</span>{item.genre && <small>{item.genre}</small>}</div>
            <div className="cut-music-recommendations__actions">
              <a href={item.youtube_search_url} target="_blank" rel="noreferrer" aria-label={`Buscar ${item.title} no YouTube`}><i className="fa-brands fa-youtube" /></a>
              <a href={item.spotify_search_url} target="_blank" rel="noreferrer" aria-label={`Buscar ${item.title} no Spotify`}><i className="fa-brands fa-spotify" /></a>
            </div>
          </article>)}</div>}
        </section>}
      </Card.Body>
    </Card>
  );
}
