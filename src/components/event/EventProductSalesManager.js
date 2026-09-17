import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Form, Spinner } from "react-bootstrap";
import QrCodeComponent from "../QrCodeComponent";
import cutinappService from "../../services/CutinappService";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";
import "./EventProductSalesManager.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const normalizeText = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const resolveImageUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  return /^https?:\/\//i.test(image) ? image : `${storageUrl}${image.replace(/^\/+/, "")}`;
};

const sourceIdFor = (item) => Number(
  item?.source_item_id
  ?? item?.sourceItemId
  ?? item?.source_item?.id
  ?? item?.source?.id
  ?? 0,
);

const quantityFor = (item) => {
  const raw = item?.stock ?? item?.quantity ?? item?.available_quantity;
  if (raw === null || raw === undefined || raw === "") return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1;
};

const itemKey = (item) => String(item?.id ?? "");

export default function EventProductSalesManager({ eventId, eventData, onSuccess, onError }) {
  const [productionItems, setProductionItems] = useState([]);
  const [eventItems, setEventItems] = useState([]);
  const [productionItemsState, setProductionItemsState] = useState("idle");
  const [productionItemsError, setProductionItemsError] = useState("");
  const [eventItemsLoading, setEventItemsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState({ done: 0, total: 0 });
  const [busyItemId, setBusyItemId] = useState(null);

  const productionId = Number(eventData?.production_id || eventData?.production?.id || 0);
  const eventSlug = String(eventData?.slug || "").trim();
  const isPublished = Boolean(eventData?.is_published && eventSlug);
  const catalogUrl = isPublished ? `${window.location.origin}/event/${eventSlug}/catalogo` : "";

  const loadProductionItems = async () => {
    if (!productionId) return;
    setProductionItemsState("loading");
    setProductionItemsError("");
    try {
      const rows = await cutinappService.productionItems(productionId);
      const items = (Array.isArray(rows) ? rows : []).filter((item) => item?.status === undefined || Boolean(item.status));
      setProductionItems(items);
      setDrafts((current) => {
        const next = { ...current };
        items.forEach((item) => {
          const key = itemKey(item);
          if (!next[key]) {
            next[key] = {
              price: Number(item?.price || 0).toFixed(2),
              quantity: String(quantityFor(item)),
            };
          }
        });
        return next;
      });
      setProductionItemsState("ready");
    } catch (error) {
      setProductionItems([]);
      const message = error?.response?.data?.message || error?.message || "Não conseguimos carregar os itens desta produção.";
      setProductionItemsError(message);
      setProductionItemsState("error");
    }
  };

  const loadEventItems = async () => {
    if (!isPublished) {
      setEventItems([]);
      return;
    }
    setEventItemsLoading(true);
    try {
      const catalog = await commerceService.catalog(eventSlug, { force: true });
      setEventItems(Array.isArray(catalog?.items) ? catalog.items : []);
    } catch (error) {
      const status = Number(error?.status || error?.response?.status || 0);
      if (status !== 404) onError?.(error?.response?.data?.message || error?.message || "Não foi possível carregar os adicionais do evento.");
    } finally {
      setEventItemsLoading(false);
    }
  };

  useEffect(() => {
    loadProductionItems();
  }, [productionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadEventItems();
  }, [eventId, eventSlug, isPublished]); // eslint-disable-line react-hooks/exhaustive-deps

  const addedSourceIds = useMemo(() => new Set(
    eventItems.map(sourceIdFor).filter((id) => id > 0).map(String),
  ), [eventItems]);

  const addedNames = useMemo(() => new Set(
    eventItems.map((item) => normalizeText(item?.name)).filter(Boolean),
  ), [eventItems]);

  const isAlreadyAdded = (item) => {
    const id = itemKey(item);
    if (addedSourceIds.has(id)) return true;
    return addedNames.has(normalizeText(item?.name));
  };

  const filteredItems = useMemo(() => {
    const term = normalizeText(searchTerm);
    if (!term) return productionItems;
    return productionItems.filter((item) => [item?.name, item?.description, item?.category?.name, item?.category]
      .some((value) => normalizeText(value).includes(term)));
  }, [productionItems, searchTerm]);

  const selectableItems = useMemo(
    () => productionItems.filter((item) => !isAlreadyAdded(item)),
    // eventItems changes the result through addedSourceIds/addedNames.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productionItems, addedSourceIds, addedNames],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => selectableItems.filter((item) => selectedSet.has(itemKey(item))),
    [selectableItems, selectedSet],
  );
  const allSelected = selectableItems.length > 0 && selectedItems.length === selectableItems.length;

  const toggleItem = (item) => {
    const key = itemKey(item);
    if (!key || isAlreadyAdded(item)) return;
    setSelectedIds((current) => current.includes(key)
      ? current.filter((value) => value !== key)
      : [...current, key]);
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(selectableItems.map(itemKey).filter(Boolean));
  };

  const updateDraft = (id, field, value) => {
    setDrafts((current) => ({
      ...current,
      [String(id)]: {
        ...(current[String(id)] || {}),
        [field]: value,
      },
    }));
  };

  const addSelected = async () => {
    if (!selectedItems.length) {
      onError?.("Selecione pelo menos um item da produção.");
      return;
    }

    const invalid = selectedItems.find((item) => {
      const draft = drafts[itemKey(item)] || {};
      const price = Number(draft.price);
      const quantity = Number(draft.quantity);
      return !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 0;
    });
    if (invalid) {
      onError?.(`Revise preço e estoque de ${invalid.name || "um dos itens selecionados"}.`);
      return;
    }

    setSaving(true);
    setSavingProgress({ done: 0, total: selectedItems.length });
    const created = [];
    const failed = [];

    for (let index = 0; index < selectedItems.length; index += 1) {
      const item = selectedItems[index];
      const draft = drafts[itemKey(item)] || {};
      try {
        const response = await commerceService.saveEventItem(eventId, {
          source_item_id: Number(item.id),
          name: item.name,
          description: item.description || null,
          price: Number(draft.price),
          quantity: Number(draft.quantity),
          is_active: true,
        });
        if (response?.item) created.push(response.item);
      } catch (error) {
        failed.push({ item, error });
      } finally {
        setSavingProgress({ done: index + 1, total: selectedItems.length });
      }
    }

    if (created.length) {
      setEventItems((current) => {
        const next = [...current];
        created.forEach((createdItem) => {
          const index = next.findIndex((row) => Number(row.id) === Number(createdItem.id));
          if (index >= 0) next[index] = createdItem;
          else next.push(createdItem);
        });
        return next;
      });
      setSelectedIds([]);
      if (isPublished) await loadEventItems();
    }

    setSaving(false);
    if (!failed.length) {
      onSuccess?.(`${created.length || selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} adicionado${selectedItems.length === 1 ? "" : "s"} ao catálogo e ao checkout do evento.`);
      return;
    }

    const firstMessage = failed[0]?.error?.response?.data?.message || failed[0]?.error?.message;
    onError?.(`${failed.length} item${failed.length === 1 ? "" : "s"} não puderam ser adicionados.${firstMessage ? ` ${firstMessage}` : ""}`);
  };

  const removeAddOn = async (item) => {
    setBusyItemId(item.id);
    try {
      await commerceService.deleteEventItem(eventId, item.id);
      setEventItems((current) => current.filter((row) => Number(row.id) !== Number(item.id)));
      onSuccess?.("Item removido das novas vendas e do catálogo do evento.");
    } catch (error) {
      onError?.(error?.response?.data?.message || error?.message || "Não foi possível remover o item.");
    } finally {
      setBusyItemId(null);
    }
  };

  const openCatalog = () => {
    if (!catalogUrl) return;
    window.open(catalogUrl, "_blank", "noopener,noreferrer");
  };

  const printQr = () => {
    if (!catalogUrl) return;
    window.print();
  };

  return <>
    <div className="cev2-product-manager-head">
      <div>
        <span className="cev2-eyebrow">Monetização</span>
        <h2>Adicionais e pré-venda</h2>
        <p>Escolha os itens visualmente, edite preço e estoque quando necessário e publique vários de uma vez.</p>
      </div>
      <div className="cev2-product-manager-stats" aria-label="Resumo dos itens">
        <span><strong>{productionItems.length}</strong> na produção</span>
        <span><strong>{eventItems.length}</strong> no evento</span>
      </div>
    </div>

    {productionItemsState === "loading" && <div className="cev2-product-loading"><Spinner size="sm" /> Carregando itens da produção…</div>}
    {productionItemsState === "error" && <div className="cev2-product-error"><span>{productionItemsError}</span><Button size="sm" variant="outline-light" onClick={loadProductionItems}>Tentar novamente</Button></div>}

    {productionItemsState === "ready" && productionItems.length === 0 && <div className="cev2-product-empty">
      <i className="fa-solid fa-bag-shopping" />
      <div><strong>Nenhum item cadastrado nesta produção.</strong><span>Cadastre os itens da produção para disponibilizá-los neste evento.</span></div>
    </div>}

    {productionItems.length > 0 && <div className="cev2-product-picker">
      <div className="cev2-product-toolbar">
        <div className="cev2-product-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <Form.Control type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar item…" aria-label="Buscar item da produção" />
        </div>
        <Button type="button" variant="outline-light" onClick={toggleAll} disabled={!selectableItems.length || saving}>
          <i className={`fa-${allSelected ? "solid" : "regular"} fa-square-check me-2`} />
          {allSelected ? "Desmarcar todos" : `Selecionar todos (${selectableItems.length})`}
        </Button>
      </div>

      <div className="cev2-product-grid" role="list" aria-label="Itens disponíveis para venda no evento">
        {filteredItems.map((item) => {
          const key = itemKey(item);
          const selected = selectedSet.has(key);
          const added = isAlreadyAdded(item);
          const draft = drafts[key] || { price: Number(item?.price || 0).toFixed(2), quantity: String(quantityFor(item)) };
          const image = resolveImageUrl(item?.image || item?.image_url || item?.photo || item?.cover);
          return <article className={`cev2-product-choice${selected ? " is-selected" : ""}${added ? " is-added" : ""}`} key={key} role="listitem">
            <button type="button" className="cev2-product-choice-main" onClick={() => toggleItem(item)} disabled={added || saving} aria-pressed={selected} aria-label={`${selected ? "Desmarcar" : "Selecionar"} ${item.name}`}>
              <span className="cev2-product-choice-check"><i className={added || selected ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} /></span>
              <span className="cev2-product-choice-media">{image ? <img src={image} alt="" /> : <i className="fa-solid fa-box-open" />}</span>
              <span className="cev2-product-choice-copy">
                <strong>{item.name}</strong>
                {item.description && <small>{item.description}</small>}
                <span>{added ? "Já disponível no evento" : `${money(item.price)} · estoque ${quantityFor(item)}`}</span>
              </span>
            </button>
            {selected && !added && <div className="cev2-product-choice-edit">
              <label>Preço no evento<Form.Control type="number" min="0" step="0.01" inputMode="decimal" value={draft.price} onChange={(event) => updateDraft(key, "price", event.target.value)} /></label>
              <label>Estoque<Form.Control type="number" min="0" step="1" inputMode="numeric" value={draft.quantity} onChange={(event) => updateDraft(key, "quantity", event.target.value)} /></label>
            </div>}
          </article>;
        })}
      </div>

      {filteredItems.length === 0 && <div className="cev2-product-empty"><i className="fa-solid fa-magnifying-glass" /><div><strong>Nenhum item encontrado.</strong><span>Limpe a busca para ver todos os itens da produção.</span></div></div>}

      <div className="cev2-product-bulkbar">
        <div><strong>{selectedItems.length}</strong><span> item{selectedItems.length === 1 ? "" : "s"} selecionado{selectedItems.length === 1 ? "" : "s"}</span></div>
        {saving && <span className="cev2-product-progress">Adicionando {savingProgress.done} de {savingProgress.total}…</span>}
        <Button type="button" onClick={addSelected} disabled={!selectedItems.length || saving}>
          <i className="fa-solid fa-cart-plus me-2" />
          {saving ? "Adicionando…" : `Adicionar selecionados (${selectedItems.length})`}
        </Button>
      </div>
    </div>}

    <div className="cev2-event-items-block">
      <div className="cev2-event-items-title"><div><span className="cev2-eyebrow">No evento</span><h3>Itens disponíveis para compra</h3></div></div>
      {eventItemsLoading ? <div className="cev2-product-loading"><Spinner size="sm" /> Atualizando catálogo…</div> : <div className="cev2-event-items-list">
        {eventItems.map((item) => <div className="cev2-event-item" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.description || "Item adicional do evento"}</small></div>
          <span>{money(item.price)}</span>
          <Button size="sm" variant="outline-danger" disabled={busyItemId === item.id} onClick={() => removeAddOn(item)}>{busyItemId === item.id ? "Removendo…" : "Remover"}</Button>
        </div>)}
        {!eventItems.length && <div className="cev2-product-empty"><i className="fa-solid fa-cart-shopping" /><div><strong>Ainda não há itens neste evento.</strong><span>Selecione um ou mais itens acima para começar a vender.</span></div></div>}
      </div>}
    </div>

    <div className="cev2-catalog-qr-print">
      <div className="cev2-catalog-qr-copy">
        <span className="cev2-eyebrow">Catálogo por QR Code</span>
        <h3>Venda direto nas mesas</h3>
        <p>Imprima este QR Code e coloque nas mesas. O participante abre um catálogo exclusivo dos itens deste evento, sem exibir ingressos.</p>
        {!isPublished && <div className="cev2-product-note"><i className="fa-solid fa-circle-info" /> Publique o evento para ativar o catálogo e gerar o QR Code.</div>}
        {isPublished && !eventItems.length && <div className="cev2-product-note"><i className="fa-solid fa-circle-info" /> Adicione pelo menos um item ao evento para começar a divulgar o catálogo.</div>}
        {catalogUrl && eventItems.length > 0 && <div className="cev2-catalog-url">{catalogUrl}</div>}
        <div className="cev2-catalog-actions no-print">
          <Button type="button" onClick={openCatalog} disabled={!catalogUrl || !eventItems.length}><i className="fa-solid fa-arrow-up-right-from-square me-2" />Abrir catálogo</Button>
          <Button type="button" variant="outline-light" onClick={printQr} disabled={!catalogUrl || !eventItems.length}><i className="fa-solid fa-print me-2" />Imprimir QR Code</Button>
        </div>
      </div>
      <div className="cev2-catalog-qr-code">
        {catalogUrl && eventItems.length > 0 ? <QrCodeComponent value={catalogUrl} size={220} subject="catálogo do evento" alt={`QR Code do catálogo de ${eventData?.title || "evento"}`} /> : <div className="cev2-catalog-qr-placeholder"><i className="fa-solid fa-qrcode" /></div>}
        <strong>{eventData?.title || "Catálogo do evento"}</strong>
        <small>Escaneie para ver os itens disponíveis</small>
      </div>
    </div>
  </>;
}

EventProductSalesManager.propTypes = {
  eventId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  eventData: PropTypes.shape({
    title: PropTypes.string,
    slug: PropTypes.string,
    is_published: PropTypes.bool,
    production_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    production: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]) }),
  }),
  onSuccess: PropTypes.func,
  onError: PropTypes.func,
};

EventProductSalesManager.defaultProps = {
  eventData: null,
  onSuccess: null,
  onError: null,
};
