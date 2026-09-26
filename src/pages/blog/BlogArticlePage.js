import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Container } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
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

const headingId = (value, index) => `${String(value || "secao")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "") || "secao"}-${index}`;

function parseArticle(content) {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };

  const flushList = () => {
    if (list?.items?.length) blocks.push(list);
    list = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: Math.min(3, heading[1].length + 1), text: heading[2].trim() });
      return;
    }

    const unordered = line.match(/^[-*•]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(unordered[1].trim());
      return;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ordered[1].trim());
      return;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
      return;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "divider" });
      return;
    }

    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return blocks;
}

function InlineText({ text }) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:\/|https?:\/\/)[^)]+\))/g);
  return <>{parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;

    const link = part.match(/^\[([^\]]+)\]\(((?:\/|https?:\/\/)[^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith("/")) return <Link key={key} to={href}>{label}</Link>;
      return <a key={key} href={href} target="_blank" rel="noreferrer">{label}</a>;
    }

    return <React.Fragment key={key}>{part}</React.Fragment>;
  })}</>;
}

InlineText.propTypes = {
  text: PropTypes.string,
};

function ArticleBody({ content }) {
  const blocks = useMemo(() => parseArticle(content), [content]);
  if (blocks.length === 0) return <p className="cut-blog-content-empty">Este conteúdo ainda não possui texto publicado.</p>;

  let headingIndex = 0;
  return <div className="cut-blog-content">
    {blocks.map((block, index) => {
      if (block.type === "heading") {
        const id = headingId(block.text, headingIndex++);
        const Heading = block.level === 2 ? "h2" : "h3";
        return <Heading id={id} key={`${id}-${index}`}><InlineText text={block.text} /></Heading>;
      }
      if (block.type === "ul" || block.type === "ol") {
        const List = block.type;
        return <List key={`list-${index}`}>{block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}><InlineText text={item} /></li>)}</List>;
      }
      if (block.type === "quote") return <blockquote key={`quote-${index}`}><InlineText text={block.text} /></blockquote>;
      if (block.type === "divider") return <hr key={`divider-${index}`} />;
      return <p key={`paragraph-${index}`}><InlineText text={block.text} /></p>;
    })}
  </div>;
}

ArticleBody.propTypes = {
  content: PropTypes.string,
};

function ArticleCover({ entry }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(entry?.cover_image);

  if (src && !failed) {
    return <div className="cut-blog-article-cover-wrap">
      <img className="cut-blog-article-cover" src={src} alt={entry.title} decoding="async" onError={() => setFailed(true)} />
    </div>;
  }

  return <div className="cut-blog-article-cover-wrap cut-blog-article-cover-fallback" aria-hidden="true">
    <span className="cut-blog-cover-art__orb cut-blog-cover-art__orb--one" />
    <span className="cut-blog-cover-art__orb cut-blog-cover-art__orb--two" />
    <div><small>{entry?.category || "CUTINAPP"}</small><strong>{entry?.title}</strong></div>
  </div>;
}

ArticleCover.propTypes = {
  entry: PropTypes.shape({
    cover_image: PropTypes.string,
    title: PropTypes.string,
    category: PropTypes.string,
  }).isRequired,
};

function ArticleConversionBlock({ entry }) {
  const metadata = entry?.metadata || {};
  const audience = metadata.audience || "participant";
  const defaults = audience === "producer"
    ? {
      primary: { label: "Criar minha produção", path: "/production/create" },
      secondary: { label: "Ver produções na Cutinapp", path: "/productions" },
      title: "Transforme descoberta em público para o seu evento",
      text: "Crie sua presença na Cutinapp, publique experiências e conecte produção, artistas, ingressos e itens em uma jornada única.",
    }
    : audience === "artist"
      ? {
        primary: { label: "Explorar artistas", path: "/artists" },
        secondary: { label: "Ver eventos", path: "/event" },
        title: "Continue da leitura para experiências reais",
        text: "Descubra artistas, eventos e produções relacionados ao assunto e navegue pela cena diretamente na Cutinapp.",
      }
      : audience === "promoter"
        ? {
          primary: { label: "Encontrar eventos", path: "/event" },
          secondary: { label: "Explorar produções", path: "/productions" },
          title: "Encontre eventos para divulgar e acompanhar",
          text: "Use a Cutinapp como ponto de descoberta entre público, promoters, produções, artistas e experiências.",
        }
        : {
          primary: { label: "Descobrir eventos", path: "/event" },
          secondary: { label: "Explorar produções", path: "/productions" },
          title: "Continue descobrindo dentro da Cutinapp",
          text: "Passe do conteúdo para eventos, produções, artistas, ingressos e experiências relacionadas sem quebrar sua jornada.",
        };

  const primary = metadata.primary_cta || defaults.primary;
  const secondary = metadata.secondary_cta || defaults.secondary;

  return <aside className="cut-blog-conversion" aria-label="Próximos passos na Cutinapp">
    <div>
      <span className="cut-eyebrow">Próximo passo</span>
      <h2>{defaults.title}</h2>
      <p>{defaults.text}</p>
    </div>
    <div className="cut-blog-conversion-actions">
      <Link className="cut-blog-conversion-primary" to={primary.path || defaults.primary.path}>
        {primary.label || defaults.primary.label} <i className="fa-solid fa-arrow-right" />
      </Link>
      <Link className="cut-blog-conversion-secondary" to={secondary.path || defaults.secondary.path}>
        {secondary.label || defaults.secondary.label}
      </Link>
    </div>
  </aside>;
}

ArticleConversionBlock.propTypes = {
  entry: PropTypes.shape({
    metadata: PropTypes.object,
  }).isRequired,
};

export default function BlogArticlePage() {
  const { slug } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    blogService.show(slug).then((data) => active && setEntry(data))
      .catch((err) => active && setError(err.message || "Artigo não encontrado."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!entry) return undefined;
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
      image: mediaUrl(entry.cover_image || entry.og_image) || undefined,
      datePublished: entry.published_at || undefined,
      dateModified: entry.updated_at || undefined,
      mainEntityOfPage: canonicalUrl,
      publisher: { "@type": "Organization", name: "Cutinapp" },
      keywords: Array.isArray(entry.tags) ? entry.tags.join(", ") : undefined,
    };
    let script = document.getElementById("cutinapp-blog-schema");
    if (!script) { script = document.createElement("script"); script.type = "application/ld+json"; script.id = "cutinapp-blog-schema"; document.head.appendChild(script); }
    script.textContent = JSON.stringify(schema);
    return () => { document.getElementById("cutinapp-blog-schema")?.remove(); };
  }, [entry]);

  return <div className="cut-app-page cut-blog-page cut-blog-article-page">
    <NavlogComponent />
    <main>
      <Container className="cut-page-container cut-blog-article-shell">
        <Link to="/blog" className="cut-blog-back"><i className="fa-solid fa-arrow-left" /> Voltar ao blog</Link>
        {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
        {loading && <div className="cut-blog-loading"><ProcessingIndicatorComponent fullscreen={false} label="Carregando conteúdo" /></div>}

        {entry && <>
          <article className="cut-blog-article">
            <header className="cut-blog-article-header">
              <div className="cut-blog-article-kicker">
                <span>{entry.category || "Cutinapp"}</span>
                {entry.published_at && <time>{formatDate(entry.published_at)}</time>}
              </div>
              <h1>{entry.title}</h1>
              {entry.excerpt && <p className="cut-blog-lead">{entry.excerpt}</p>}
              <div className="cut-blog-article-signature">
                <span className="cut-blog-article-signature-mark">C</span>
                <span><strong>Cutinapp</strong><small>Conteúdo oficial da plataforma</small></span>
              </div>
            </header>

            <ArticleCover entry={entry} />

            <div className="cut-blog-reading-layout">
              <aside className="cut-blog-reading-aside">
                <span>Leitura</span>
                <strong>{entry.category || "Eventos"}</strong>
                {(entry.tags || []).slice(0, 4).map((tag) => <small key={tag}>{tag}</small>)}
              </aside>
              <ArticleBody content={entry.content} />
            </div>
          </article>

          <ArticleConversionBlock entry={entry} />
          <BlogDiscoveryCarousels
            currentSlug={entry.slug}
            relatedEvents={entry.related_events}
            relatedItems={entry.related_items}
            relatedProductions={entry.related_productions}
            relatedArtists={entry.related_artists}
          />
        </>}
      </Container>
    </main>
  </div>;
}
