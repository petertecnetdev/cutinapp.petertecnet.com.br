import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Col, Form, Row } from "react-bootstrap";
import commerceService from "../../services/CommerceService";

const normalizeName = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR");

const matchesProductionItem = (eventItem, productionItem) => {
  const sourceItemId = Number(eventItem?.source_item_id || 0);
  if (sourceItemId > 0) return sourceItemId === Number(productionItem?.id || 0);
  return normalizeName(eventItem?.name) === normalizeName(productionItem?.name);
};

const itemStock = (item) => {
  const stock = Number(item?.stock);
  return Number.isInteger(stock) && stock >= 0 ? stock : 0;
};

const itemPrice = (item) => {
  const price = Number(item?.price);
  return Number.isFinite(price) ? price : 0;
};

const modeCopy = {
  all: {
    title: "Todos os itens",
    description: "Disponibiliza no evento todos os itens ativos do catálogo desta produção.",
  },
  some: {
    title: "Selecionar alguns",
    description: "Somente os itens marcados abaixo ficarão disponíveis neste evento.",
  },
  except: {
    title: "Todos, exceto alguns",
    description: "Todos os itens ficam disponíveis, menos os que você marcar como exceção.",
  },
};

export default function EventItemBulkSelector({
  eventId,
  productionItems = [],
  eventItems = [],
  onItemsChange,
}) {
  const [mode, setMode] = useState("some");
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const initializedEventRef = useRef("");

  const linkedProductionIds = useMemo(
    () => productionItems
      .filter((productionItem) => eventItems.some((eventItem) => matchesProductionItem(eventItem, productionItem)))
      .map((item) => Number(item.id)),
    [productionItems, eventItems]
  );

  useEffect(() => {
    const eventKey = String(eventId || "");
    if (!eventKey || productionItems.length === 0 || initializedEventRef.current === eventKey) return;

    if (eventItems.length === 0) {
      setMode("some");
      setSelectedIds([]);
      return;
    }

    if (linkedProductionIds.length === productionItems.length) {
      setMode("all");
      setSelectedIds([]);
    } else {
      setMode("some");
      setSelectedIds(linkedProductionIds);
    }
    initializedEventRef.current = eventKey;
  }, [eventId, productionItems, eventItems.length, linkedProductionIds]);

  const selectedSet = useMemo(() => new Set(selectedIds.map(Number)), [selectedIds]);

  const targetItems = useMemo(() => {
    if (mode === "all") return productionItems;
    if (mode === "some") return productionItems.filter((item) => selectedSet.has(Number(item.id)));
    return productionItems.filter((item) => !selectedSet.has(Number(item.id)));
  }, [mode, productionItems, selectedSet]);

  const visibleItems = useMemo(() => {
    const query = normalizeName(search);
    if (!query) return productionItems;
    return productionItems.filter((item) => [item?.name, item?.description, item?.category]
      .some((value) => normalizeName(value).includes(query)));
  }, [productionItems, search]);

  const selectMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setSuccess("");

    if (nextMode === "all") {
      setSelectedIds([]);
      return;
    }

    if (nextMode === "some") {
      setSelectedIds(linkedProductionIds);
      return;
    }

    const linkedSet = new Set(linkedProductionIds);
    setSelectedIds(productionItems.map((item) => Number(item.id)).filter((itemId) => !linkedSet.has(itemId)));
  };

  const toggleItem = (itemId) => {
    const numericId = Number(itemId);
    setSelectedIds((current) => current.includes(numericId)
      ? current.filter((id) => id !== numericId)
      : [...current, numericId]);
  };

  const setVisibleSelection = (checked) => {
    const visibleIds = visibleItems.map((item) => Number(item.id));
    const visibleSet = new Set(visibleIds);
    setSelectedIds((current) => {
      if (!checked) return current.filter((id) => !visibleSet.has(Number(id)));
      return [...new Set([...current.map(Number), ...visibleIds])];
    });
  };

  const applySelection = async () => {
    const numericEventId = Number(eventId);
    if (!numericEventId || saving) return;

    if (mode === "some" && targetItems.length === 0) {
      setError("Selecione pelo menos um item ou use outro modo de seleção.");
      return;
    }

    const invalidItems = targetItems.filter((item) => itemPrice(item) < 0.01);
    if (invalidItems.length > 0) {
      const names = invalidItems.slice(0, 3).map((item) => item.name).join(", ");
      const suffix = invalidItems.length > 3 ? ` e mais ${invalidItems.length - 3}` : "";
      setError(`Há item(ns) sem preço válido para pré-venda: ${names}${suffix}. Ajuste o preço no catálogo antes de aplicar.`);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const targetIds = new Set(targetItems.map((item) => Number(item.id)));
    let nextEventItems = [...eventItems];
    const failures = [];
    let added = 0;
    let removed = 0;

    try {
      const toRemove = eventItems.filter((eventItem) => {
        const source = productionItems.find((productionItem) => matchesProductionItem(eventItem, productionItem));
        return !source || !targetIds.has(Number(source.id));
      });

      for (const eventItem of toRemove) {
        try {
          await commerceService.deleteEventItem(numericEventId, eventItem.id);
          nextEventItems = nextEventItems.filter((item) => Number(item.id) !== Number(eventItem.id));
          removed += 1;
        } catch (err) {
          failures.push(err?.message || `Não foi possível remover ${eventItem?.name || "um item"}.`);
        }
      }

      const toAdd = targetItems.filter(
        (productionItem) => !nextEventItems.some((eventItem) => matchesProductionItem(eventItem, productionItem))
      );

      for (const productionItem of toAdd) {
        try {
          const response = await commerceService.saveEventItem(numericEventId, {
            source_item_id: Number(productionItem.id),
            name: productionItem.name,
            description: productionItem.description || null,
            price: itemPrice(productionItem),
            quantity: itemStock(productionItem),
            is_active: true,
          });
          if (response?.item) nextEventItems.push(response.item);
          added += 1;
        } catch (err) {
          failures.push(err?.message || `Não foi possível adicionar ${productionItem?.name || "um item"}.`);
        }
      }

      onItemsChange?.(nextEventItems);

      if (failures.length > 0) {
        setError(`A seleção foi aplicada parcialmente. ${failures[0]}${failures.length > 1 ? ` (${failures.length} falhas no total)` : ""}`);
        return;
      }

      const actionSummary = added || removed
        ? `${added} adicionado(s) e ${removed} removido(s).`
        : "A seleção já estava atualizada.";
      setSuccess(`${modeCopy[mode].title}: ${targetItems.length} item(ns) disponível(is). ${actionSummary}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cut-info-box mb-4">
      <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 mb-3">
        <div>
          <strong>Seleção em lote</strong>
          <span>Defina de uma vez quais itens do catálogo poderão ser vendidos neste evento.</span>
        </div>
        <Badge bg="info" className="align-self-start">{targetItems.length} de {productionItems.length} selecionado(s)</Badge>
      </div>

      <Row className="g-2 mb-3">
        {Object.entries(modeCopy).map(([key, copy]) => (
          <Col md={4} key={key}>
            <Button
              type="button"
              variant={mode === key ? "primary" : "outline-light"}
              className="w-100 h-100 text-start"
              onClick={() => selectMode(key)}
              disabled={saving}
            >
              <strong className="d-block">{copy.title}</strong>
              <small className="d-block mt-1 opacity-75">{copy.description}</small>
            </Button>
          </Col>
        ))}
      </Row>

      {mode !== "all" && (
        <div className="border rounded-3 p-3 mb-3">
          <div className="d-flex flex-column flex-md-row gap-2 justify-content-between mb-3">
            <Form.Control
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar item do catálogo"
              style={{ maxWidth: 420 }}
              disabled={saving}
            />
            <div className="d-flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant="outline-info" onClick={() => setVisibleSelection(true)} disabled={saving || visibleItems.length === 0}>
                Marcar visíveis
              </Button>
              <Button type="button" size="sm" variant="outline-light" onClick={() => setVisibleSelection(false)} disabled={saving || visibleItems.length === 0}>
                Desmarcar visíveis
              </Button>
            </div>
          </div>

          <div className="d-grid gap-2" style={{ maxHeight: 320, overflowY: "auto" }}>
            {visibleItems.length === 0 ? (
              <span className="text-secondary">Nenhum item encontrado.</span>
            ) : visibleItems.map((item) => {
              const itemId = Number(item.id);
              const checked = selectedSet.has(itemId);
              const alreadyLinked = linkedProductionIds.includes(itemId);
              return (
                <label key={item.id} className="d-flex align-items-start gap-3 border rounded-3 p-3">
                  <Form.Check
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(itemId)}
                    disabled={saving}
                    aria-label={`${mode === "except" ? "Excluir" : "Selecionar"} ${item.name}`}
                  />
                  <span className="flex-grow-1">
                    <strong className="d-flex flex-wrap gap-2 align-items-center">
                      {item.name}
                      {alreadyLinked && <Badge bg="success">já no evento</Badge>}
                    </strong>
                    <small className="d-block text-secondary mt-1">
                      {itemPrice(item).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · estoque {itemStock(item)}
                    </small>
                    {mode === "except" && checked && <small className="d-block text-warning mt-1">Este item ficará fora do evento.</small>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
      {success && <Alert variant="success" className="mb-3">{success}</Alert>}

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
        <small className="text-secondary">
          Itens novos usam o preço e o estoque atuais do catálogo. Itens que já estão no evento mantêm os valores configurados para este evento.
        </small>
        <Button type="button" onClick={applySelection} disabled={saving || productionItems.length === 0}>
          {saving ? "Aplicando seleção..." : `Aplicar ${targetItems.length} item(ns) ao evento`}
        </Button>
      </div>
    </div>
  );
}
