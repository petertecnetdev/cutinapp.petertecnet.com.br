import React, { useState } from "react";
import PropTypes from "prop-types";
import { Modal } from "react-bootstrap";
import { storageUrl } from "../../config";

const mediaUrl = (value) => !value ? "" : /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const name = (story) => [story.first_name, story.last_name].filter(Boolean).join(" ") || "Participante";

export default function TimelineStories({ stories }) {
  const [active, setActive] = useState(null);
  if (!stories?.length) return null;
  return <>
    <div className="cut-timeline-stories" aria-label="Stories da comunidade">
      {stories.map((story) => <button type="button" className="cut-timeline-story" key={story.id} onClick={() => setActive(story)}>
        <span className="cut-timeline-story__ring">{story.avatar ? <img src={mediaUrl(story.avatar)} alt="" /> : <i className="fa-regular fa-user" />}</span>
        <small>{name(story).split(" ")[0]}</small>
      </button>)}
    </div>
    <Modal show={Boolean(active)} onHide={() => setActive(null)} centered contentClassName="cut-timeline-story-modal">
      <Modal.Header closeButton closeVariant="white"><Modal.Title>{active ? name(active) : "Story"}</Modal.Title></Modal.Header>
      <Modal.Body>{active?.media_path ? (active.media_type === "video" ? <video src={mediaUrl(active.media_path)} controls autoPlay playsInline /> : <img src={mediaUrl(active.media_path)} alt="Story" />) : <div className="cut-timeline-story-text">{active?.body}</div>}{active?.body && active?.media_path && <p>{active.body}</p>}</Modal.Body>
    </Modal>
  </>;
}

TimelineStories.propTypes = { stories: PropTypes.arrayOf(PropTypes.object) };
TimelineStories.defaultProps = { stories: [] };
