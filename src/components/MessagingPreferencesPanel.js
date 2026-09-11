import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import NotificationPermissionControl from "./NotificationPermissionControl";
import messagingService from "../services/MessagingService";

const DEFAULTS = {
  allow_messages_from: "everyone",
  show_activity_status: true,
  send_read_receipts: true,
  allow_group_invites: true,
  muted_words: [],
  email_new_messages: true,
  push_new_messages: true,
  unread_reminders: true,
  digest_messages: true,
  include_message_preview: true,
  email_cooldown_minutes: 10,
  first_reminder_minutes: 120,
  second_reminder_minutes: 720,
};

export default function MessagingPreferencesPanel({ onClose }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      messagingService.settings(),
      messagingService.metrics(30),
    ]).then(([settingsResult, metricsResult]) => {
      if (!active) return;
      if (settingsResult.status === "fulfilled") {
        setSettings({ ...DEFAULTS, ...(settingsResult.value?.data || {}) });
      } else {
        setMessage("Não foi possível carregar suas preferências.");
      }
      if (metricsResult.status === "fulfilled") {
        setMetrics(metricsResult.value?.data || null);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggle = (key) => setSettings((current) => ({ ...current, [key]: !current[key] }));
  const change = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await messagingService.updateSettings(settings);
      setSettings({ ...DEFAULTS, ...(response?.data || settings) });
      setMessage("Preferências salvas.");
    } catch (error) {
      setMessage(error?.response?.data?.message || "Não foi possível salvar as preferências.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cut-chat-modal-backdrop cut-chat-preferences-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="cut-chat-modal cut-chat-preferences" role="dialog" aria-modal="true" aria-label="Preferências do Direct" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <button type="button" onClick={onClose} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
          <strong>Preferências do Direct</strong>
          <span />
        </header>

        <div className="cut-chat-preferences__body">
          <NotificationPermissionControl />

          {loading ? <div className="cut-chat-state">Carregando preferências…</div> : (
            <>
              <div className="cut-chat-preferences__section">
                <h3>Novas mensagens</h3>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.email_new_messages} onChange={() => toggle("email_new_messages")} /><span><strong>E-mail</strong><small>Receber e-mail quando houver mensagens não lidas.</small></span></label>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.push_new_messages} onChange={() => toggle("push_new_messages")} /><span><strong>Push</strong><small>Receber aviso imediato no celular ou navegador.</small></span></label>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.unread_reminders} onChange={() => toggle("unread_reminders")} /><span><strong>Lembretes</strong><small>Relembrar no máximo duas vezes se a mensagem continuar não lida.</small></span></label>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.digest_messages} onChange={() => toggle("digest_messages")} /><span><strong>Agrupar conversas</strong><small>Juntar mensagens próximas em um único e-mail.</small></span></label>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.include_message_preview} onChange={() => toggle("include_message_preview")} /><span><strong>Mostrar prévia</strong><small>Exibir o conteúdo da mensagem no e-mail e no push.</small></span></label>
              </div>

              <div className="cut-chat-preferences__section">
                <h3>Frequência</h3>
                <label className="cut-chat-field"><span>Intervalo mínimo entre e-mails</span><select value={settings.email_cooldown_minutes} onChange={(event) => change("email_cooldown_minutes", Number(event.target.value))}><option value={5}>5 minutos</option><option value={10}>10 minutos</option><option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={60}>1 hora</option></select></label>
                <label className="cut-chat-field"><span>Primeiro lembrete</span><select value={settings.first_reminder_minutes} onChange={(event) => change("first_reminder_minutes", Number(event.target.value))}><option value={30}>30 minutos</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={240}>4 horas</option></select></label>
                <label className="cut-chat-field"><span>Segundo e último lembrete</span><select value={settings.second_reminder_minutes} onChange={(event) => change("second_reminder_minutes", Number(event.target.value))}><option value={360}>6 horas</option><option value={720}>12 horas</option><option value={1440}>24 horas</option><option value={2880}>48 horas</option></select></label>
              </div>

              {metrics && (
                <div className="cut-chat-preferences__section">
                  <h3>Eficiência do Direct · últimos 30 dias</h3>
                  <div className="cut-chat-metrics-grid">
                    <div><strong>{metrics.read_rate ?? 0}%</strong><small>mensagens lidas</small></div>
                    <div><strong>{metrics.response_rate ?? 0}%</strong><small>com resposta</small></div>
                    <div><strong>{Math.round((metrics.avg_read_seconds || 0) / 60)} min</strong><small>tempo médio até leitura</small></div>
                    <div><strong>{Math.round((metrics.avg_response_seconds || 0) / 60)} min</strong><small>tempo médio até resposta</small></div>
                    <div><strong>{metrics.email_click_rate ?? 0}%</strong><small>cliques nos e-mails</small></div>
                    <div><strong>{metrics.emails_sent ?? 0}</strong><small>e-mails enviados</small></div>
                  </div>
                </div>
              )}

              <div className="cut-chat-preferences__section">
                <h3>Privacidade e Direct</h3>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.show_activity_status} onChange={() => toggle("show_activity_status")} /><span><strong>Mostrar status de atividade</strong><small>Permitir que outras pessoas vejam quando você está online.</small></span></label>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.send_read_receipts} onChange={() => toggle("send_read_receipts")} /><span><strong>Confirmação de leitura</strong><small>Mostrar quando as mensagens foram lidas.</small></span></label>
                <label className="cut-chat-setting"><input type="checkbox" checked={settings.allow_group_invites} onChange={() => toggle("allow_group_invites")} /><span><strong>Convites para grupos</strong><small>Permitir que adicionem você a conversas em grupo.</small></span></label>
                <label className="cut-chat-field"><span>Quem pode iniciar uma conversa</span><select value={settings.allow_messages_from} onChange={(event) => change("allow_messages_from", event.target.value)}><option value="everyone">Todos</option><option value="requests">Como solicitação</option><option value="none">Ninguém</option></select></label>
              </div>
            </>
          )}

          {message && <div className="cut-chat-preferences__message">{message}</div>}
        </div>

        <footer className="cut-chat-preferences__footer">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" className="is-primary" onClick={save} disabled={loading || saving}>{saving ? "Salvando…" : "Salvar preferências"}</button>
        </footer>
      </section>
    </div>
  );
}

MessagingPreferencesPanel.propTypes = {
  onClose: PropTypes.func.isRequired,
};
