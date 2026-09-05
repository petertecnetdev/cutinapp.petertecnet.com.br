import React from "react";
import { Container } from "react-bootstrap";
import { useParams } from "react-router-dom";
import EventAnnouncementsFeed from "../../components/event/EventAnnouncementsFeed";
import EventViewPage from "./EventViewPage";

export default function EventExperiencePage() {
  const { slug } = useParams();

  return (
    <>
      <EventViewPage />
      <div className="cut-app-page">
        <Container className="cut-page-container pb-4 pb-lg-5">
          <EventAnnouncementsFeed slug={slug} />
        </Container>
      </div>
    </>
  );
}
