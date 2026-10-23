import React from "react";
import PropTypes from "prop-types";
import { resolveCuratorialReadScopeW4 } from "./curatorialAccessPolicyW4";
import { buildAutomationSnapshotW4, describeWorkerW4 } from "./curatorialAutomationSnapshotW4";

/** Componente isolado: sem rota, requisição, ações de escrita ou checkout. */
export default function CuratorialAutomationMonitorW4({ context, applicationId, apiResponse }) {
  const scope = resolveCuratorialReadScopeW4(context, applicationId);
  if (!scope.canView) return <p role="status">Acesso ao monitoramento indisponível.</p>;
  const snapshot = buildAutomationSnapshotW4(apiResponse);
  if (!snapshot.valid) return <p role="status">Dados de automações indisponíveis. Nenhuma contagem foi presumida.</p>;
  return <section aria-label="Monitoramento da curadoria" className="container-fluid px-0">
    <h2 className="h4">Curadoria automatizada</h2>
    <p className="small">{scope.role} · consulta somente leitura.</p>
    <p role="status">Execução global: {snapshot.globalEnabled === null ? "não informada" : snapshot.globalEnabled ? "habilitada" : "desabilitada"}.</p>
    <p className="small text-secondary">Métricas da última execução de cada worker. O comando events:discover é separado; exit 0 não comprova varredura.</p>
    {!snapshot.complete && <p role="alert">Histórico incompleto ou inválido; os dados exibidos podem ser parciais.</p>}
    <div className="row g-3">{snapshot.workers.map((worker) =>
      <div className="col-12 col-lg-6" key={worker.key}><section className="border rounded p-3 h-100" aria-label={"Worker " + worker.key}>
        <h3 className="h6 text-break">{worker.key}</h3>
        <p>{describeWorkerW4(snapshot.globalEnabled, worker.enabled)} · {snapshot.historyReliable ? (worker.latest?.label || "Sem execução registrada") : "Última execução indeterminada"}</p>
        {worker.latest?.errorType && <p role="alert" className="text-break">Tipo de falha: {worker.latest.errorType}</p>}
        <dl className="row mb-0">{worker.metrics.map((metric) =>
          <React.Fragment key={metric.key}>
            <dt className="col-9 small fw-normal text-break">{metric.label}</dt>
            <dd className="col-3 text-end">{metric.value === null ? "—" : metric.value}</dd>
          </React.Fragment>)}</dl>
      </section></div>)}</div>
    <h3 className="h5 mt-4">Últimas execuções</h3>
    {snapshot.historyReliable ? <div className="table-responsive"><table className="table table-sm">
      <caption>Até 30 execuções recentes, sem logs sensíveis</caption>
      <thead><tr><th scope="col">ID</th><th scope="col">Worker</th><th scope="col">Situação</th></tr></thead>
      <tbody>{snapshot.runs.length === 0 ? <tr><td colSpan={3}>Nenhuma execução registrada.</td></tr> :
        snapshot.runs.map((run) => <tr key={run.id}><th scope="row">{run.id}</th><td>{run.key}</td><td>{run.label}</td></tr>)}</tbody>
    </table></div> : <p role="alert">Execuções ocultadas devido à inconsistência do histórico.</p>}
    <p className="small text-secondary">Reivindicações e contagens por fonte exigem contratos específicos. Ingressos curatoriais não verificados são informativos; este monitor não disponibiliza checkout.</p>
  </section>;
}
CuratorialAutomationMonitorW4.propTypes = {
  context: PropTypes.object,
  applicationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  apiResponse: PropTypes.object,
};
