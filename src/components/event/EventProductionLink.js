import React, { useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { storageUrl } from "../../config";
import "./EventProductionLink.css";

const imageUrl = (source) => {
  if (typeof source !== "string" || !source.trim()) return "";
  const image = source.trim();
  if (/^https?:\/\//i.test(image)) return image;
  return storageUrl + image.replace(/^\/?storage\//, "").replace(/^\/+/, "");
};

const initials = (name) => String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function EventProductionLink({ production, className = "" }) {
  const [failedLogo, setFailedLogo] = useState("");
  const name = typeof production?.name === "string" ? production.name.trim() : "";
  if (!name) return null;

  const logo = imageUrl(production.logo || production.photo || production.image);
  const slug = typeof production.slug === "string" ? production.slug.trim() : "";
  const content = (
    <>
      <span className="cut-event-production__avatar">
        {logo && failedLogo !== logo
          ? <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setFailedLogo(logo)} />
          : initials(name)}
      </span>
      <strong className="cut-event-production__name" title={name}>{name}</strong>
      {slug && <i className="fa-solid fa-chevron-right" aria-hidden="true" />}
    </>
  );
  const classes = ["cut-event-production", className].filter(Boolean).join(" ");
  if (!slug) return <div className={classes}>{content}</div>;

  return (
    <Link to={"/production/" + encodeURIComponent(slug) + "/public"} className={classes} aria-label={"Ver produção " + name}>
      {content}
    </Link>
  );
}

EventProductionLink.propTypes = {
  production: PropTypes.shape({
    name: PropTypes.string,
    slug: PropTypes.string,
    logo: PropTypes.string,
    photo: PropTypes.string,
    image: PropTypes.string,
  }),
  className: PropTypes.string,
};
