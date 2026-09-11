import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Col, Form, Row } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EntityEditorShell, { EditorSection } from "../../components/editor/EntityEditorShell";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

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
const media = (value) => !value ? "" : /^https?:\/\//i.test(value) ? value : `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
const initials = (name) => String(name || "A").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function ArtistManagePage() {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [activeSection, setActiveSection] = useState("artist-editor-identity");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => setArtists(await cutinappService.myArtists());
  useEffect(() => {
    let active = true;
    cutinappService.myArtists()
      .then((r) => active && setArtists(r))
      .catch((e) => active && setError(e?.message || "Não foi possível carregar os artistas."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const isGroup = GROUP_TYPES.has(form.artist_type || "solo");
  const linkableArtists = useMemo(() => artists.filter((artist) => artist.id !== editing), [artists, editing]);
  const sections = useMemo(() => [
    { key: "artist-editor-identity", label: "Identidade", icon: "fa-regular fa-id-card" },
    { key: "artist-editor-about", label: "Sobre", icon: "fa-regular fa-align-left" },
    { key: "artist-editor-media", label: "Foto e capa", icon: "fa-regular fa-image" },
    { key: "artist-editor-links", label: "Links", icon: "fa-solid fa-link" },
    ...(editing && isGroup ? [{ key: "artist-editor-members", label: "Formação", icon: "fa-solid fa-users" }] : []),
    { key: "artist-editor-managed", label: "Meus artistas", icon: "fa-solid fa-list" },
  ], [editing, isGroup]);

  const edit = async (artist) => {
    setEditing(artist.id);
    setForm({ ...empty, ...artist, claim_myself: false, artist_type: artist.artist_type || "solo", genres: Array.isArray(artist.genres) ? artist.genres.join(", ") : "" });
    setMembers([]);
    setMemberForm(emptyMember);
    setActiveSection("artist-editor-identity");
    if (GROUP_TYPES.has(artist.artist_type)) {
      try { setMembers(await cutinappService.artistMembers(artist.id)); }
      catch (err) { setError(err?.message || "Não foi possível carregar os integrantes."); }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancel = () => {
    setEditing(null);
    setForm(empty);
    setMembers([]);
    setMemberForm(emptyMember);
    setActiveSection("artist-editor-identity");
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    const payload = {
      ...form,
      uf: form.uf?.toUpperCase(),
      genres: String(form.genres || "").split(",").map((x) => x.trim()).filter(Boolean),
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
        if (!editing) cancel();
      }
    } catch (err) {
      setError(err?.message || "Não foi possível salvar o artista.");
    } finally {
      setBusy(false);
    }
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
    } catch (err) {
      setError(err?.message || "Não foi possível adicionar o integrante.");
    } finally {
      setBusy(false);
    }
  };

  const finishMember = async (member) => {
    setBusy(true); setError("");
    try {
      await cutinappService.updateArtistMember(editing, member.id, { is_current: false, left_at: new Date().toISOString().slice(0, 10) });
      setMembers(await cutinappService.artistMembers(editing));
      setSuccess("Integrante movido para o histórico da formação.");
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar o integrante.");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (memberId) => {
    setBusy(true); setError("");
    try {
      await cutinappService.deleteArtistMember(editing, memberId);
      setMembers(await cutinappService.artistMembers(editing));
      setSuccess("Integrante removido.");
    } catch (err) {
      setError(err?.message || "Não foi possível remover o integrante.");
    } finally {
      setBusy(false);
    }
  };

  const photo = media(form.photo);
  const cover = media(form.cover);
  const location = [form.city, form.uf].filter(Boolean).join(" - ");
  const genreList = String(form.genres || "").split(",").map((item) => item.trim()).filter(Boolean);
  const currentMembers = members.filter((member) => member.is_current);
  const preview = (
    <>
      <div className="cut-editor-preview-hero" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <div className="cut-editor-preview-hero__content">
          <div className="cut-editor-preview-avatar">
            {photo ? <img src={photo} alt="" /> : <span>{initials(form.stage_name)}</span>}
          </div>
          <div className="cut-editor-preview-copy">
            <span className="cut-eyebrow">{typeLabel(form.artist_type)}</span>
            <h3>{form.stage_name || "Nome artístico"}</h3>
            <p>{location || "Cidade do artista"}</p>
            <div className="cut-editor-preview-meta">
              {genreList.slice(0, 3).map((genre) => <span key={genre}>#{genre}</span>)}
              {isGroup && <span><i className="fa-solid fa-users me-1" />{currentMembers.length} integrantes</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="cut-editor-preview-body">
        <h4>Sobre</h4>
        <p>{form.bio?.trim() || "A biografia do artista aparecerá nesta área da view."}</p>
      </div>
    </>
  );

  return <div className="cut-app-page">
    <NavlogComponent />
    {(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando artistas" : "Atualizando perfil artístico"} />}
    {error && <div className="container cut-page-container pt-3"><Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert></div>}
    {!error && success && <div className="container cut-page-container pt-3"><Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert></div>}

    <Form onSubmit={submit}>
      <EntityEditorShell
        eyebrow={editing ? "Editar artista" : "Cadastrar artista"}
        title={form.stage_name || (editing ? "Editar perfil artístico" : "Novo perfil artístico")}
        description="A edição acompanha a mesma hierarquia da página pública do artista: identidade, bio, mídia, links e formação."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        status={busy ? "saving" : "saved"}
        statusLabel={busy ? "Salvando..." : editing ? "Editando perfil" : "Novo perfil"}
        preview={preview}
        previewLabel="Prévia do perfil artístico"
        secondaryActions={editing ? <Button type="button" variant="outline-light" onClick={cancel}>Cancelar edição</Button> : null}
        primaryAction={<Button type="submit" disabled={busy}>{editing ? "Salvar alterações" : "Criar perfil"}</Button>}
      >
        <EditorSection id="artist-editor-identity" eyebrow="Topo da view" title="Identidade artística" hint="Nome, tipo, cidade e gêneros formam o primeiro contexto do perfil.">
          <Row className="g-3">
            <Col md={5}><Form.Group><Form.Label>Tipo *</Form.Label><Form.Select value={form.artist_type || "solo"} onChange={(e) => setForm({ ...form, artist_type: e.target.value })}>{ARTIST_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group></Col>
            <Col md={7}><Form.Group><Form.Label>Nome artístico *</Form.Label><Form.Control value={form.stage_name} onChange={(e) => setForm({ ...form, stage_name: e.target.value })} required /></Form.Group></Col>
            {!editing && <Col xs={12}><div className="cut-info-box p-3"><Form.Check type="switch" id="artist-is-me" label="Este perfil artístico é meu" checked={Boolean(form.claim_myself)} onChange={(e) => setForm({ ...form, claim_myself: e.target.checked })} /><small className="text-secondary">Desmarque ao cadastrar um artista do seu evento que ainda não possui conta.</small></div></Col>}
            <Col md={8}><Form.Group><Form.Label>Cidade</Form.Label><Form.Control value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.uf || ""} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })} /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>Gêneros / categorias</Form.Label><Form.Control value={form.genres || ""} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Rock, MPB, Eletrônico" /><Form.Text>Separe por vírgulas. A prévia atualiza imediatamente.</Form.Text></Form.Group></Col>
          </Row>
        </EditorSection>

        <EditorSection id="artist-editor-about" eyebrow="Seção Sobre" title="Biografia" hint="Explique quem é o artista, sua proposta e trajetória.">
          <Form.Group><Form.Label>Biografia</Form.Label><Form.Control as="textarea" rows={6} value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Form.Group>
        </EditorSection>

        <EditorSection id="artist-editor-media" eyebrow="Topo da view" title="Foto e capa" hint="As URLs abaixo alimentam diretamente o avatar e o hero da página pública.">
          <Row className="g-3">
            <Col md={6}><Form.Group><Form.Label>Foto (URL)</Form.Label><Form.Control value={form.photo || ""} onChange={(e) => setForm({ ...form, photo: e.target.value })} placeholder="https://..." /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Capa (URL)</Form.Label><Form.Control value={form.cover || ""} onChange={(e) => setForm({ ...form, cover: e.target.value })} placeholder="https://..." /></Form.Group></Col>
          </Row>
        </EditorSection>

        <EditorSection id="artist-editor-links" eyebrow="Ações públicas" title="Links e plataformas" hint="Estes links ficam associados ao perfil artístico e facilitam a descoberta fora da Cutinapp.">
          <Row className="g-3">
            <Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control value={form.instagram_url || ""} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Spotify</Form.Label><Form.Control value={form.spotify_url || ""} onChange={(e) => setForm({ ...form, spotify_url: e.target.value })} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>YouTube</Form.Label><Form.Control value={form.youtube_url || ""} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Site</Form.Label><Form.Control value={form.website_url || ""} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /></Form.Group></Col>
          </Row>
        </EditorSection>

        {editing && isGroup && <EditorSection id="artist-editor-members" eyebrow="Seção Formação" title="Integrantes" hint="A formação atual aparece vinculada ao perfil do grupo.">
          <div className="mb-4">
            <Row className="g-3">
              <Col md={6}><Form.Group><Form.Label>Vincular perfil Cutinapp</Form.Label><Form.Select value={memberForm.member_artist_id} onChange={(e) => setMemberForm({ ...memberForm, member_artist_id: e.target.value })}><option value="">Sem perfil vinculado</option>{linkableArtists.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Form.Select></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Nome do integrante</Form.Label><Form.Control value={memberForm.display_name} onChange={(e) => setMemberForm({ ...memberForm, display_name: e.target.value })} placeholder="Pode ficar vazio se houver perfil vinculado" /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Função</Form.Label><Form.Control value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} placeholder="Vocal, guitarra, DJ..." /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Entrada na formação</Form.Label><Form.Control type="date" value={memberForm.joined_at} onChange={(e) => setMemberForm({ ...memberForm, joined_at: e.target.value })} /></Form.Group></Col>
              <Col xs={12}><Button type="button" disabled={busy} onClick={addMember}>Adicionar integrante</Button></Col>
            </Row>
          </Form>
          <div className="d-grid gap-2">
            {members.length === 0 ? <p className="text-secondary mb-0">Nenhum integrante cadastrado.</p> : members.map((member) => <div className="cut-info-box p-3" key={member.id}><div className="d-flex justify-content-between gap-3 align-items-center flex-wrap"><div className="d-flex gap-3 align-items-center"><div className="cut-artist-card__photo" style={{ width: 54, height: 54 }}>{member.photo || member.linked_artist?.photo ? <img src={media(member.photo || member.linked_artist?.photo)} alt={member.display_name} /> : <span>{initials(member.display_name)}</span>}</div><div><div className="d-flex gap-2 align-items-center flex-wrap"><strong>{member.display_name}</strong><Badge bg={member.is_current ? "success" : "secondary"}>{member.is_current ? "Atual" : "Histórico"}</Badge></div><small className="text-secondary">{member.role || "Integrante"}</small></div></div><div className="d-flex gap-2">{member.is_current && <Button type="button" size="sm" variant="outline-warning" onClick={() => finishMember(member)}>Encerrar</Button>}<Button type="button" size="sm" variant="outline-danger" onClick={() => removeMember(member.id)}>Remover</Button></div></div></div>)}
          </div>
        </EditorSection>}

        <EditorSection id="artist-editor-managed" eyebrow="Gestão" title="Perfis administrados por você" hint="Selecione um artista para abrir o mesmo padrão de edição acima.">
          {!loading && artists.length === 0 ? <p className="text-secondary mb-0">Você ainda não cadastrou artistas.</p> : <div className="d-grid gap-2">{artists.map((artist) => <div className="cut-info-box p-3" key={artist.id}><div className="d-flex align-items-center justify-content-between gap-3 flex-wrap"><div><div className="d-flex gap-2 align-items-center flex-wrap"><strong>{artist.stage_name}</strong><Badge bg="secondary">{typeLabel(artist.artist_type)}</Badge>{artist.claimed_at ? <Badge bg="success">Perfil reivindicado</Badge> : <Badge bg="warning" text="dark">Aguardando artista</Badge>}</div><div className="text-secondary small">{artist.city || "Sem cidade"} · {artist.genres?.join(" · ") || "Sem gênero"}</div></div><Button type="button" variant="outline-light" onClick={() => edit(artist)}>Editar</Button></div></div>)}</div>}
        </EditorSection>
      </EntityEditorShell>
    </Form>
  </div>;
}
