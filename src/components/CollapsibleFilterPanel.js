import React, { useId, useState } from "react";
import PropTypes from "prop-types";
import { Collapse } from "react-bootstrap";
import "./CollapsibleFilterPanel.css";

export default function CollapsibleFilterPanel({
  children,
  title = "Filtros de pesquisa",
  activeCount = 0,
  defaultOpen = false,
  className = "",
  bodyClassName = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId();
  const panelId = `cut-filter-panel-${reactId.replace(/:/g, "")}`;
  const activeLabel = activeCount === 1 ? "1 filtro ativo" : `${activeCount} filtros ativos`;

  return (
    <div className={`cut-collapsible-filters ${open ? "is-open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="cut-collapsible-filters__toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="cut-collapsible-filters__title">
          <span className="cut-collapsible-filters__icon" aria-hidden="true">
            <i className="fa-solid fa-sliders" />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{activeCount > 0 ? activeLabel : "Refine os resultados quando precisar"}</small>
          </span>
        </span>

        <span className="cut-collapsible-filters__action" aria-hidden="true">
          <span>{open ? "Ocultar" : "Mostrar"}</span>
          {activeCount > 0 && <span className="cut-collapsible-filters__count">{activeCount}</span>}
          <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} />
        </span>
      </button>

      <Collapse in={open}>
        <div id={panelId}>
          <div className={`cut-collapsible-filters__body ${bodyClassName}`.trim()}>{children}</div>
        </div>
      </Collapse>
    </div>
  );
}

CollapsibleFilterPanel.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string,
  activeCount: PropTypes.number,
  defaultOpen: PropTypes.bool,
  className: PropTypes.string,
  bodyClassName: PropTypes.string,
};
