import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Modal, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { storageUrl } from "../../config";
import cutinappService from "../../services/CutinappService";

const mediaUrl = (value) => !value ? "" : /^https?:\/\//i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const name = (item) => [item?.first_name, item?.last_name].filter(Boolean).join(" ") || item?.user_name || "Participante";
const initials = (item) => `${item?.first_name?.[0] || "U"}${item?.last_name?.[0] || ""}`.toUpperCase();

export default function EventPostViews({ postId }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [modal, setModal] = useState({ show: false, loading: false, data: null });

  useEffect(() => {
    let active = true;
    cutinappService.recordEventPostView(postId)
      .then((result) => active && setCount(Number(result?.views_count || 0)))
      .catch(() => {});
    return () => { active = false; };
  }, [postId]);

  const open = async () => {
    setModal({ show: true, loading: true, data: null });
    try {
      const data = await cutinappService.eventPostViewers(postId);
      setCount(Number(data?.views_count || 0));
      setModal({ show: true, loading: false, data });
    } catch (error) {
      setModal({ show: true, loading: false, data: { error: error?.message || "Não foi possível carregar os visualizadores." } });
    }
  };

  return <>
    <button type="button" onClick={open}><i className="fa-regular fa-eye" /> {count} Visualizações</button>
    <Modal show={modal.show} onHide={() => setModal({ show: false, loading: false, data: null })} centered className="cut-modal cut-social-viewers-modal">
      <Modal.Header closeButton><Modal.Title>Quem visualizou</Modal.Title></Modal.Header>
      <Modal.Body>
        {modal.loading ? <div className="cut-social-loading"><Spinner animation="border" size="sm" /><span>Carregando visualizações...</span></div> : modal.data?.error ? <Alert variant="danger">{modal.data.error}</Alert> : <>
          <div className="cut-social-view-summary"><strong>{modal.data?.views_count || 0}</strong><span>visualizações · {modal.data?.unique_viewers_count || 0} visitantes únicos</span></div>
          {(modal.data?.viewers || []).length > 0 ? <div className="cut-social-viewer-list">{modal.data.viewers.map((viewer) => <button type="button" key={viewer.id} onClick={() => navigate(`/users/${viewer.id}`)}><span className="cut-social-avatar cut-social-avatar--sm">{viewer.avatar ? <img src={mediaUrl(viewer.avatar)} alt="" /> : initials(viewer)}</span><span><strong>{name(viewer)}</strong><small>{viewer.views_count} visualização{Number(viewer.views_count) === 1 ? "" : "ões"}</small></span><i className="fa-solid fa-chevron-right" /></button>)}</div> : <p className="text-secondary mb-0">Ainda não há visualizadores identificados.</p>}
          {Number(modal.data?.anonymous_views_count || 0) > 0 && <small className="cut-social-anonymous-note"><i className="fa-solid fa-user-secret" /> {modal.data.anonymous_views_count} visualização{Number(modal.data.anonymous_views_count) === 1 ? "" : "ões"} de visitantes sem login.</small>}
        </>}
      </Modal.Body>
    </Modal>
  </>;
}

EventPostViews.propTypes = {
  postId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
};
