import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";

const ARTIST_TYPES = [
  ["solo", "Artista solo"],
  ["band", "Banda"],
  ["duo", "Duo"],
  ["group", "Grupo"],
  ["collective", "Coletivo"],
  ["orchestra", "Orquestra"],
];
const GROUP_TYPES = new Set(["band", "duo", "group", "collective", "orchestra"]);
const empty = { artist_type: "solo", stage_name: "", bio: "", city: "", uf: "", genres: "", instagram_url: "", youtube_url: "", spotify_url: "", website_url: "", photo: "", cover: "", is_published: true, claim_myself: false };
const emptyMember = { member_artist_id: "", display_name: "", role: "", photo: "", bio: "", sort_order: 0, is_current: true, joined_at: "" };
const typeLabel = (type) => ARTIST_TYPES.find(([value]) => value === type)?.[1] || "Artista solo";

export default function ArtistManagePage() {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => setArtists(await cutinappService.myArtists());
  useEffect(() => { let active = true; cutinappService.myArtists().then((r) => active && setArtists(r)).catch((e) => active && setError(e?.message || "Não foi possível carregar os artistas.")).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);

  const isGroup = GROUP_TYPES.has(form.artist_type || "solo");
  const linkableArtists = useMemo(() => artists.filter((artist) => artist.id !== editing), [artists, editing]);

  const edit = async (artist) => {
    setEditing(artist.id);
    setForm({ ...empty, ...artist, claim_myself: false, artist_type: artist.artist_type || "solo", genres: Array.isArray(artist.genres) ? artist.genres.join(", ") : "" });
    setMembers([]);
    setMemberForm(emptyMember);
    if (GROUP_TYPES.has(artist.artist_type)) {
      try { setMembers(await cutinappService.artistMembers(artist.id)); }
      catch (err) { setError(err?.message || "Não foi possível carregar os integrantes."); }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancel = () => { setEditing(null); setForm(empty); setMembers([]); setMemberForm(emptyMember); };

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const payload = {
      ...form,
      uf: form.uf?.toUpperCase(),
      genres: form.genres.split(",").map((x) => x.trim()).filter(Boolean),
    };
    if (editing) delete payload.claim_myself;

    try {
      const response = editing ? await cutinappService.updateArtist(editing, payload) : await cutinappService.createArtist(payload);
      const artistId = editing || response.artist?.id;
      await load();
      if (!editing && GROUP_TYPES.has(form.artist_type) && artistId) {
        setEditing(artistId);
        setForm({ ...form, claim_myself: false });
        setMembers([]);
        setSuccess(form.claim_myself ? "Seu perfil foi criado. Agora adicione os integrantes da formação." : "Perfil provisório criado. O artista poderá reivindicá-lo quando criar a conta; agora você pode adicionar os integrantes.");
      } else {
        setSuccess(response.message || "Artista salvo.");
        cancel();
      }
    } catch (err) { setError(err?.message || "Não foi possível salvar o artista."); }
    finally { setBusy(false); }
  };

  const addMember = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const payload = {
        ...memberForm,
        member_artist_id: memberForm.member_artist_id ? Number(memberForm.member_artist_id) : null,
        sort_order: Number(memberForm.sort_order || 0),
        joined_at: memberForm.joined_at || null,
      };
      const response = await cutinappService.createArtistMember(editing, payload);
      setMembers(await cutinappService.artistMembers(editing));
      setMemberForm(emptyMember);
      setSuccess(response.message || "Integrante adicionado.");
    } catch (err) { setError(err?.message || "Não foi possível adicionar o integrante."); }
    finally { setBusy(false); }
  };

  const finishMember = async (member) => {
    setBusy(true); setError("");
    try {
      await cutinappService.updateArtistMember(editing, member.id, { is_current: false, left_at: new Date().toISOString().slice(0, 10) });
      setMembers(await cutinappService.artistMembers(editing));
      setSuccess("Integrante movido para o histórico da formação.");
    } catch (err) { setError(err?.message || "Não foi possível atualizar o integrante."); }
    finally { setBusy(false); }
  };

  const removeMember = async (memberId) => {
    setBusy(true); setError("");
    try {
      await cutinappService.deleteArtistMember(editing, memberId);
      setMembers(await cutinappService.artistMembers(editing));
      setSuccess("Integrante removido.");
    } catch (err) { setError(err?.message || "Não foi possível remover o integrante."); }
    finally { setBusy(false); }
  };

  return <div className="cut-app-page"><NavlogComponent />{(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando artistas" : "Atualizando perfil artístico"} />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Artistas e formações</h1><p>Você pode cadastrar o artista antes de ele ter conta. O perfil fica provisório e o próprio artista poderá reivindicar sua identidade e participação depois.</p></div></div>
      {error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}
      <Row className="g-4"><Col lg={5}><Card className="cut-panel"><Card.Body className="p-4"><h2 className="cut-section-title">{editing ? "Editar perfil artístico" : "Novo perfil artístico"}</h2>
        <Form onSubmit={submit} className="cut-form-grid">
          <Form.Group><Form.Label>Tipo *</Form.Label><Form.Select value={form.artist_type || "solo"} onChange={(e) => setForm({ ...form, artist_type: e.target.value })}>{ARTIST_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select><Form.Text>Bandas e grupos aparecem como uma única atração no line-up; os integrantes aparecem dentro do perfil.</Form.Text></Form.Group>
          <Form.Group><Form.Label>Nome artístico *</Form.Label><Form.Control value={form.stage_name} onChange={(e) => setForm({ ...form, stage_name: e.target.value })} required /></Form.Group>
          {!editing && <Card className="cut-info-box"><Card.Body><Form.Check type="switch" id="artist-is-me" label="Este perfil artístico é meu" checked={Boolean(form.claim_myself)} onChange={(e) => setForm({ ...form, claim_myself: e.target.checked })} /><small className="text-secondary">Deixe desmarcado quando estiver cadastrando um artista do seu evento que ainda não possui conta. Ele poderá reivindicar o perfil depois.</small></Card.Body></Card>}
          <Form.Group><Form.Label>Biografia</Form.Label><Form.Control as="textarea" rows={5} value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Form.Group>
          <div className="cut-two-cols"><Form.Group><Form.Label>Cidade</Form.Label><Form.Control value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Form.Group><Form.Group><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.uf || ""} onChange={(e) => setForm({ ...form, uf: e.target.value })} /></Form.Group></div>
          <Form.Group><Form.Label>Gêneros / categorias</Form.Label><Form.Control value={form.genres || ""} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Rock, MPB, Eletrônico" /><Form.Text>Separe por vírgulas.</Form.Text></Form.Group>
          <Form.Group><Form.Label>Foto (URL)</Form.Label><Form.Control value={form.photo || ""} onChange={(e) => setForm({ ...form, photo: e.target.value })} /></Form.Group>
          <Form.Group><Form.Label>Capa (URL)</Form.Label><Form.Control value={form.cover || ""} onChange={(e) => setForm({ ...form, cover: e.target.value })} /></Form.Group>
          <Form.Group><Form.Label>Instagram</Form.Label><Form.Control value={form.instagram_url || ""} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} /></Form.Group>
          <Form.Group><Form.Label>Spotify</Form.Label><Form.Control value={form.spotify_url || ""} onChange={(e) => setForm({ ...form, spotify_url: e.target.value })} /></Form.Group>
          <div className="cut-form-actions"><Button type="submit">{editing ? "Salvar alterações" : "Criar perfil"}</Button>{editing && <Button type="button" variant="outline-light" onClick={cancel}>Cancelar</Button>}</div>
        </Form>
      </Card.Body></Card>
      {editing && isGroup && <Card className="cut-panel mt-4"><Card.Body className="p-4"><span className="cut-eyebrow">Formação</span><h2 className="cut-section-title">Adicionar integrante</h2><Form onSubmit={addMember} className="cut-form-grid">
        <Form.Group><Form.Label>Vincular perfil Cutinapp (opcional)</Form.Label><Form.Select value={memberForm.member_artist_id} onChange={(e) => setMemberForm({ ...memberForm, member_artist_id: e.target.value })}><option value="">Sem perfil vinculado</option>{linkableArtists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Form.Select></Form.Group>
        <Form.Group><Form.Label>Nome do integrante</Form.Label><Form.Control value={memberForm.display_name} onChange={(e) => setMemberForm({ ...memberForm, display_name: e.target.value })} placeholder="Pode ficar vazio se houver perfil vinculado" /></Form.Group>
        <div className="cut-two-cols"><Form.Group><Form.Label>Função</Form.Label><Form.Control value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} placeholder="Vocal, guitarra, DJ..." /></Form.Group><Form.Group><Form.Label>Entrada na formação</Form.Label><Form.Control type="date" value={memberForm.joined_at} onChange={(e) => setMemberForm({ ...memberForm, joined_at: e.target.value })} /></Form.Group></div>
        <Form.Group><Form.Label>Foto própria (opcional)</Form.Label><Form.Control value={memberForm.photo} onChange={(e) => setMemberForm({ ...memberForm, photo: e.target.value })} /></Form.Group>
        <Button type="submit">Adicionar integrante</Button>
      </Form></Card.Body></Card>}
      </Col>
      <Col lg={7}><div className="cut-section-heading"><div><span className="cut-eyebrow">Perfis administrados por você</span><h2>Artistas</h2></div></div>
        {!loading && artists.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>Você ainda não cadastrou artistas.</p></Card.Body></Card> : <div className="cut-admin-list">{artists.map((artist) => <Card className="cut-panel" key={artist.id}><Card.Body className="p-3 d-flex align-items-center justify-content-between gap-3"><div><div className="d-flex gap-2 align-items-center flex-wrap"><strong>{artist.stage_name}</strong><Badge bg="secondary">{typeLabel(artist.artist_type)}</Badge>{artist.claimed_at ? <Badge bg="success">Perfil reivindicado</Badge> : <Badge bg="warning" text="dark">Aguardando artista</Badge>}</div><div className="text-secondary small">{artist.city || "Sem cidade"} · {artist.genres?.join(" · ") || "Sem gênero"}</div></div><Button variant="outline-light" onClick={() => edit(artist)}>Editar</Button></Card.Body></Card>)}</div>}
        {editing && isGroup && <div className="mt-4"><div className="cut-section-heading"><div><span className="cut-eyebrow">Integrantes</span><h2>{members.filter((member) => member.is_current).length} na formação atual</h2></div></div>{members.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>Nenhum integrante cadastrado para esta formação.</p></Card.Body></Card> : <div className="cut-admin-list">{members.map((member) => <Card className="cut-panel" key={member.id}><Card.Body className="p-3"><div className="d-flex justify-content-between gap-3"><div className="d-flex gap-3"><div className="cut-artist-card__photo" style={{ width: 54, height: 54 }}>{member.photo || member.linked_artist?.photo ? <img src={member.photo || member.linked_artist?.photo} alt={member.display_name} /> : <span>{member.display_name?.slice(0, 2).toUpperCase()}</span>}</div><div><div className="d-flex gap-2 align-items-center"><strong>{member.display_name}</strong><Badge bg={member.is_current ? "success" : "secondary"}>{member.is_current ? "Atual" : "Histórico"}</Badge></div><div className="text-secondary small">{member.role || "Integrante"}{member.linked_artist ? ` · perfil: ${member.linked_artist.stage_name}` : ""}</div></div></div><div className="d-flex gap-2 flex-wrap justify-content-end">{member.is_current && <Button size="sm" variant="outline-warning" onClick={() => finishMember(member)}>Encerrar participação</Button>}<Button size="sm" variant="outline-danger" onClick={() => removeMember(member.id)}>Remover</Button></div></div></Card.Body></Card>)}</div>}</div>}
      </Col></Row>
    </Container>
  </div>;
}
