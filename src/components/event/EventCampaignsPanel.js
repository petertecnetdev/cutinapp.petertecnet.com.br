import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, ProgressBar } from "react-bootstrap";
import campaignService from "../../services/CampaignService";
import { safeSetSessionJson } from "../../utils/safeStorage";

const sessionToken = () => {
  const key = "cutinapp_campaign_session";
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, created);
    return created;
  } catch (_) {
    return `session-${Date.now()}`;
  }
};

const typeLabel = {
  poll: "Enquete",
  objective_reward: "Benefício",
  referral: "Indicação",
  coupon: "Promoção",
  contest: "Concurso",
  draw: "Sorteio",
  giveaway: "Premiação",
  boost: "Destaque",
  sponsored: "Patrocinado",
};

export default function EventCampaignsPanel({ eventId, eventSlug, user, onLoginRequired }) {
  const [campaigns, setCampaigns] = useState([]);
  const [choices, setChoices] = useState({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rewards, setRewards] = useState({});

  const load = async () => {
    if (!eventId) return;
    try {
      const rows = await campaignService.list({ event_id: Number(eventId), status: "published", per_page: 20 });
      setCampaigns(Array.isArray(rows) ? rows : []);
    } catch (_) {
      setCampaigns([]);
    }
  };

  useEffect(() => { load(); }, [eventId]);

  useEffect(() => {
    if (!campaigns.length) return;
    const token = sessionToken();
    campaigns.forEach((campaign) => {
      const seenKey = `cutinapp_campaign_seen_${campaign.uuid}`;
      let alreadySeen = false;
      try { alreadySeen = window.sessionStorage.getItem(seenKey) === "1"; } catch (_) { alreadySeen = false; }
      if (alreadySeen) return;
      campaignService.touch(campaign.uuid, "view", {
        idempotencyKey: `view:${campaign.uuid}:${token}`,
        metadata: { event_id: Number(eventId), surface: "event" },
      }).then(() => {
        try { window.sessionStorage.setItem(seenKey, "1"); } catch (_) { /* noop */ }
      }).catch(() => {});
    });
  }, [campaigns, eventId]);

  const visible = useMemo(() => campaigns.filter((campaign) => campaign.status === "published"), [campaigns]);

  const rememberAttribution = (campaign, reward = null) => {
    safeSetSessionJson(`cutinapp_campaign_context_${eventId}`, {
      uuid: campaign.uuid,
      eventId: Number(eventId),
      rewardCode: reward?.code || null,
      rewardKind: reward?.kind || null,
      capturedAt: Date.now(),
    });
  };

  const goToCommerce = (campaign) => {
    rememberAttribution(campaign, rewards[campaign.uuid] || null);
    campaignService.touch(campaign.uuid, "click", { metadata: { event_id: Number(eventId), target: "commerce" } }).catch(() => {});
    document.getElementById("compra-evento")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const participate = async (campaign) => {
    if (!user) {
      rememberAttribution(campaign);
      onLoginRequired?.(`/event/${eventSlug}`);
      return;
    }
    const optionId = choices[campaign.uuid];
    if (campaign.type === "poll" && !optionId) {
      setError("Escolha uma opção antes de votar.");
      return;
    }
    setBusy(campaign.uuid); setError(""); setMessage("");
    try {
      const response = await campaignService.participate(campaign.uuid, {
        option_id: optionId || null,
        source: "event",
        idempotency_key: `participation:${campaign.uuid}:${user.id}`,
        metadata: { event_id: Number(eventId) },
      });
      const reward = response?.reward || null;
      if (reward) setRewards((current) => ({ ...current, [campaign.uuid]: reward }));
      rememberAttribution(campaign, reward);
      setMessage(response?.duplicate ? "Sua participação já estava registrada." : "Participação registrada com sucesso.");
      await load();
    } catch (err) {
      setError(err?.message || "Não foi possível registrar sua participação.");
    } finally { setBusy(""); }
  };

  if (!visible.length) return null;

  return <section className="cut-campaigns-panel mb-4" aria-label="Promoções e campanhas do evento">
    <div className="d-flex align-items-end justify-content-between gap-3 mb-3">
      <div><span className="cut-eyebrow">Interaja e aproveite</span><h3 className="cut-section-title mt-1 mb-0">Campanhas do evento</h3></div>
      <Badge bg="info" text="dark">Ao vivo</Badge>
    </div>
    {error && <Alert variant="danger" className="py-2">{error}</Alert>}
    {message && <Alert variant="success" className="py-2">{message}</Alert>}
    <div className="d-grid gap-3">
      {visible.map((campaign) => {
        const totalVotes = (campaign.options || []).reduce((sum, option) => sum + Number(option.votes_count || 0), 0);
        const reward = rewards[campaign.uuid];
        return <div key={campaign.uuid} className="cut-panel p-3 p-lg-4 border border-secondary-subtle">
          <div className="d-flex flex-wrap gap-2 mb-2"><Badge bg="dark">{typeLabel[campaign.type] || "Campanha"}</Badge>{campaign.sponsor_metadata?.name && <Badge bg="warning" text="dark">Patrocínio · {campaign.sponsor_metadata.name}</Badge>}</div>
          <h4 className="h5 mb-2">{campaign.title}</h4>
          {campaign.description && <p className="text-secondary mb-3">{campaign.description}</p>}

          {campaign.type === "poll" && <div className="d-grid gap-2 mb-3">{(campaign.options || []).map((option) => {
            const pct = totalVotes > 0 ? Math.round((Number(option.votes_count || 0) / totalVotes) * 100) : 0;
            const selected = Number(choices[campaign.uuid]) === Number(option.id);
            return <button key={option.id} type="button" className={`btn text-start ${selected ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setChoices((current) => ({ ...current, [campaign.uuid]: option.id }))}>
              <div className="d-flex justify-content-between gap-2"><strong>{option.label}</strong><span>{pct}%</span></div>
              <ProgressBar now={pct} className="mt-2" style={{ height: 5 }} />
            </button>;
          })}</div>}

          {campaign.reward?.label && <div className="small mb-3"><i className="fa-solid fa-gift me-2" /><strong>{campaign.reward.label}</strong></div>}
          {reward && <Alert variant="success" className="mb-3"><strong>Benefício liberado.</strong>{reward.code && <div className="mt-1">Código: <code>{reward.code}</code></div>}</Alert>}

          <div className="d-flex flex-wrap gap-2">
            <Button onClick={() => participate(campaign)} disabled={busy === campaign.uuid}>{busy === campaign.uuid ? "Registrando..." : campaign.type === "poll" ? "Votar" : "Participar"}</Button>
            <Button variant="outline-light" onClick={() => goToCommerce(campaign)}><i className="fa-solid fa-ticket me-2" />Ver ingressos e combos</Button>
          </div>
          {totalVotes > 0 && <small className="text-secondary d-block mt-2">{totalVotes} voto{totalVotes === 1 ? "" : "s"} registrado{totalVotes === 1 ? "" : "s"}</small>}
        </div>;
      })}
    </div>
  </section>;
}

EventCampaignsPanel.propTypes = {
  eventId: PropTypes.number.isRequired,
  eventSlug: PropTypes.string.isRequired,
  user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]) }),
  onLoginRequired: PropTypes.func,
};

EventCampaignsPanel.defaultProps = { user: null, onLoginRequired: null };
