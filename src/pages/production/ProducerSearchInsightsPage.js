import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import cutinappService from "../../services/CutinappService";

export default function ProducerSearchInsightsPage() {
  const [params, setParams] = useSearchParams();
  const [productions, setProductions] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const productionId = Number(params.get("production_id") || 0);
  const days = Number(params.get("days") || 30);

  useEffect(() => {
    let active = true;
    cutinappService.myProductions().then((items) => {
      if (!active) return;
      const list = Array.isArray(items) ? items : [];
      setProductions(list);
      if (!productionId && list[0]?.id) {
        const next = new URLSearchParams(params);
        next.set("production_id", String(list[0].id));
        setParams(next, { replace: true });
      }
    }).catch(() => active && setError("Não foi possível carregar suas produções."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!productionId) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError("");
    cutinappService.producerSearchInsights({ production_id: productionId, days })
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.response?.data?.message || "Não foi possível carregar os sinais de demanda."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId, days]);

  const selected = useMemo(() => productions.find((item) => Number(item.id) === productionId), [productions, productionId]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, String(value));
    setParams(next);
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div><span className="cut-eyebrow">Demanda real</span><h1>O que as pessoas estão procurando?</h1><p>Use a busca da Cutinapp como pesquisa de mercado: veja termos, cidades e oportunidades antes de decidir o próximo evento, atração ou oferta.</p></div>
        <div className="d-flex flex-wrap gap-2">
          <Form.Select value={productionId || ""} onChange={(event) => updateParam("production_id", event.target.value)} aria-label="Produção">
            <option value="">Selecione a produção</option>{productions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Form.Select>
          <Form.Select value={days} onChange={(event) => updateParam("days", event.target.value)} aria-label="Período"><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option><option value={180}>180 dias</option></Form.Select>
        </div>
      </div>

      {selected && <Alert variant="info"><strong>{selected.name}</strong> · Os sinais abaixo mostram demanda da Cutinapp e ajudam a decidir programação, comunicação e ofertas.</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2">Analisando demanda…</p></div> : <>
        <Row className="g-4 mb-4">
          <Col lg={7}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">Oportunidades</span><h2 className="h4 mt-2">Ações sugeridas pela demanda</h2>
            <div className="d-grid gap-3 mt-3">{(data?.opportunities || []).map((item) => <div key={item.query} className="border rounded-3 p-3"><div className="d-flex justify-content-between align-items-center gap-3"><strong>{item.query}</strong><Badge bg={item.zero_results > 0 ? "warning" : "info"} text={item.zero_results > 0 ? "dark" : undefined}>{item.searches} buscas</Badge></div><p className="text-secondary small mb-0 mt-2">{item.message}</p></div>)}
              {!data?.opportunities?.length && <div className="text-secondary">Ainda não há volume suficiente para gerar oportunidades confiáveis.</div>}
            </div>
          </Card.Body></Card></Col>
          <Col lg={5}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">Geografia</span><h2 className="h4 mt-2">Onde existe procura</h2>
            <div className="d-grid gap-2 mt-3">{(data?.cities || []).map((city) => <div key={`${city.city}-${city.uf}`} className="d-flex justify-content-between border-bottom border-secondary border-opacity-25 pb-2"><span>{city.city}{city.uf ? ` - ${city.uf}` : ""}</span><strong>{city.searches}</strong></div>)}</div>
          </Card.Body></Card></Col>
        </Row>
        <Card className="cut-panel"><Card.Body><span className="cut-eyebrow">Intenção</span><h2 className="h4 mt-2">Termos com maior procura</h2><div className="table-responsive mt-3"><table className="table table-dark table-hover align-middle"><thead><tr><th>Pesquisa</th><th>Buscas</th><th>Sem resultado</th><th>Sinal</th></tr></thead><tbody>{(data?.terms || []).map((term) => <tr key={term.normalized_query}><td><strong>{term.query}</strong></td><td>{term.searches}</td><td>{term.zero_results}</td><td>{term.zero_results > 0 ? <Badge bg="warning" text="dark">Oferta insuficiente</Badge> : <Badge bg="success">Demanda ativa</Badge>}</td></tr>)}</tbody></table></div></Card.Body></Card>
      </>}
    </Container>
  </div>;
}
