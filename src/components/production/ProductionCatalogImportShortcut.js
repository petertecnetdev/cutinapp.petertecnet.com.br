import React from "react";
import { Button } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import "./production-catalog-import-shortcut.css";

export default function ProductionCatalogImportShortcut() {
  const location = useLocation();
  const navigate = useNavigate();
  const match = location.pathname.match(/^\/production\/(\d+)$/);

  if (!match) return null;

  return <Button
    type="button"
    className="cut-catalog-import-shortcut"
    onClick={() => navigate(`/production/${match[1]}/items/import`)}
    aria-label="Importar cardápio e cadastrar itens com inteligência artificial"
    title="Importar cardápio com IA"
  >
    <i className="fa-solid fa-wand-magic-sparkles" />
    <span>Importar cardápio</span>
  </Button>;
}
