import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import artistService from "../../services/ArtistService";
import { storageUrl } from "../../config";
import "./ArtistOnboardingPage.css";

const imageUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  return /^https?:\/\//i.test(image) ? image : `${storageUrl}${image.replace(/^\/+/, "")}`;
};

const initials = (value) => String(value || "A")
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const verificationLabel = (status) => {
  if (status === "verified") return ["Artista verificado", "success"];
  if (status === "account_linked") return ["Conta vinculada", "info"];
  return ["Perfil artístico", "secondary"];
};

export default function ArtistOnboardingPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ stage_name: "", genres: "", short_bio: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [claimQuery, setClaimQuery] = useState("");
  const [claimResults, setClaimResults] = useState([]);
  const [claimSearching, setClaimSearching] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [claimEvidence, setClaimEvidence] = useState("");
  const [claimEvidenceUrl, setClaimEvidenceUrl] = useState("");

  const defaultName = useMemo(() => {
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    return name || user?.user_name || "";
  }, [user]);

  const load = async () => {
    const data = await artistService.onboardingStatus();
    setStatus(data);
    if (!data?.artist) {
      setForm((current) => ({ ...current, stage_name: current.stage_name || defaultName }));
    }
    return data;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    artistService.onboardingStatus()
      .then((data) => {
        if (!active) return;
        setStatus(data);
        if (!data?.artist) setForm((current) => ({ ...current, stage_name: current.stage_name || defaultName }));
      })
      .catch((err) => active && setError(err?.response?.data?.message || "Não foi possível carregar seu status artístico."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [defaultName]);

  useEffect(() => {
    if (status?.is_artist || claimQuery.trim().length < 2 || selectedClaim) {
      setClaimResults([]);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setClaimSearching(true);
      try {
        setClaimResults(await artistService.claimCandidates(claimQuery));
      } catch (err) {
        setClaimResults([]);
      } finally {
        setClaimSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [claimQuery, selectedClaim, status?.is_artist]);

  const activate = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const genres = String(form.genres || "").split(",").map((value) => value.trim()).filter(Boolean);
      const response = await artistService.activateArtist({
        stage_name: form.stage_name.trim() || undefined,
        genres,
        short_bio: form.short_bio.trim() || undefined,
      });
      setStatus({
        is_artist: true,
        artist: response.artist,
        next_steps: response.next_steps || [],
        identity_claim: null,
      });
      setSuccess(response.message || "Seu perfil artístico está ativo.");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível ativar seu perfil artístico.");
    } finally {
      setBusy(false);
    }
  };

  const submitClaim = async () => {
    if (!selectedClaim) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await artistService.claimExisting(selectedClaim.id, {
        evidence_text: claimEvidence.trim() || null,
        evidence_url: claimEvidenceUrl.trim() || null,
      });
      setSuccess(response.message || "Reivindicação enviada.");
      setSelectedClaim(null);
      setClaimQuery("");
      setClaimEvidence("");
      setClaimEvidenceUrl("");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível reivindicar esse perfil.");
    } finally {
      setBusy(false);
    }
  };

  const toggleReference = async (visible) => {
    if (!status?.artist?.id) return;
    setBusy(true);
    setError("");
    try {
      const response = await artistService.updateReferenceVisibility(status.artist.id, visible);
      setStatus((current) => ({ ...current, artist: response.artist }));
      setSuccess(visible ? "Produção de referência visível no perfil." : "Produção de referência ocultada do perfil público.");
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível atualizar a referência.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Preparando perfil artístico" /></div>;

  const artist = status?.artist;
  const [verificationText, verificationVariant] = verificationLabel(artist?.verification_status);
  const steps = Array.isArray(status?.next_steps) ? status.next_steps : [];
  const completedSteps = steps.filter((step) => step.completed).length;

  return <div className="cut-app-page cut-artist-onboarding">
    <NavlogComponent />
    {(busy || claimSearching) && <ProcessingIndicatorComponent label={busy ? "Atualizando identidade artística" : "Buscando perfis"} />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-artist-onboarding__hero">
        <div>
          <span className="cut-eyebrow">Identidade artística</span>
          <h1>{artist ? "Seu perfil artístico" : "Quero ser artista"}</h1>
          <p>Ser artista na Cutinapp não depende de uma produção. Você pode ativar sua identidade agora; produções e eventos passam a ser relações profissionais separadas.</p>
        </div>
        {artist && <Button variant="outline-light" onClick={() => navigate(`/artist/${artist.slug}`)}>Ver perfil público</Button>}
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {!artist ? <Row className="g-4">
        <Col lg={7}>
          <Card className="cut-panel cut-artist-onboarding__card">
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Ativação rápida</span>
              <h2>Comece com o mínimo necessário</h2>
              <p className="text-secondary">Seu e-mail verificado já identifica sua conta. Nome artístico e uma categoria são suficientes para começar; o restante pode ser completado depois.</p>
              <Form onSubmit={activate}>
                <Form.Group className="mb-3">
                  <Form.Label>Nome artístico</Form.Label>
                  <Form.Control value={form.stage_name} onChange={(event) => setForm({ ...form, stage_name: event.target.value })} placeholder={defaultName || "Seu nome artístico"} required />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Categoria / gênero</Form.Label>
                  <Form.Control value={form.genres} onChange={(event) => setForm({ ...form, genres: event.target.value })} placeholder="Ex.: DJ, Funk, Sertanejo" />
                  <Form.Text>Você pode informar mais de um, separados por vírgulas.</Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Apresentação curta <span className="text-secondary">(opcional)</span></Form.Label>
                  <Form.Control as="textarea" rows={3} maxLength={500} value={form.short_bio} onChange={(event) => setForm({ ...form, short_bio: event.target.value })} placeholder="Conte em poucas linhas o que você faz." />
                </Form.Group>
                <Button type="submit" disabled={busy} className="w-100"><i className="fa-solid fa-wand-magic-sparkles me-2" />Ativar meu perfil artístico</Button>
              </Form>
              <div className="cut-artist-onboarding__note"><i className="fa-solid fa-shield-halved" /><span>Ativar o perfil não torna sua conta “verificada”. Verificação artística é um selo separado e pode ser concedida posteriormente.</span></div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="cut-panel cut-artist-onboarding__card">
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Evitar duplicidade</span>
              <h2>Já existe um perfil seu?</h2>
              <p className="text-secondary">Pesquise antes de criar outro. Se o perfil ainda não tiver proprietário, você pode selecionar “Este perfil é meu”.</p>
              <Form.Control value={claimQuery} onChange={(event) => { setClaimQuery(event.target.value); setSelectedClaim(null); }} placeholder="Digite seu nome artístico" />
              {claimSearching && <div className="small text-secondary mt-2"><Spinner size="sm" className="me-2" />Buscando…</div>}
              {claimResults.length > 0 && <div className="cut-artist-onboarding__claims mt-3">{claimResults.map((candidate) => <button type="button" key={candidate.id} onClick={() => setSelectedClaim(candidate)}>
                <span className="cut-artist-onboarding__avatar">{candidate.photo ? <img src={imageUrl(candidate.photo)} alt="" /> : initials(candidate.stage_name)}</span>
                <span><strong>{candidate.stage_name}</strong><small>{[candidate.city, candidate.uf].filter(Boolean).join(" - ") || "Perfil sem local informado"}</small></span>
                <i className="fa-solid fa-chevron-right" />
              </button>)}</div>}
              {selectedClaim && <div className="cut-artist-onboarding__claimForm mt-3">
                <div className="d-flex align-items-center gap-3 mb-3"><span className="cut-artist-onboarding__avatar">{selectedClaim.photo ? <img src={imageUrl(selectedClaim.photo)} alt="" /> : initials(selectedClaim.stage_name)}</span><div><strong>{selectedClaim.stage_name}</strong><div className="small text-secondary">Este perfil é meu</div></div></div>
                <Form.Group className="mb-2"><Form.Label>Como podemos confirmar a relação?</Form.Label><Form.Control as="textarea" rows={3} value={claimEvidence} onChange={(event) => setClaimEvidence(event.target.value)} placeholder="Ex.: sou o artista deste perfil e posso confirmar pelo Instagram oficial…" /></Form.Group>
                <Form.Group className="mb-3"><Form.Label>Link de evidência <span className="text-secondary">(opcional)</span></Form.Label><Form.Control type="url" value={claimEvidenceUrl} onChange={(event) => setClaimEvidenceUrl(event.target.value)} placeholder="https://instagram.com/..." /></Form.Group>
                <div className="d-flex gap-2"><Button type="button" onClick={submitClaim} disabled={busy}>Reivindicar perfil</Button><Button type="button" variant="outline-light" onClick={() => setSelectedClaim(null)}>Cancelar</Button></div>
                <small className="d-block text-secondary mt-2">Se o e-mail profissional do perfil for igual ao e-mail verificado da sua conta, o vínculo pode ser confirmado automaticamente. Nos demais casos, a solicitação fica pendente de análise.</small>
              </div>}
              {status?.identity_claim?.status === "pending" && <Alert variant="warning" className="mt-3 mb-0">Você já possui uma reivindicação artística aguardando análise.</Alert>}
            </Card.Body>
          </Card>
        </Col>
      </Row> : <>
        <Card className="cut-panel cut-artist-onboarding__identity mb-4">
          <Card.Body className="p-4">
            <div className="cut-artist-onboarding__identityMain">
              <span className="cut-artist-onboarding__avatar is-large">{artist.photo ? <img src={imageUrl(artist.photo)} alt="" /> : initials(artist.stage_name)}</span>
              <div>
                <div className="d-flex gap-2 flex-wrap align-items-center"><h2 className="mb-0">{artist.stage_name}</h2><Badge bg={verificationVariant}>{verificationText}</Badge></div>
                <p className="text-secondary mb-0">{artist.origin_type === "organization" && artist.origin_label ? `Apresentado na Cutinapp por ${artist.origin_label}` : "Perfil artístico criado diretamente pelo usuário."}</p>
              </div>
              <div className="cut-artist-onboarding__identityActions"><Button onClick={() => navigate("/artist/manage")}>Completar perfil</Button><Button variant="outline-light" onClick={() => navigate(`/artist/${artist.slug}`)}>Visualizar</Button></div>
            </div>
          </Card.Body>
        </Card>

        <Row className="g-4">
          <Col lg={7}>
            <Card className="cut-panel cut-artist-onboarding__card h-100"><Card.Body className="p-4">
              <span className="cut-eyebrow">Próximos passos</span>
              <h2>{completedSteps} de {steps.length} concluídos</h2>
              <div className="cut-artist-onboarding__steps">{steps.map((step) => <div key={step.key} className={step.completed ? "is-complete" : ""}><i className={step.completed ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} /><span>{step.label}</span></div>)}</div>
              <p className="text-secondary mt-3 mb-0">Seu perfil já funciona mesmo sem completar tudo. As informações extras melhoram descoberta, credibilidade e conversão em convites.</p>
            </Card.Body></Card>
          </Col>
          <Col lg={5}>
            <Card className="cut-panel cut-artist-onboarding__card h-100"><Card.Body className="p-4">
              <span className="cut-eyebrow">Produção de referência</span>
              {artist.origin_type === "organization" && artist.origin_label ? <>
                <h2>{artist.origin_label}</h2>
                <p className="text-secondary">Esta é a produção que apresentou sua identidade artística à Cutinapp. Ela não é dona nem administradora do seu perfil por causa dessa referência.</p>
                <Form.Check
                  type="switch"
                  id="artist-reference-visible"
                  checked={Boolean(artist.reference_visible)}
                  onChange={(event) => toggleReference(event.target.checked)}
                  label="Exibir “Apresentado na Cutinapp por…” no perfil público"
                  disabled={busy}
                />
              </> : <>
                <h2>Perfil independente</h2>
                <p className="text-secondary mb-0">Você ativou sua identidade por conta própria. Produções com as quais trabalhar aparecerão no histórico dos seus eventos, sem alterar a propriedade do perfil.</p>
              </>}
            </Card.Body></Card>
          </Col>
        </Row>
      </>}
    </Container>
  </div>;
}
