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
    aria-label="Importar cardápio por foto e cadastrar itens"
    title="Importar cardápio por foto"
  >
    <i className="fa-solid fa-camera" />
    <span>Importar cardápio</span>
  </Button>;
}
