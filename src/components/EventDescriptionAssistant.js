import React, { useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import creativeService from "../services/CreativeService";

const normalizeDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
};

export default function EventDescriptionAssistant({ event, productionName, onUse, buttonLabel = "Gerar descrição com IA" }) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [tone, setTone] = useState("engaging");

  const generate = async () => {
    const title = String(event?.title || "").trim();
    if (title.length < 2) {
      setError("Informe o nome do evento antes de gerar a descrição.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await creativeService.generateEventDescription({
        title,
        currentDescription: String(event?.description || "").trim(),
        category: event?.category?.name || event?.category || "",
        productionName: productionName || event?.production_name || event?.production?.name || "",
        venue: event?.venue || "",
        city: event?.city || "",
        uf: event?.uf || "",
        startDate: normalizeDate(event?.start_date),
        endDate: normalizeDate(event?.end_date),
        audience: event?.audience || "",
        tone,
      });

      const text = String(response?.text || "").trim();
      if (!text) throw new Error("A IA não retornou uma descrição utilizável.");
      setGeneratedText(text);

      try {
        window.PeterTecnetTelemetry?.track?.("producer_event_description_ai_generated", {
          label: title,
          target: String(event?.id || "event_draft"),
          metadata: { purpose: "event_description", tone },
        });
      } catch (_) {
        // Telemetry must never interrupt event editing.
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível gerar a descrição agora.");
    } finally {
      setLoading(false);
    }
  };

  const open = () => {
    setError("");
    setGeneratedText("");
    setShow(true);
  };

  const useDescription = () => {
    const text = generatedText.trim();
    if (!text) return;
    onUse?.(text);
    setShow(false);
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline-info" onClick={open}>
        <i className="fa-solid fa-wand-magic-sparkles me-2" />{buttonLabel}
      </Button>

      <Modal show={show} onHide={() => !loading && setShow(false)} centered size="lg">
        <Modal.Header closeButton={!loading}>
          <Modal.Title>Descrição do evento com IA</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary">
            A IA usa somente os dados já preenchidos do evento. Ela é orientada a não inventar atrações, preços, horários ou benefícios que não tenham sido informados.
          </p>

          {String(event?.description || "").trim() && (
            <Alert variant="info">
              Sua descrição atual não será substituída automaticamente. A alteração só acontece quando você clicar em <strong>Usar esta descrição</strong>.
            </Alert>
          )}

          <Form.Group className="mb-3">
            <Form.Label>Tom da descrição</Form.Label>
            <Form.Select value={tone} onChange={(e) => setTone(e.target.value)} disabled={loading}>
              <option value="engaging">Envolvente</option>
              <option value="premium">Premium</option>
              <option value="casual">Casual</option>
              <option value="family">Familiar</option>
              <option value="corporate">Corporativo</option>
            </Form.Select>
          </Form.Group>

          {error && <Alert variant="danger">{error}</Alert>}

          {generatedText ? (
            <Form.Group>
              <Form.Label>Texto gerado</Form.Label>
              <Form.Control
                as="textarea"
                rows={9}
                value={generatedText}
                onChange={(e) => setGeneratedText(e.target.value)}
                disabled={loading}
              />
              <Form.Text>Você pode ajustar o texto antes de aplicá-lo ao evento.</Form.Text>
            </Form.Group>
          ) : (
            <div className="cut-info-box">
              <strong>{event?.title || "Informe o nome do evento"}</strong>
              <span>Quanto mais dados de local, data e contexto estiverem preenchidos, melhor será a descrição.</span>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex flex-wrap gap-2">
          <Button type="button" variant="outline-light" onClick={() => setShow(false)} disabled={loading}>Cancelar</Button>
          <Button type="button" variant="outline-info" onClick={generate} disabled={loading || String(event?.title || "").trim().length < 2}>
            {loading ? <><Spinner size="sm" className="me-2" />Gerando...</> : generatedText ? "Gerar outra" : "Gerar descrição"}
          </Button>
          {generatedText && <Button type="button" onClick={useDescription} disabled={loading}>Usar esta descrição</Button>}
        </Modal.Footer>
      </Modal>
    </>
  );
}
