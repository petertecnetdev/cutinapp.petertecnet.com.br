import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";

const empty = { stage_name: "", bio: "", city: "", uf: "", genres: "", instagram_url: "", youtube_url: "", spotify_url: "", website_url: "", photo: "", cover: "", is_published: true };

export default function ArtistManagePage() {
  const [artists, setArtists] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => setArtists(await cutinappService.myArtists());
  useEffect(() => { let active = true; cutinappService.myArtists().then((r) => active && setArtists(r)).catch((e) => active && setError(e?.message || "Não foi possível carregar os artistas." )).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);

  const edit = (artist) => {
    setEditing(artist.id);
    setForm({ ...empty, ...artist, genres: Array.isArray(artist.genres) ? artist.genres.join(", ") : "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const payload = { ...form, uf: form.uf?.toUpperCase(), genres: form.genres.split(",").map((x) => x.trim()).filter(Boolean) };
    try {
      const response = editing ? await cutinappService.updateArtist(editing, payload) : await cutinappService.createArtist(payload);
      setSuccess(response.message || "Artista salvo."); setForm(empty); setEditing(null); await load();
    } catch (err) { setError(err?.message || "Não foi possível salvar o artista."); }
    finally { setBusy(false); }
  };

  return <div className="cut-app-page"><NavlogComponent />{(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando artistas" : "Salvando artista"} />}
    <Container className="cut-page-container py-4 py-lg-5"><div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Artistas</h1><p>Cadastre perfis artísticos e depois vincule-os aos line-ups dos seus eventos.</p></div></div>{error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}
      <Row className="g-4"><Col lg={5}><Card className="cut-panel"><Card.Body className="p-4"><h2 className="cut-section-title">{editing ? "Editar artista" : "Novo artista"}</h2><Form onSubmit={submit} className="cut-form-grid"><Form.Group><Form.Label>Nome artístico *</Form.Label><Form.Control value={form.stage_name} onChange={(e) => setForm({ ...form, stage_name: e.target.value })} required /></Form.Group><Form.Group><Form.Label>Biografia</Form.Label><Form.Control as="textarea" rows={5} value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Form.Group><div className="cut-two-cols"><Form.Group><Form.Label>Cidade</Form.Label><Form.Control value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Form.Group><Form.Group><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.uf || ""} onChange={(e) => setForm({ ...form, uf: e.target.value })} /></Form.Group></div><Form.Group><Form.Label>Gêneros / categorias</Form.Label><Form.Control value={form.genres || ""} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Eletrônico, House, DJ" /><Form.Text>Separe por vírgulas.</Form.Text></Form.Group><Form.Group><Form.Label>Foto (URL)</Form.Label><Form.Control value={form.photo || ""} onChange={(e) => setForm({ ...form, photo: e.target.value })} /></Form.Group><Form.Group><Form.Label>Capa (URL)</Form.Label><Form.Control value={form.cover || ""} onChange={(e) => setForm({ ...form, cover: e.target.value })} /></Form.Group><Form.Group><Form.Label>Instagram</Form.Label><Form.Control value={form.instagram_url || ""} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} /></Form.Group><Form.Group><Form.Label>Spotify</Form.Label><Form.Control value={form.spotify_url || ""} onChange={(e) => setForm({ ...form, spotify_url: e.target.value })} /></Form.Group><div className="cut-form-actions"><Button type="submit">{editing ? "Salvar alterações" : "Criar artista"}</Button>{editing && <Button type="button" variant="outline-light" onClick={() => { setEditing(null); setForm(empty); }}>Cancelar</Button>}</div></Form></Card.Body></Card></Col><Col lg={7}><div className="cut-section-heading"><div><span className="cut-eyebrow">Perfis vinculados a você</span><h2>Meus artistas</h2></div></div>{!loading && artists.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>Você ainda não cadastrou artistas.</p></Card.Body></Card> : <div className="cut-admin-list">{artists.map((artist) => <Card className="cut-panel" key={artist.id}><Card.Body className="p-3 d-flex align-items-center justify-content-between gap-3"><div><strong>{artist.stage_name}</strong><div className="text-secondary small">{artist.city || "Sem cidade"} · {artist.genres?.join(" · ") || "Sem gênero"}</div></div><Button variant="outline-light" onClick={() => edit(artist)}>Editar</Button></Card.Body></Card>)}</div>}</Col></Row>
    </Container>
  </div>;
}
