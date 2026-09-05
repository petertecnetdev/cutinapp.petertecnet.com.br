import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import CollapsibleFilterPanel from "../../components/CollapsibleFilterPanel";
import cutinappService from "../../services/CutinappService";

const TYPE_LABELS = { solo: "Artista solo", band: "Banda", duo: "Duo", group: "Grupo", collective: "Coletivo", orchestra: "Orquestra" };

export default function ArtistListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const q = params.get("q") || "";
  const city = params.get("city") || "";
  const activeFilterCount = Number(Boolean(q)) + Number(Boolean(city));

  useEffect(() => {
    let active = true;
    setLoading(true);
    cutinappService.artists({ q: q || undefined, city: city || undefined, per_page: 48 })
      .then((response) => active && setArtists(response.artists?.data || []))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os artistas."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [q, city]);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };

  const clearFilters = () => setParams(new URLSearchParams());

  return <div className="cut-app-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Buscando artistas" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Cena Cutinapp</span><h1>Artistas e formações</h1><p>Descubra artistas solo, bandas, duos, grupos e outras formações que movimentam os próximos eventos.</p></div></div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Card className="cut-discovery-shell mb-4"><Card.Body>
        <CollapsibleFilterPanel title="Pesquisar e filtrar artistas" activeCount={activeFilterCount} defaultOpen={activeFilterCount > 0}>
          <div className="cut-discovery-primary">
            <Form.Control placeholder="Buscar artista ou banda" value={q} onChange={(e) => update("q", e.target.value)} aria-label="Buscar artista ou banda" />
            <Form.Control placeholder="Cidade" value={city} onChange={(e) => update("city", e.target.value)} aria-label="Filtrar artistas por cidade" />
            {activeFilterCount > 0 && <Button type="button" variant="outline-light" onClick={clearFilters}>Limpar filtros</Button>}
          </div>
        </CollapsibleFilterPanel>
      </Card.Body></Card>
      {!loading && artists.length === 0 ? <Card className="cut-empty-state"><Card.Body><h2>Nenhum perfil artístico encontrado</h2><p>Tente outro nome ou cidade.</p></Card.Body></Card> : <Row className="g-4">{artists.map((artist) => <Col sm={6} lg={4} xl={3} key={artist.id}><Card className="cut-artist-card h-100" onClick={() => navigate(`/artist/${artist.slug}`)} role="button"><div className="cut-artist-card__photo">{artist.photo ? <img src={artist.photo} alt={artist.stage_name} /> : <span>{artist.stage_name?.slice(0,2).toUpperCase()}</span>}</div><Card.Body><div className="d-flex gap-2 align-items-center flex-wrap mb-2"><Badge bg="secondary">{TYPE_LABELS[artist.artist_type] || "Artista solo"}</Badge><span className="cut-eyebrow mb-0">{artist.genres?.slice(0,2).join(" · ") || "Cutinapp"}</span></div><h2>{artist.stage_name}</h2><p>{artist.city ? `${artist.city}${artist.uf ? ` - ${artist.uf}` : ""}` : "Perfil Cutinapp"}</p><div className="cut-social-stats"><span>{artist.followers_count || 0} seguidores</span><span>{artist.upcoming_events_count || 0} próximos eventos</span></div><Button className="w-100 mt-3">Ver perfil</Button></Card.Body></Card></Col>)}</Row>}
    </Container>
  </div>;
}
