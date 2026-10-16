import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import SeoHead, { SITE_URL } from "../../components/SeoHead";
import cutinappService from "../../services/CutinappService";
import { filterAvailableEventCities, groupCitiesByState, normalizeAvailableEventCities } from "../../utils/cityDirectory";
import "./cities-directory.css";

const eventCount = (total) => total === 1 ? "1 evento" : String(total) + " eventos";

const CityLink = ({ city, featured = false }) => (
  <Link className={featured ? "cut-cities__featured-city" : "cut-cities__city-link"}
    to={"/eventos/" + city.slug}
    aria-label={"Ver " + eventCount(city.total) + " em " + city.city + ", " + city.uf}>
    {featured && <span className="cut-cities__featured-icon"><i className="fa-solid fa-location-dot" aria-hidden="true" /></span>}
    <span className="cut-cities__city-copy"><strong>{city.city}</strong><small>{city.uf} <span aria-hidden="true">·</span> {eventCount(city.total)}</small></span>
    <i className="fa-solid fa-arrow-right cut-cities__city-arrow" aria-hidden="true" />
  </Link>
);

export default function CitiesDirectoryPage() {
  const [cities, setCities] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFailed(false);
    cutinappService.availableCities("events", "upcoming")
      .then((data) => { if (mounted) setCities(normalizeAvailableEventCities(data)); })
      .catch(() => { if (mounted) { setFailed(true); setCities([]); } })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [retry]);

  const visible = useMemo(() => filterAvailableEventCities(cities, query), [cities, query]);
  const groups = useMemo(() => groupCitiesByState(visible), [visible]);
  const popular = cities.slice(0, 6);
  const totalEvents = cities.reduce((sum, city) => sum + city.total, 0);
  const listSchema = useMemo(() => ({
    "@context": "https://schema.org", "@type": "ItemList",
    name: "Cidades com próximos eventos na Cutinapp",
    itemListElement: cities.map((city, index) => ({
      "@type": "ListItem", position: index + 1,
      name: city.city + " - " + city.uf, url: SITE_URL + "/eventos/" + city.slug,
    })),
  }), [cities]);

  return <div className="cut-app-page cut-cities-page">
    <SeoHead title="Cidades com eventos | Descubra onde sair | Cutinapp"
      description="Explore as cidades com eventos publicados na Cutinapp. Escolha sua cidade e descubra festas, shows e experiências disponíveis."
      canonical={SITE_URL + "/cidades"}
      robots={!loading && !failed && cities.length > 0 ? "index, follow" : "noindex, follow"}
      scriptId="cities-directory" jsonLd={cities.length ? listSchema : null} />
    <NavlogComponent />
    <main className="cut-cities">
      <section className="cut-cities__hero" aria-labelledby="cut-cities-title">
        <div className="cut-cities__container">
          <div className="cut-cities__breadcrumb"><Link to="/">Início</Link><i className="fa-solid fa-chevron-right" aria-hidden="true" /><span>Cidades</span></div>
          <div className="cut-cities__hero-layout">
            <div>
              <div className="cut-cities__eyebrow"><span className="cut-cities__pulse" /> DESCUBRA SUA CIDADE</div>
              <h1 id="cut-cities-title">Onde tem evento, <em>tem Cutinapp.</em></h1>
              <p>Encontre sua próxima experiência. Aqui aparecem somente cidades que têm eventos disponíveis para descobrir.</p>
            </div>
            <div className="cut-cities__summary" aria-live="polite">
              <strong>{loading ? "—" : cities.length}</strong>
              <span>{cities.length === 1 ? "cidade com eventos" : "cidades com eventos"}</span>
              {!loading && cities.length > 0 && <small>{eventCount(totalEvents)} no total</small>}
            </div>
          </div>
          <label htmlFor="cut-cities-search" className="cut-cities__search-label">Buscar cidade</label>
          <div className="cut-cities__search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input id="cut-cities-search" type="search" placeholder="Digite uma cidade ou UF"
              autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>}
          </div>
        </div>
      </section>
      <div className="cut-cities__container cut-cities__content">
        {loading && <div className="cut-cities__feedback" role="status"><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> Consultando cidades com eventos...</div>}
        {!loading && failed && <div className="cut-cities__feedback" role="alert">
          <strong>Não foi possível carregar as cidades.</strong>
          <p>A lista é atualizada automaticamente conforme novos eventos são publicados.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
        </div>}
        {!loading && !failed && cities.length === 0 && <div className="cut-cities__feedback" role="status">
          <strong>Nenhuma cidade com próximos eventos no momento.</strong>
          <p>Assim que houver eventos públicos disponíveis, as cidades aparecerão aqui.</p>
          <Link to="/event">Ver todos os eventos</Link>
        </div>}
        {!loading && !failed && cities.length > 0 && <>
          {!query.trim() && <section className="cut-cities__popular" aria-labelledby="cut-cities-popular-title">
            <div className="cut-cities__section-heading">
              <div><span>EM ALTA</span><h2 id="cut-cities-popular-title">Cidades com mais eventos</h2></div>
              <p>Comece por onde a cena está movimentada.</p>
            </div>
            <div className="cut-cities__featured-grid">
              {popular.map((city) => <CityLink key={city.slug} city={city} featured />)}
            </div>
          </section>}
          <section className="cut-cities__directory" aria-labelledby="cut-cities-list-title">
            <div className="cut-cities__section-heading">
              <div><span>EXPLORE</span><h2 id="cut-cities-list-title">{query.trim() ? "Resultados da busca" : "Todas as cidades disponíveis"}</h2></div>
              <p role="status">{visible.length} {visible.length === 1 ? "cidade encontrada" : "cidades encontradas"}</p>
            </div>
            {groups.length > 0 ? <div className="cut-cities__state-grid">
              {groups.map((group) => <section className="cut-cities__state" key={group.uf} aria-label={"Cidades de " + group.uf}>
                <header><strong className="cut-cities__state-uf">{group.uf}</strong><span>{group.cities.length} {group.cities.length === 1 ? "cidade" : "cidades"}</span></header>
                <div>{group.cities.map((city) => <CityLink key={city.slug} city={city} />)}</div>
              </section>)}
            </div> : <div className="cut-cities__feedback" role="status">
              <strong>Nenhuma cidade encontrada para esta busca.</strong>
              <p>Tente outro nome ou uma sigla de estado.</p>
              <button type="button" onClick={() => setQuery("")}>Limpar pesquisa</button>
            </div>}
          </section>
        </>}
      </div>
    </main>
  </div>;
}
