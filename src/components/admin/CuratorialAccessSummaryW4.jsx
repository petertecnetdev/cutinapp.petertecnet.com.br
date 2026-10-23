import React from "react";
import PropTypes from "prop-types";
import { resolveCuratorialReadScopeW4 } from "./curatorialAccessPolicyW4";

/**
 * Componente isolado: não registra rota nem faz requisição e não habilita checkout.
 * A exibição do monitor completo depende do contrato e das permissões da API.
 */
export default function CuratorialAccessSummaryW4({ context, applicationId }) {
  const access = resolveCuratorialReadScopeW4(context, applicationId);
  if (!access.canView) {
    return <section aria-label="Monitoramento da curadoria" role="status">
      <p>Acesso ao monitoramento indisponível.</p>
    </section>;
  }

  return <section aria-label="Monitoramento da curadoria">
    <h2>Curadoria automatizada</h2>
    <p>{access.role} · consulta somente leitura.</p>
    <p>Execuções, fontes, erros e reivindicações dependem de dados confirmados pela API.</p>
    <p>Ingressos curatoriais são informativos; nenhuma venda é disponibilizada aqui.</p>
  </section>;
}

CuratorialAccessSummaryW4.propTypes = {
  context: PropTypes.object,
  applicationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
