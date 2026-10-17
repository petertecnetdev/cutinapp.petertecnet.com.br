import React, { useEffect, useState } from "react";
import { Container } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import publicCatalogService from "../../services/PublicCatalogService";
import { storageUrl } from "../../config";
import { homeCatalogItemRoute } from "../../utils/homeCatalogItems";
import "./public-catalog-item.css";

const mediaUrl = (value) => {
  if (!value) return "";
  const image = String(value).trim();
  if (/^https?:\/\//i.test(image)) return image;
  return `${storageUrl}${image.replace(/^\/?storage\//, "").replace(/^\/+/, "")}`;
};
const imageFor = (item) => {
  const file = Array.isArray(item?.files) ? item.files.find((entry) => entry?.public_url || entry?.url || entry?.path) : null;
  return mediaUrl(item?.image_url || item?.image || file?.public_url || file?.url || file?.path);
};
const formatPrice = (price, currency) => {
  if (price == null) return "Consulte a produção";
  const locale = typeof navigator !== "undefined" ? navigator.language : undefined;
  if (typeof currency === "string" && /^[A-Z]{3}$/.test(currency.toUpperCase())) {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(Number(price));
  }
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(price));
};

export default function PublicCatalogItemPage() {
  const { itemId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setDetail(null);
    publicCatalogService.item(itemId)
      .then((response) => { if (active) setDetail(response); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [itemId]);

  const item = detail?.item;
  const production = detail?.establishment;
  const otherItems = Array.isArray(detail?.other_items) ? detail.other_items : [];

  return <div className="cut-app-page cut-public-catalog-item">
    <NavlogComponent />
    <Container className="cut-page-container cut-public-catalog-item__container">
      <Link to="/" className="cut-public-catalog-item__back"><i className="fa-solid fa-arrow-left" /> Voltar à Cutinapp</Link>
      {loading && <p role="status">Carregando item...</p>}
      {!loading && (error || !item) && <div className="cut-public-catalog-item__message" role="alert"><h1>Item indisponível</h1><p>Este item não está disponível no catálogo público no momento.</p><Link to="/productions">Ver produções</Link></div>}
      {!loading && item && <>
        <main className="cut-public-catalog-item__detail">
          <div className="cut-public-catalog-item__image">
            {imageFor(item) ? <img src={imageFor(item)} alt={item.name} /> : <i className="fa-solid fa-bag-shopping" aria-hidden="true" />}
          </div>
          <div className="cut-public-catalog-item__information">
            <span className="cut-public-catalog-item__eyebrow">Catálogo da produção</span>
            <h1>{item.name}</h1>
            {production && <p className="cut-public-catalog-item__production"><i className="fa-solid fa-store" /> {production.fantasy || production.name}</p>}
            <strong className="cut-public-catalog-item__price">{formatPrice(item.price, item.currency || production?.currency)}</strong>
            {item.description && <p className="cut-public-catalog-item__description">{item.description}</p>}
            <p className="cut-public-catalog-item__notice">Informações do catálogo da produção. Disponibilidade e condições de compra devem ser confirmadas com o responsável.</p>
          </div>
        </main>
        {otherItems.length > 0 && <section className="cut-public-catalog-item__more"><h2>Mais itens deste catálogo</h2><div className="cut-public-catalog-item__grid">{otherItems.map((related) => <Link key={related.id} to={homeCatalogItemRoute(related.id)}><div>{imageFor(related) ? <img src={imageFor(related)} alt="" loading="lazy" /> : <i className="fa-solid fa-bag-shopping" />}</div><strong>{related.name}</strong></Link>)}</div></section>}
      </>}
    </Container>
  </div>;
}
