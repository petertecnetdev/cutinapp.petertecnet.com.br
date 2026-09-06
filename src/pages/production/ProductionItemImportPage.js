import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Container, Form, ProgressBar } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { recognizeMenuImages } from "../../utils/localMenuOcr";
import { parseMenuDocuments } from "../../utils/menuOcrParser";
import "./production-item-import.css";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number)
    : "Preço não informado";
};

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const ocrStatusLabel = (progress) => {
  if (!progress) return "Preparando leitor local";
  if (progress.stage === "done") return "Leitura concluída";
  if (progress.stage === "recognizing") return "Reconhecendo nomes e preços";
  const status = String(progress.status || "").toLowerCase();
  if (status.includes("language")) return "Carregando idioma português";
  if (status.includes("core")) return "Carregando motor de leitura";
  return "Preparando leitor local";
};

const overallProgress = (progress) => {
  if (!progress) return 0;
  if (progress.stage === "done") return 100;
  if (progress.stage === "loading") return Math.max(2, Math.round(Number(progress.progress || 0) * 12));
  const total = Math.max(1, Number(progress.totalImages || 1));
  const index = Math.max(0, Number(progress.imageIndex || 0));
  const current = Math.min(1, Math.max(0, Number(progress.progress || 0)));
  return Math.min(99, Math.round(((index + current) / total) * 100));
};

export default function ProductionItemImportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [production, setProduction] = useState(null);
  const [existingItems, setExistingItems] = useState([]);
  const [images, setImages] = useState([]);
  const [items, setItems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [rawText, setRawText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      cutinappService.productionWorkspace(id),
      cutinappService.productionItems(id),
    ]).then(([workspaceResult, itemsResult]) => {
      if (!active) return;

      if (workspaceResult.status === "fulfilled") {
        setProduction(workspaceResult.value?.organization || null);
      } else {
        setError(errorMessage(workspaceResult.reason, "Não foi possível abrir a produção."));
      }

      if (itemsResult.status === "fulfilled") {
        setExistingItems(Array.isArray(itemsResult.value) ? itemsResult.value : []);
      } else {
        setWarnings(["Não foi possível comparar o cardápio com os itens já cadastrados. A revisão continua disponível."]);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [id]);

  const activeItems = useMemo(() => items.filter((item) => item.action !== "skip"), [items]);
  const invalidItems = useMemo(() => activeItems.filter((item) => {
    const price = item.price;
    return !String(item.name || "").trim()
      || price === ""
      || price === null
      || price === undefined
      || !Number.isFinite(Number(price))
      || Number(price) < 0;
  }), [activeItems]);

  const updateItem = (index, patch) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const resetImport = () => {
    setImages([]);
    setItems([]);
    setWarnings([]);
    setRawText("");
    setOcrProgress(null);
    setError("");
  };

  const selectImages = (event) => {
    const chosen = Array.from(event.target.files || []);
    const unsupported = chosen.find((image) => image.type && !ACCEPTED_IMAGE_TYPES.has(image.type));
    const oversized = chosen.find((image) => image.size > MAX_IMAGE_BYTES);

    if (unsupported) {
      resetImport();
      setError(`O arquivo ${unsupported.name} não é uma imagem JPG, PNG ou WebP compatível.`);
      event.target.value = "";
      return;
    }

    if (oversized) {
      resetImport();
      setError(`A imagem ${oversized.name} ultrapassa o limite de 5 MB.`);
      event.target.value = "";
      return;
    }

    const selected = chosen.slice(0, MAX_IMAGES);
    setImages(selected);
    setItems([]);
    setWarnings([]);
    setRawText("");
    setOcrProgress(null);
    setError(chosen.length > MAX_IMAGES ? `Foram selecionadas somente as primeiras ${MAX_IMAGES} imagens.` : "");
  };

  const analyze = async () => {
    if (!images.length) {
      setError("Escolha pelo menos uma foto do cardápio.");
      return;
    }

    setAnalyzing(true);
    setError("");
    setWarnings([]);
    setItems([]);
    setRawText("");
    setOcrProgress({ stage: "loading", progress: 0, imageIndex: 0, totalImages: images.length });

    try {
      const documents = await recognizeMenuImages(images, setOcrProgress);
      const parsed = parseMenuDocuments(documents, existingItems);
      const detected = Array.isArray(parsed.items) ? parsed.items : [];

      setWarnings(Array.isArray(parsed.warnings) ? parsed.warnings : []);
      setRawText(parsed.raw_text || "");
      setItems(detected.map((item) => ({
        ...item,
        price: item.price ?? "",
        action: item.recommended_action || (item.duplicate ? "skip" : "create"),
        existing_item_id: item.duplicate?.id || null,
      })));

      if (!detected.length) {
        setError("Conseguimos ler a imagem, mas não identificamos itens com nome e preço. Tente uma foto mais reta e nítida ou confira o texto reconhecido abaixo.");
      }
    } catch (err) {
      setError(errorMessage(err, "Não foi possível ler as imagens neste dispositivo."));
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!items.length || !activeItems.length) {
      setError("Selecione pelo menos um item para cadastrar ou atualizar.");
      return;
    }
    if (invalidItems.length) {
      setError("Revise os itens destacados: todo item selecionado precisa de nome e preço válido.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        items: items.map((item) => ({
          action: item.action,
          existing_item_id: item.action === "update" ? (item.existing_item_id || item.duplicate?.id) : null,
          name: String(item.name || "").trim() || null,
          type: item.type || "product",
          sku: item.sku || null,
          description: item.description || null,
          price: item.price === "" || item.price === null ? null : Number(item.price),
          category: item.category || null,
          subcategory: item.subcategory || null,
          brand: item.brand || null,
        })),
      };

      const response = await cutinappService.commitItemImport(id, payload);
      navigate(`/production/${id}`, {
        replace: true,
        state: { itemsImported: response?.data || {} },
      });
    } catch (err) {
      setError(errorMessage(err, "Não foi possível cadastrar os itens revisados."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Preparando importação" /></div>;
  }

  const progressValue = overallProgress(ocrProgress);

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-ai-import-head">
        <div>
          <span className="cut-eyebrow">Importação automática</span>
          <h1>Importar cardápio por foto</h1>
          <p>Envie fotos do cardápio de {production?.name || "seu estabelecimento"}. A leitura acontece no seu próprio celular ou computador, sem API paga, e você revisa tudo antes do cadastro.</p>
          <div className="cut-ai-import-local-badge"><i className="fa-solid fa-shield-halved" />Processamento local no seu dispositivo</div>
        </div>
        <Button variant="outline-light" onClick={() => navigate(`/production/${id}`)}>
          <i className="fa-solid fa-arrow-left me-2" />Voltar
        </Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}

      <Card className="cut-panel cut-ai-import-upload">
        <Card.Body className="p-4 p-lg-5">
          <div className="cut-ai-import-upload__icon"><i className="fa-solid fa-camera-retro" /></div>
          <div>
            <h2>Fotografe ou escolha o cardápio</h2>
            <p>Até {MAX_IMAGES} imagens JPG, PNG ou WebP, com no máximo 5 MB cada. Fotos nítidas, retas e com preços visíveis aumentam a precisão.</p>
            <small className="cut-ai-import-privacy"><i className="fa-solid fa-lock" /> As fotos são lidas no navegador. A API recebe somente os itens que você decidir confirmar.</small>
          </div>
          <Form.Control
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            capture="environment"
            onChange={selectImages}
            disabled={analyzing || saving}
            aria-label="Selecionar imagens do cardápio"
          />
          {images.length > 0 && <div className="cut-ai-import-files">
            {images.map((image) => <span key={`${image.name}-${image.lastModified}`}><i className="fa-regular fa-image" />{image.name}</span>)}
          </div>}

          {analyzing && <div className="cut-ai-import-progress" role="status" aria-live="polite">
            <div className="cut-ai-import-progress__label">
              <strong>{ocrStatusLabel(ocrProgress)}</strong>
              <span>{progressValue}%</span>
            </div>
            <ProgressBar now={progressValue} animated striped />
            {ocrProgress?.stage === "recognizing" && <small>
              Imagem {Math.min(images.length, Number(ocrProgress.imageIndex || 0) + 1)} de {images.length}
            </small>}
          </div>}

          <div className="cut-ai-import-upload__actions">
            <Button onClick={analyze} disabled={!images.length || analyzing || saving}>
              {analyzing ? <><span className="spinner-border spinner-border-sm me-2" />Lendo no dispositivo...</> : <><i className="fa-solid fa-text-width me-2" />Ler cardápio</>}
            </Button>
            {(items.length > 0 || rawText) && <Button variant="outline-light" onClick={resetImport} disabled={analyzing || saving}>Começar novamente</Button>}
          </div>
        </Card.Body>
      </Card>

      {warnings.length > 0 && <Alert variant="warning" className="mt-4">
        <strong>Confira estes pontos antes de salvar:</strong>
        <ul className="mb-0 mt-2">{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
      </Alert>}

      {rawText && <details className="cut-panel cut-ai-import-raw mt-4">
        <summary>Ver texto reconhecido das imagens</summary>
        <p>Esse texto foi extraído localmente e pode ajudar a conferir itens que não foram estruturados automaticamente.</p>
        <pre>{rawText}</pre>
      </details>}

      {items.length > 0 && <section className="cut-ai-import-review">
        <div className="cut-ai-import-review__head">
          <div>
            <span className="cut-eyebrow">Revisão obrigatória</span>
            <h2>{items.length} item(ns) identificado(s)</h2>
            <p>Corrija nomes, preços e categorias. Nada é cadastrado até você confirmar.</p>
          </div>
          <div className="cut-ai-import-summary">
            <Badge bg="success">{activeItems.length} selecionado(s)</Badge>
            <Badge bg="secondary">{items.length - activeItems.length} ignorado(s)</Badge>
          </div>
        </div>

        <div className="cut-ai-import-grid">
          {items.map((item, index) => {
            const invalid = item.action !== "skip" && invalidItems.includes(item);
            return <Card className={`cut-panel cut-ai-import-item ${invalid ? "cut-ai-import-item--invalid" : ""}`} key={`${item.name}-${index}`}>
              <Card.Body className="p-4">
                <div className="cut-ai-import-item__top">
                  <div>
                    <Badge bg={item.confidence >= 0.85 ? "success" : item.confidence >= 0.6 ? "warning" : "secondary"}>
                      {Math.round(Number(item.confidence || 0) * 100)}% confiança
                    </Badge>
                    {item.duplicate && <Badge bg="warning" text="dark">Possível duplicado</Badge>}
                  </div>
                  <Form.Select value={item.action} onChange={(event) => updateItem(index, { action: event.target.value })} aria-label={`Ação para ${item.name}`}>
                    <option value="create">Cadastrar novo</option>
                    {item.duplicate && <option value="update">Atualizar existente</option>}
                    <option value="skip">Ignorar</option>
                  </Form.Select>
                </div>

                {item.duplicate && <div className="cut-ai-import-duplicate">
                  <i className="fa-solid fa-triangle-exclamation" />
                  <span>Já existe <strong>{item.duplicate.name}</strong>{item.duplicate.price !== null ? ` por ${money(item.duplicate.price)}` : ""}.</span>
                </div>}

                <div className="cut-ai-import-fields">
                  <Form.Group className="cut-ai-import-field--wide">
                    <Form.Label>Nome</Form.Label>
                    <Form.Control value={item.name || ""} disabled={item.action === "skip"} onChange={(event) => updateItem(index, { name: event.target.value })} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Preço</Form.Label>
                    <Form.Control type="number" min="0" step="0.01" value={item.price} disabled={item.action === "skip"} onChange={(event) => updateItem(index, { price: event.target.value })} placeholder="0,00" />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Categoria</Form.Label>
                    <Form.Control value={item.category || ""} disabled={item.action === "skip"} onChange={(event) => updateItem(index, { category: event.target.value })} placeholder="Ex.: Bebidas" />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Subcategoria</Form.Label>
                    <Form.Control value={item.subcategory || ""} disabled={item.action === "skip"} onChange={(event) => updateItem(index, { subcategory: event.target.value })} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Tipo</Form.Label>
                    <Form.Select value={item.type || "product"} disabled={item.action === "skip"} onChange={(event) => updateItem(index, { type: event.target.value })}>
                      <option value="product">Produto</option>
                      <option value="service">Serviço</option>
                    </Form.Select>
                  </Form.Group>
                  <Form.Group className="cut-ai-import-field--wide">
                    <Form.Label>Descrição</Form.Label>
                    <Form.Control as="textarea" rows={2} value={item.description || ""} disabled={item.action === "skip"} onChange={(event) => updateItem(index, { description: event.target.value })} />
                  </Form.Group>
                </div>

                {item.source_text && <small className="cut-ai-import-source"><i className="fa-solid fa-quote-left" /> Lido da imagem: {item.source_text}</small>}
              </Card.Body>
            </Card>;
          })}
        </div>

        <div className="cut-ai-import-savebar">
          <div>
            <strong>{activeItems.length} item(ns) serão processados</strong>
            <span>{invalidItems.length ? `${invalidItems.length} ainda precisa(m) de revisão.` : "Tudo pronto para cadastrar."}</span>
          </div>
          <Button size="lg" disabled={saving || !activeItems.length || invalidItems.length > 0} onClick={save}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Cadastrando...</> : <><i className="fa-solid fa-check me-2" />Confirmar cadastro</>}
          </Button>
        </div>
      </section>}
    </Container>
  </div>;
}
