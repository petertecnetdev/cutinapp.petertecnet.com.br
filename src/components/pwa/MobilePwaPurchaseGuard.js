import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
  openPwaInstall,
  requiresPwaInstallForPurchase,
  subscribeToPwaInstallState,
} from "../../utils/pwaInstall";

export default function MobilePwaPurchaseGuard({ children }) {
  const [installRequired, setInstallRequired] = useState(() => requiresPwaInstallForPurchase());

  useEffect(() => subscribeToPwaInstallState(({ required }) => setInstallRequired(required)), []);

  if (!installRequired) return children;

  return (
    <div className="cut-checkout-page">
      <Container className="cut-checkout-container py-5">
        <div className="cut-commerce-panel mx-auto" style={{ maxWidth: 620 }}>
          <span className="cut-eyebrow">Antes de comprar</span>
          <h1 className="cut-section-title mt-2">Instale a Cutinapp</h1>
          <p className="text-secondary">
            No celular, a compra de ingressos é concluída pelo aplicativo instalado. É gratuito, rápido e deixa seus ingressos sempre acessíveis no aparelho.
          </p>
          <Alert variant="info">
            Assim que a instalação for concluída, o checkout será liberado automaticamente.
          </Alert>
          <Button className="w-100" size="lg" onClick={openPwaInstall}>
            <i className="fa-solid fa-download me-2" />Instalar Cutinapp
          </Button>
          <Button as={Link} to="/event" variant="link" className="w-100 mt-2">
            Voltar para os eventos
          </Button>
        </div>
      </Container>
    </div>
  );
}

MobilePwaPurchaseGuard.propTypes = {
  children: PropTypes.node.isRequired,
};
