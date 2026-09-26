import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";

export const entityUrl = (type, entity) => {
  const slug = entity?.slug || entity?.id;
  if (!slug) return null;
  if (type === "event") return `/event/${encodeURIComponent(slug)}`;
  if (type === "production") return `/production/${encodeURIComponent(slug)}/public`;
  if (type === "artist") return `/artist/${encodeURIComponent(slug)}`;
  if (type === "user") return `/profile/${encodeURIComponent(entity.id || slug)}`;
  return null;
};

export default function EntityLink({ type, entity, children, ...props }) {
  const url = entity?.url || entityUrl(type || entity?.type, entity);
  return url ? <Link to={url} {...props}>{children || entity?.name || entity?.title}</Link> : <span {...props}>{children || entity?.name || entity?.title}</span>;
}

EntityLink.propTypes = {
  type: PropTypes.string,
  entity: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), slug: PropTypes.string, url: PropTypes.string, type: PropTypes.string, name: PropTypes.string, title: PropTypes.string }),
  children: PropTypes.node,
};
