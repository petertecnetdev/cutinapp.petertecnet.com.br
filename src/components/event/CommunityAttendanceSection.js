import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Card } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import communityMeetupService from "../../services/CommunityMeetupService";
import { storageUrl } from "../../config";
import "./CommunityAttendanceSection.css";

const nameOf = (person) => [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.user_name || "Participante";
const avatarOf = (person) => {
  const value = person?.avatar;
  if (!value) return "";
  return /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
};

export default function CommunityAttendanceSection({ event, isOwner = false }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const login = () => navigate("/login", { state: { from: `${location.pathname}${location.search}#participar` } });

  const load = useCallback(async () => {
    try {
      const summary = user
        ? await communityMeetupService.attendance(event.id)
        : await communityMeetupService.publicAttendance(event.slug);
      setData(summary);
      if (isOwner && user) {
        const managed = await communityMeetupService.manageAttendance(event.id);
        setParticipants(managed?.participants || []);
      }
    } catch (err) {
      setMessage({ type: "danger", text: err?.message || "Não foi possível carregar a participação deste encontro." });
    }
  }, [event.id, event.slug, isOwner, user]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (status) => {
    if (!user) return login();
    setBusy(true); setMessage(null);
    try {
      const next = await communityMeetupService.setAttendance(event.id, status);
      setData(next);
      setMessage({ type: "success", text: next?.message || "Participação atualizada." });
      if (isOwner) {
        const managed = await communityMeetupService.manageAttendance(event.id);
        setParticipants(managed?.participants || []);
      }
    } catch (err) {
      setMessage({ type: "danger", text: err?.message || "Não foi possível atualizar sua participação." });
    } finally { setBusy(false); }
  };

  const checkin = () => {
    if (!user) return login();
    if (!navigator.geolocation) {
      setMessage({ type: "warning", text: "Seu navegador não oferece geolocalização. O organizador pode confirmar sua presença." });
      return;
    }
    setBusy(true); setMessage(null);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const next = await communityMeetupService.selfCheckin(event.id, coords.latitude, coords.longitude);
        setData(next);
        setMessage({ type: "success", text: next?.message || "Presença confirmada." });
      } catch (err) {
        setMessage({ type: "danger", text: err?.message || "Não foi possível confirmar presença pela localização." });
      } finally { setBusy(false); }
    }, () => {
      setBusy(false);
      setMessage({ type: "warning", text: "Não foi possível acessar sua localização. O organizador pode confirmar sua presença." });
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  };

  const confirmParticipant = async (userId) => {
    setBusy(true); setMessage(null);
    try {
      await communityMeetupService.organizerCheckin(event.id, userId);
      const managed = await communityMeetupService.manageAttendance(event.id);
      setParticipants(managed?.participants || []);
      setData((current) => current ? { ...current, counts: managed?.counts || current.counts } : current);
      setMessage({ type: "success", text: "Presença confirmada." });
    } catch (err) {
      setMessage({ type: "danger", text: err?.message || "Não foi possível confirmar a presença." });
    } finally { setBusy(false); }
  };

  const counts = data?.counts || {};
  const mine = data?.mine || null;
  const happening = useMemo(() => {
    const now = Date.now();
    const start = new Date(event.start_date).getTime();
    const end = new Date(event.end_date).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
  }, [event.start_date, event.end_date]);

  return (
    <section id="participar" className="cut-meetup-attendance mb-5">
      <Card className="cut-panel"><Card.Body className="p-4 p-lg-5">
        <div className="cut-meetup-attendance__head">
          <div><span className="cut-eyebrow">Encontro comunitário</span><h2 className="cut-section-title mt-2">Quem vai?</h2><p className="text-secondary mb-0">Sem ingresso e sem compra. Marque sua intenção e encontre a galera no local combinado.</p></div>
          <div className="cut-meetup-attendance__stats"><strong>{Number(counts.going || 0) + Number(counts.attended || 0)}</strong><span>vão / foram</span><strong>{Number(counts.interested || 0)}</strong><span>interessados</span></div>
        </div>

        {message && <Alert className="mt-4" variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}

        <div className="cut-meetup-attendance__actions mt-4">
          <Button variant={mine?.status === "interested" ? "light" : "outline-light"} disabled={busy || mine?.status === "attended"} onClick={() => setStatus("interested")}><i className="fa-regular fa-star me-2" />Tenho interesse</Button>
          <Button variant={mine?.status === "going" ? "light" : "outline-light"} disabled={busy || mine?.status === "attended"} onClick={() => setStatus("going")}><i className="fa-solid fa-user-check me-2" />Eu vou</Button>
          {mine && mine.status !== "cancelled" && mine.status !== "attended" && <Button variant="outline-secondary" disabled={busy} onClick={() => setStatus("cancelled")}>Não vou mais</Button>}
          {happening && mine && ["interested", "going"].includes(mine.status) && <Button disabled={busy} onClick={checkin}><i className="fa-solid fa-location-dot me-2" />Estou no local</Button>}
          {mine?.status === "attended" && <span className="cut-meetup-attendance__checked"><i className="fa-solid fa-circle-check" /> Presença confirmada</span>}
        </div>

        {Array.isArray(data?.attendees) && data.attendees.length > 0 && <div className="cut-meetup-attendance__people mt-4">
          <strong>Quem confirmou</strong>
          <div>{data.attendees.map((person) => <button type="button" key={person.user_id} onClick={() => navigate(Number(person.user_id) === Number(user?.id) ? "/profile" : `/profile/${person.user_id}`)} title={nameOf(person)}>{avatarOf(person) ? <img src={avatarOf(person)} alt="" /> : <span>{nameOf(person).slice(0, 2).toUpperCase()}</span>}</button>)}</div>
        </div>}

        {isOwner && participants.length > 0 && <details className="cut-meetup-attendance__manage mt-4">
          <summary>Gerenciar presenças ({participants.length})</summary>
          <div className="mt-3">{participants.filter((person) => person.status !== "cancelled").map((person) => <div className="cut-meetup-attendance__participant" key={person.user_id}><div><strong>{nameOf(person)}</strong><small>{person.status === "attended" ? "Presente" : person.status === "going" ? "Vai participar" : "Interessado"}</small></div>{person.status !== "attended" && <Button size="sm" variant="outline-light" disabled={busy} onClick={() => confirmParticipant(person.user_id)}>Confirmar presença</Button>}</div>)}</div>
        </details>}
      </Card.Body></Card>
    </section>
  );
}


CommunityAttendanceSection.propTypes = {
  event: PropTypes.shape({
    id: PropTypes.number.isRequired,
    slug: PropTypes.string.isRequired,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
  }).isRequired,
  isOwner: PropTypes.bool,
};
