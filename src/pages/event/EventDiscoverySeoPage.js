import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import SeoHead, { SITE_URL } from "../../components/SeoHead";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { absoluteAssetUrl } from "../../utils/eventSeo";

const PERIODS = {
  hoje: { api: "today", label: "hoje" },
  amanha: { api: "tomorrow", label: "amanhã" },
  "fim-de-semana": { api: "weekend", label: "neste fim de semana" },
  sexta: { api: "friday", label: "na sexta-feira" },
  sabado: { api: "saturday", label: "no sábado" },
  domingo: { api: "sunday", label: "no domingo" },
  "proximos-7-dias": { api: "next7", label: "nos próximos 7 dias" },
  "proximos-30-dias": { api: "next30", label: "nos próximos 30 dias" },
};

const slugify = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const humanize = (value = "") => String(value)
  .split("-")
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

const eventDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
}).format(new Date(value)) : "Data a confirmar";

const longToday = () => new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
}).format(new Date());

const normalizeEvents = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.events)) return response.events;
  if (Array.isArray(response?.events?.data)) return response.events.data;
  if (Array.isArray(response?.data)) return response.data;
  return [];
};

const normalizeFacets = (response) => ({
  cities: Array.isArray(response?.cities) ? response.cities : (Array.isArray(response?.data?.cities) ? response.data.cities : []),
  categories: Array.isArray(response?.categories) ? response.categories : (Array.isArray(response?.data?.categories) ? response.data.categories : []),
});

const discoveryTitle = ({ city, period, category }) => {
  if (category && city) return `${category} em ${city} | Eventos e ingressos | Cutinapp`;
  if (period && city) return `Eventos ${period.label} em ${city} | Cutinapp`;
  if (city) return `Eventos em ${city} | Festas, shows e ingressos | Cutinapp`;
  return "Eventos hoje e próximos eventos | Cutinapp";
};

const discoveryDescription = ({ city, period, category }) => {
  if (category && city) return `Encontre ${category.toLowerCase()} em ${city}, confira datas, locais, atrações e ingressos disponíveis na Cutinapp.`;
  if (period && city) return `Veja eventos ${period.label} em ${city}, com programação, locais, atrações e ingressos disponíveis na Cutinapp.`;
  if (city) return `Descubra festas, shows, encontros e experiências em ${city}. Veja datas, locais e ingressos na Cutinapp.`;
  return "Descubra eventos de hoje, amanhã e do fim de semana. Encontre programação, locais, atrações e ingressos na Cutinapp.";
};

const discoveryHeading = ({ city, period, category }) => {
  if (category && city) return `${category} em ${city}`;
  if (period?.api === "today" && city) return `Eventos hoje em ${city} — ${longToday()}`;
  if (period && city) return `Eventos ${period.label} em ${city}`;
  if (city) return `Eventos em ${city}`;
  return "Eventos na Cutinapp";
};

export default function EventDiscoverySeoPage() {
  const { citySlug = "", periodSlug = "", categorySlug = "" } = useParams();
  const [facets, setFacets] = useState({ cities: [], categories: [] });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [facetsLoaded, setFacetsLoaded] = useState(false);

  const period = PERIODS[periodSlug] || null;
  const resolvedCity = useMemo(() => {
    if (!citySlug) return "";
    return facets.cities.find((item) => slugify(item.city) === citySlug)?.city || "";
  }, [citySlug, facets.cities]);
  const resolvedUf = useMemo(() => {
    if (!resolvedCity) return "";
    return facets.cities.find((item) => item.city === resolvedCity)?.uf || "";
  }, [resolvedCity, facets.cities]);
  const resolvedCategory = useMemo(() => {
    if (!categorySlug) return "";
    return facets.categories.find((item) => slugify(item.category) === categorySlug)?.category || "";
  }, [categorySlug, facets.categories]);

  useEffect(() => {
    let active = true;
    cutinappService.discoveryFacets()
      .then((response) => {
        if (active) setFacets(normalizeFacets(response));
      })
      .catch(() => {
        if (active) setFacets({ cities: [], categories: [] });
      })
      .finally(() => {
        if (active) setFacetsLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!facetsLoaded) return undefined;
    if (citySlug && !resolvedCity) {
      setEvents([]);
      setLoading(false);
      setError(`Ainda não há uma cidade ativa correspondente a “${humanize(citySlug)}” na Cutinapp.`);
      return undefined;
    }
    if (categorySlug && !resolvedCategory) {
      setEvents([]);
      setLoading(false);
      setError(`Ainda não há eventos ativos na categoria “${humanize(categorySlug)}”.`);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");
    const params = {
      per_page: 30,
      sort: "soonest",
      ...(resolvedCity ? { city: resolvedCity } : {}),
      ...(resolvedUf ? { uf: resolvedUf } : {}),
      ...(period?.api ? { period: period.api } : {}),
      ...(resolvedCategory ? { category: resolvedCategory } : {}),
    };

    eventService.search(params)
      .then((response) => {
        if (active) setEvents(normalizeEvents(response));
      })
      .catch((err) => {
        if (active) {
          setEvents([]);
          setError(err?.message || "Não foi possível consultar os eventos agora.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [facetsLoaded, citySlug, categorySlug, resolvedCity, resolvedUf, resolvedCategory, period?.api]);

  const canonicalPath = categorySlug
    ? `/eventos/${citySlug}/categoria/${categorySlug}`
    : periodSlug
      ? `/eventos/${citySlug}/${periodSlug}`
      : citySlug
        ? `/eventos/${citySlug}`
        : "/eventos";

  const seoContext = { city: resolvedCity, period, category: resolvedCategory };
  const title = discoveryTitle(seoContext);
  const description = discoveryDescription(seoContext);
  const heading = discoveryHeading(seoContext);
  const invalidRoute = facetsLoaded && ((citySlug && !resolvedCity) || (categorySlug && !resolvedCategory));

  const jsonLd = useMemo(() => {
    const canonical = `${SITE_URL}${canonicalPath}`;
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: heading,
      url: canonical,
      numberOfItems: events.length,
      itemListElement: events.map((event, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}/event/${encodeURIComponent(event.slug)}`,
        item: {
          "@type": "Event",
          name: event.title,
          url: `${SITE_URL}/event/${encodeURIComponent(event.slug)}`,
          startDate: event.start_date || undefined,
          endDate: event.end_date || undefined,
          image: absoluteAssetUrl(event.image) || undefined,
          location: {
            "@type": "Place",
            name: event.venue || event.address || event.city || undefined,
            address: {
              "@type": "PostalAddress",
              streetAddress: event.address || undefined,
              addressLocality: event.city || undefined,
              addressRegion: event.uf || undefined,
              addressCountry: "BR",
            },
          },
        },
      })),
    };
    const breadcrumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Cutinapp", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Eventos", item: `${SITE_URL}/eventos` },
        ...(resolvedCity ? [{ "@type": "ListItem", position: 3, name: `Eventos em ${resolvedCity}`, item: `${SITE_URL}/eventos/${citySlug}` }] : []),
        ...(period ? [{ "@type": "ListItem", position: resolvedCity ? 4 : 3, name: `Eventos ${period.label}`, item: canonical }] : []),
        ...(resolvedCategory ? [{ "@type": "ListItem", position: resolvedCity ? 4 : 3, name: resolvedCategory, item: canonical }] : []),
      ],
    };
    return [itemList, breadcrumbs];
  }, [canonicalPath, citySlug, events, heading, period, resolvedCategory, resolvedCity]);

  const firstImage = absoluteAssetUrl(events[0]?.image);
  const topCities = facets.cities.slice(0, 12);
  const topCategories = facets.categories.slice(0, 12);
  const periodLinks = ["hoje", "amanha", "fim-de-semana", "proximos-7-dias"];

  return <div className="cut-app-page">
    <SeoHead
      title={title}
      description={description}
      canonical={`${SITE_URL}${canonicalPath}`}
      image={firstImage || `${SITE_URL}/images/logo.png`}
      robots={invalidRoute ? "noindex, follow" : "index, follow, max-image-preview:large"}
      jsonLd={invalidRoute ? null : jsonLd}
      scriptId="discovery"
    />
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Buscando eventos" />}

    <Container className="cut-page-container py-4 py-lg-5">
      <header className="mb-4 mb-lg-5">
        <span className="cut-eyebrow">Descoberta pública</span>
        <h1 className="cut-section-title mt-2">{heading}</h1>
        <p className="text-secondary fs-5 mb-0">{description}</p>
      </header>

      {error && <Alert variant="warning">{error}</Alert>}

      {resolvedCity && <nav className="d-flex flex-wrap gap-2 mb-4" aria-label={`Filtros de eventos em ${resolvedCity}`}>
        <Button as={Link} size="sm" variant={!periodSlug && !categorySlug ? "light" : "outline-light"} to={`/eventos/${citySlug}`}>Todos</Button>
        {periodLinks.map((slug) => <Button key={slug} as={Link} size="sm" variant={periodSlug === slug ? "light" : "outline-light"} to={`/eventos/${citySlug}/${slug}`}>{PERIODS[slug].label.charAt(0).toUpperCase() + PERIODS[slug].label.slice(1)}</Button>)}
      </nav>}

      {!loading && !invalidRoute && events.length === 0 && <Card className="cut-panel mb-4"><Card.Body className="p-4"><h2 className="h5">Nenhum evento encontrado neste recorte</h2><p className="text-secondary mb-0">A programação é atualizada conforme os produtores publicam novos eventos. Explore outros períodos ou cidades disponíveis abaixo.</p></Card.Body></Card>}

      {events.length > 0 && <section aria-labelledby="event-results" className="mb-5">
        <div className="cut-section-heading"><div><span className="cut-eyebrow">Programação</span><h2 id="event-results">{events.length} evento{events.length === 1 ? "" : "s"} encontrado{events.length === 1 ? "" : "s"}</h2></div></div>
        <Row className="g-4">
          {events.map((event) => <Col key={event.id || event.slug} md={6} xl={4}>
            <Card className="cut-panel h-100 overflow-hidden">
              {event.image && <Card.Img variant="top" src={absoluteAssetUrl(event.image)} alt={`Flyer de ${event.title}`} style={{ aspectRatio: "16 / 9", objectFit: "cover" }} />}
              <Card.Body className="p-4 d-flex flex-column">
                <div className="d-flex flex-wrap gap-2 mb-2">{event.category && <Badge bg="dark">{event.category}</Badge>}{event.city && <Badge bg="secondary">{event.city}{event.uf ? ` - ${event.uf}` : ""}</Badge>}</div>
                <h3 className="h5">{event.title}</h3>
                <p className="text-secondary mb-2"><i className="fa-regular fa-calendar me-2" />{eventDate(event.start_date)}</p>
                <p className="text-secondary mb-4"><i className="fa-solid fa-location-dot me-2" />{event.venue || event.address || event.city || "Local a confirmar"}</p>
                <Button as={Link} to={`/event/${event.slug}`} className="mt-auto">Ver evento e ingressos</Button>
              </Card.Body>
            </Card>
          </Col>)}
        </Row>
      </section>}

      {topCities.length > 0 && <section className="mb-5" aria-labelledby="cities-heading">
        <div className="cut-section-heading"><div><span className="cut-eyebrow">Cidades</span><h2 id="cities-heading">Explore eventos por cidade</h2></div></div>
        <div className="d-flex flex-wrap gap-2">{topCities.map((item) => <Button key={`${item.city}-${item.uf}`} as={Link} variant={resolvedCity === item.city ? "light" : "outline-light"} to={`/eventos/${slugify(item.city)}`}>{item.city}{item.uf ? ` - ${item.uf}` : ""} <Badge bg="secondary" className="ms-1">{item.total}</Badge></Button>)}</div>
      </section>}

      {resolvedCity && topCategories.length > 0 && <section className="mb-4" aria-labelledby="categories-heading">
        <div className="cut-section-heading"><div><span className="cut-eyebrow">Categorias</span><h2 id="categories-heading">Tipos de evento em {resolvedCity}</h2></div></div>
        <div className="d-flex flex-wrap gap-2">{topCategories.map((item) => <Button key={item.category} as={Link} variant={resolvedCategory === item.category ? "light" : "outline-light"} to={`/eventos/${citySlug}/categoria/${slugify(item.category)}`}>{item.category}</Button>)}</div>
      </section>}
    </Container>
  </div>;
}
