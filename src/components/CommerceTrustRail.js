import React from "react";
import PropTypes from "prop-types";
import "./CommerceTrustRail.css";

const CONTENT = {
  discovery: [
    ["fa-solid fa-ticket", "Ingresso no mesmo fluxo", "Descubra, escolha e acompanhe sua compra na Cutinapp."],
    ["fa-solid fa-location-dot", "Contexto completo", "Data, local, produção e line-up antes de decidir."],
    ["fa-solid fa-shield-halved", "Compra transparente", "Valor e disponibilidade ficam claros antes do pagamento."],
  ],
  event: [
    ["fa-solid fa-receipt", "Total antes de pagar", "Ingressos, itens e descontos são revisados antes da cobrança."],
    ["fa-solid fa-qrcode", "Ingresso após aprovação", "A emissão e o QR Code acompanham a confirmação do pedido."],
    ["fa-solid fa-rotate", "Compra recuperável", "Se a página fechar, a Cutinapp retoma o mesmo pedido com segurança."],
  ],
  checkout: [
    ["fa-solid fa-lock", "Pagamento protegido", "A Cutinapp não repete uma cobrança automaticamente."],
    ["fa-solid fa-receipt", "Sem valor escondido", "O total final é mostrado antes da confirmação."],
    ["fa-solid fa-ticket", "Emissão acompanhada", "Pagamento aprovado e emissão do ingresso são reconciliados."],
  ],
};

export default function CommerceTrustRail({ context = "discovery", provider = "" }) {
  const items = CONTENT[context] || CONTENT.discovery;
  return (
    <div className={`cut-commerce-trust cut-commerce-trust--${context}`} aria-label="Garantias da experiência Cutinapp">
      {items.map(([icon, title, description]) => (
        <div className="cut-commerce-trust__item" key={title}>
          <i className={icon} aria-hidden="true" />
          <span><strong>{title}</strong><small>{description}</small></span>
        </div>
      ))}
      {provider && <div className="cut-commerce-trust__provider" aria-label={`Pagamento processado por ${provider}`}><span>Processamento</span><strong>{provider}</strong></div>}
    </div>
  );
}

CommerceTrustRail.propTypes = {
  context: PropTypes.oneOf(["discovery", "event", "checkout"]),
  provider: PropTypes.string,
};
