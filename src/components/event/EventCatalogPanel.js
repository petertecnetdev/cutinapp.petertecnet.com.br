import React, { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import commerceService from "../../services/CommerceService";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const normalizeCatalog = (payload) => (payload?.catalog || []).map((item) => ({
  ...item,
  selected: Boolean(item.selected),
  price: String(item?.event_item?.price ?? item?.defaults?.price ?? item?.catalog_price ?? ""),
  quantity: String(item?.event_item?.quantity ?? item?.defaults?.quantity ?? item?.catalog_stock ?? 0),
}));

export default function EventCatalogPanel({ eventId }) {
  const [rows, setRows] = useState([]);
  const [manualItems, setManualItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const payload = await commerceService.eventCatalog(eventId);
      setRows(normalizeCatalog(payload));
      setManualItems(payload?.manual_items || []);
    } catch (err) {
      setError(err?.message || "Não foi possível carregar o catálogo deste estabelecimento.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const selectedCount = useMemo(() => rows.filter((item) => item.selected).length, [rows]);

  const updateRow = (itemId, patch) => {
    setRows((current) => current.map((row) => (
      row.item_id === itemId ? { ...row, ...patch } : row
    )));
    setSuccess("");
  };

  const selectAll = () => {
    setRows((current) => current.map((row) => ({
      ...row,
      selected: true,
      price: row.price || String(row?.defaults?.price ?? row.catalog_price ?? ""),
      quantity: row.quantity || String(row?.defaults?.quantity ?? row.catalog_stock ?? 0),
    })));
    setSuccess("");
  };

  const clearAll = () => {
    setRows((current) => current.map((row) => ({ ...row, selected: false })));
    setSuccess("");
  };

  const save = async () => {
    setError("");
    setSuccess("");

    const selected = rows.filter((row) => row.selected);
    const invalid = selected.find((row) => Number(row.price) <= 0 || Number(row.quantity) < 0);
    if (invalid) {
      setError(`Revise preço e quantidade de ${invalid.name}.`);
      return;
    }

    setSaving(true);
    try {
      const payload = await commerceService.syncEventCatalog(eventId, {
        replace: true,
        items: selected.map((row) => ({
          item_id: Number(row.item_id),
          price: Number(row.price),
          quantity: Number(row.quantity),
          is_active: true,
        })),
      });
      setRows(normalizeCatalog(payload));
      setManualItems(payload?.manual_items || []);
      setSuccess(payload?.message || "Produtos do evento atualizados.");
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar os produtos deste evento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="cut-panel mt-4">
      <Card.Body className="p-4 p-lg-5">
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-4">
          <div>
            <span className="cut-eyebrow">Pré-compra no evento</span>
            <h2 className="cut-section-title mt-2 mb-2">Produtos do estabelecimento</h2>
            <p className="text-body-secondary mb-0">
              Escolha o que será vendido antecipadamente nesta data. Preço e quantidade são próprios do evento e não alteram o catálogo geral.
            </p>
          </div>
          <Badge bg={selectedCount > 0 ? "success" : "secondary"} className="align-self-start">
            {selectedCount} selecionado(s)
          </Badge>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {loading ? (
          <div className="d-flex align-items-center gap-2 py-4 text-body-secondary">
            <Spinner animation="border" size="sm" /> Carregando catálogo...
          </div>
        ) : rows.length === 0 ? (
          <div className="cut-info-box">
            <strong>Nenhum produto ativo no catálogo</strong>
            <span>Cadastre itens no estabelecimento para disponibilizá-los para pré-compra nos eventos.</span>
          </div>
        ) : (
          <>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button type="button" size="sm" variant="outline-light" onClick={selectAll}>Selecionar todos</Button>
              <Button type="button" size="sm" variant="outline-light" onClick={clearAll}>Limpar seleção</Button>
            </div>

            <div className="d-grid gap-3">
              {rows.map((item) => (
                <div key={item.item_id} className="cut-info-box">
                  <Row className="g-3 align-items-center">
                    <Col lg={5}>
                      <div className="d-flex gap-3 align-items-center">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" width="62" height="62" style={{ objectFit: "cover", borderRadius: 12 }} />
                        ) : (
                          <div className="d-grid" style={{ width: 62, height: 62, placeItems: "center" }}>
                            <i className="fa-solid fa-box" aria-hidden="true" />
                          </div>
                        )}
                        <div>
                          <Form.Check
                            type="switch"
                            id={`catalog-item-${item.item_id}`}
                            checked={item.selected}
                            onChange={(event) => updateRow(item.item_id, { selected: event.target.checked })}
                            label={<strong>{item.name}</strong>}
                          />
                          <small className="d-block text-body-secondary">
                            Catálogo: {money(item.catalog_price)}{item.catalog_stock === null ? " · estoque não limitado" : ` · ${item.catalog_stock} em estoque`}
                          </small>
                          {item.category && <small className="d-block text-body-secondary">{item.category}</small>}
                        </div>
                      </div>
                    </Col>
                    <Col sm={6} lg={3}>
                      <Form.Group>
                        <Form.Label>Preço nesta data</Form.Label>
                        <Form.Control
                          type="number"
                          min="0.01"
                          max="999999.99"
                          step="0.01"
                          value={item.price}
                          disabled={!item.selected}
                          onChange={(event) => updateRow(item.item_id, { price: event.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col sm={6} lg={4}>
                      <Form.Group>
                        <Form.Label>Quantidade para pré-venda</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          max="1000000"
                          step="1"
                          value={item.quantity}
                          disabled={!item.selected}
                          onChange={(event) => updateRow(item.item_id, { quantity: event.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              ))}
            </div>

            <Button type="button" className="mt-4" onClick={save} disabled={saving}>
              {saving ? "Salvando produtos..." : "Salvar produtos desta data"}
            </Button>
          </>
        )}

        {manualItems.length > 0 && (
          <div className="cut-info-box mt-4">
            <strong>{manualItems.length} item(ns) exclusivo(s) do evento preservado(s)</strong>
            <span>Itens criados diretamente neste evento não são removidos quando você altera a seleção do catálogo do estabelecimento.</span>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

EventCatalogPanel.propTypes = {
  eventId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
};
