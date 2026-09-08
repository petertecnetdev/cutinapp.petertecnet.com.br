import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, Col, Container, Form, InputGroup, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import blogService from "../../services/BlogService";
import "../../styles/blog.css";

const formatDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value)) : "";

export default function BlogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    blogService.list().then((data) => {
      if (!active) return;
      setEntries(Array.isArray(data?.data) ? data.data : []);
    }).catch((err) => active && setError(err.message || "Não foi possível carregar o blog."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.title = "Blog Cutinapp | Eventos, produtores, experiências e novidades";
    const description = "Conteúdos exclusivos da Cutinapp sobre eventos, produtores, ingressos, experiências, tecnologia e cultura de eventos.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description;
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((item) => [item.title, item.excerpt, item.category, ...(item.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [entries, query]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return <div className="cut-app-page cut-blog-page">
    <NavlogComponent />
    <main>
      <section className="cut-blog-hero">
        <Container className="cut-page-container py-5">
          <span className="cut-eyebrow">Conteúdo exclusivo Cutinapp</span>
          <h1>Blog Cutinapp</h1>
          <p>Eventos, histórias, bastidores, tecnologia, produtores e tudo que movimenta experiências reais.</p>
          <InputGroup className="cut-blog-search mt-4">
            <InputGroup.Text><i className="fa-solid fa-magnifying-glass" /></InputGroup.Text>
            <Form.Control value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar no blog" aria-label="Pesquisar artigos" />
          </InputGroup>
        </Container>
      </section>

      <Container className="cut-page-container py-4 py-lg-5">
        {error && <Alert variant="danger">{error}</Alert>}
        {loading && <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando artigos...</p></div>}

        {!loading && filtered.length === 0 && <div className="cut-blog-empty"><h2>Nenhum artigo encontrado</h2><p>Novos conteúdos da Cutinapp aparecerão aqui.</p></div>}

        {featured && <Card as={Link} to={`/blog/${featured.slug}`} className="cut-blog-featured text-decoration-none text-reset mb-5">
          <Row className="g-0 align-items-stretch">
            <Col lg={7}>{featured.cover_image ? <img src={featured.cover_image} alt={featured.title} className="cut-blog-featured-image" /> : <div className="cut-blog-cover-placeholder"><i className="fa-solid fa-calendar-star" /></div>}</Col>
            <Col lg={5}><Card.Body className="p-4 p-lg-5 d-flex flex-column justify-content-center h-100">
              <div className="d-flex flex-wrap gap-2 mb-3"><Badge bg="dark">Destaque</Badge>{featured.category && <Badge bg="secondary">{featured.category}</Badge>}</div>
              <h2>{featured.title}</h2>
              {featured.excerpt && <p>{featured.excerpt}</p>}
              <small>{formatDate(featured.published_at)}</small>
            </Card.Body></Col>
          </Row>
        </Card>}

        {rest.length > 0 && <Row className="g-4">
          {rest.map((entry) => <Col md={6} xl={4} key={entry.id}>
            <Card as={Link} to={`/blog/${entry.slug}`} className="cut-blog-card h-100 text-decoration-none text-reset">
              {entry.cover_image ? <Card.Img variant="top" src={entry.cover_image} alt={entry.title} /> : <div className="cut-blog-card-placeholder"><i className="fa-solid fa-newspaper" /></div>}
              <Card.Body>
                <div className="d-flex justify-content-between gap-2 mb-2"><span className="cut-eyebrow">{entry.category || "Cutinapp"}</span><small>{formatDate(entry.published_at)}</small></div>
                <Card.Title>{entry.title}</Card.Title>
                {entry.excerpt && <Card.Text>{entry.excerpt}</Card.Text>}
              </Card.Body>
            </Card>
          </Col>)}
        </Row>}
      </Container>
    </main>
  </div>;
}
