import React, { useEffect, useMemo, useState } from "react";
import { Alert, Container, Form, InputGroup, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import BlogDiscoveryCarousels from "../../components/blog/BlogDiscoveryCarousels";
import blogService from "../../services/BlogService";
import { storageUrl } from "../../config";
import "../../styles/blog.css";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value))
  : "";

const mediaUrl = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  return `${storageUrl}${raw.replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

function BlogCover({ entry, featured = false }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(entry?.cover_image);

  if (src && !failed) {
    return <img
      src={src}
      alt={entry.title}
      className={featured ? "cut-blog-featured-image" : "cut-blog-card-image"}
      loading={featured ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />;
  }

  return <div className={`cut-blog-cover-art ${featured ? "is-featured" : ""}`} aria-hidden="true">
    <span className="cut-blog-cover-art__orb cut-blog-cover-art__orb--one" />
    <span className="cut-blog-cover-art__orb cut-blog-cover-art__orb--two" />
    <div>
      <small>{entry?.category || "CUTINAPP"}</small>
      <strong>{String(entry?.title || "Conteúdo Cutinapp").slice(0, 72)}</strong>
    </div>
  </div>;
}

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
    return entries.filter((item) => [item.title, item.excerpt, item.category, ...(item.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(term));
  }, [entries, query]);

  const featured = filtered[0] || null;

  return <div className="cut-app-page cut-blog-page">
    <NavlogComponent />
    <main>
      <section className="cut-blog-hero">
        <div className="cut-blog-hero-grid" aria-hidden="true" />
        <Container className="cut-page-container cut-blog-hero-inner">
          <div className="cut-blog-hero-copy">
            <span className="cut-eyebrow">Blog Cutinapp</span>
            <h1>Conteúdo para quem <span>vive eventos.</span></h1>
            <p>Histórias, ideias, bastidores e referências para participantes, produtores, artistas e todo mundo que movimenta experiências reais.</p>
          </div>
          <div className="cut-blog-hero-tools">
            <InputGroup className="cut-blog-search">
              <InputGroup.Text><i className="fa-solid fa-magnifying-glass" /></InputGroup.Text>
              <Form.Control value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busque por assunto, evento ou ideia" aria-label="Pesquisar artigos" />
            </InputGroup>
            {!loading && entries.length > 0 && <small><strong>{entries.length}</strong> conteúdos publicados</small>}
          </div>
        </Container>
      </section>

      <Container className="cut-page-container cut-blog-main-content">
        {error && <Alert variant="danger">{error}</Alert>}
        {loading && <div className="cut-blog-loading"><Spinner /><p>Carregando conteúdos...</p></div>}

        {!loading && filtered.length === 0 && <div className="cut-blog-empty">
          <span><i className="fa-regular fa-newspaper" /></span>
          <h2>Nenhum conteúdo encontrado</h2>
          <p>{query ? "Tente pesquisar por outro assunto." : "Novos conteúdos da Cutinapp aparecerão aqui."}</p>
        </div>}

        {featured && <section className="cut-blog-featured-wrap" aria-labelledby="cut-blog-featured-title">
          <div className="cut-blog-section-label"><span>Em destaque</span><i /></div>
          <Link to={`/blog/${featured.slug}`} className="cut-blog-featured">
            <div className="cut-blog-featured-media"><BlogCover entry={featured} featured /></div>
            <div className="cut-blog-featured-content">
              <div className="cut-blog-featured-meta">
                <span>{featured.category || "Cutinapp"}</span>
                {featured.published_at && <time>{formatDate(featured.published_at)}</time>}
              </div>
              <h2 id="cut-blog-featured-title">{featured.title}</h2>
              {featured.excerpt && <p>{featured.excerpt}</p>}
              <strong>Continuar lendo <i className="fa-solid fa-arrow-right" /></strong>
            </div>
          </Link>
        </section>}

        {featured && <BlogDiscoveryCarousels
          currentSlug={featured.slug}
          blogEntries={filtered}
          showBlogs={filtered.length > 1}
        />}
      </Container>
    </main>
  </div>;
}
