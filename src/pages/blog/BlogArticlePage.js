import React, { useEffect, useState } from "react";
import { Alert, Badge, Container, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import blogService from "../../services/BlogService";
import "../../styles/blog.css";

const formatDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value)) : "";

export default function BlogArticlePage() {
  const { slug } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    blogService.show(slug).then((data) => active && setEntry(data))
      .catch((err) => active && setError(err.message || "Artigo não encontrado."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!entry) return;
    document.title = entry.seo?.title || entry.seo_title || `${entry.title} | Blog Cutinapp`;
    const description = entry.seo?.description || entry.seo_description || entry.excerpt || "Conteúdo exclusivo da Cutinapp.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description;

    const canonicalUrl = entry.seo?.canonical_url || entry.canonical_url || `${window.location.origin}/blog/${entry.slug}`;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;

    const schema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: entry.title,
      description,
      image: entry.cover_image || entry.og_image || undefined,
      datePublished: entry.published_at || undefined,
      dateModified: entry.updated_at || undefined,
      mainEntityOfPage: canonicalUrl,
      publisher: { "@type": "Organization", name: "Cutinapp" },
    };
    let script = document.getElementById("cutinapp-blog-schema");
    if (!script) { script = document.createElement("script"); script.type = "application/ld+json"; script.id = "cutinapp-blog-schema"; document.head.appendChild(script); }
    script.textContent = JSON.stringify(schema);
    return () => { document.getElementById("cutinapp-blog-schema")?.remove(); };
  }, [entry]);

  return <div className="cut-app-page cut-blog-page">
    <NavlogComponent />
    <Container className="cut-blog-article-container py-4 py-lg-5">
      <Link to="/blog" className="cut-blog-back"><i className="fa-solid fa-arrow-left" /> Blog Cutinapp</Link>
      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
      {loading && <div className="text-center py-5"><Spinner /></div>}
      {entry && <article className="cut-blog-article mt-4">
        <header>
          <div className="d-flex flex-wrap gap-2 mb-3">{entry.category && <Badge bg="dark">{entry.category}</Badge>}{(entry.tags || []).slice(0, 4).map((tag) => <Badge bg="secondary" key={tag}>{tag}</Badge>)}</div>
          <h1>{entry.title}</h1>
          {entry.excerpt && <p className="cut-blog-lead">{entry.excerpt}</p>}
          <div className="cut-blog-meta">{formatDate(entry.published_at)} · Blog oficial da Cutinapp</div>
        </header>
        {entry.cover_image && <img className="cut-blog-article-cover" src={entry.cover_image} alt={entry.title} />}
        <div className="cut-blog-content">{String(entry.content || "").split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        {Array.isArray(entry.related_content) && entry.related_content.length > 0 && <aside className="cut-blog-related">
          <h2>Continue lendo</h2>
          {entry.related_content.map((related) => <Link key={related.id} to={`/blog/${related.slug}`}>{related.title}</Link>)}
        </aside>}
      </article>}
    </Container>
  </div>;
}
