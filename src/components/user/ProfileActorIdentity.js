import React from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { storageUrl } from "../../config";

export const ACTOR_META = {
  artist: { label: "Artista", icon: "fa-solid fa-microphone-lines" },
  producer: { label: "Produtor", icon: "fa-solid fa-clapperboard" },
  promoter: { label: "Promoter", icon: "fa-solid fa-bullhorn" },
  staff: { label: "Staff", icon: "fa-solid fa-people-group" },
  ticket_seller: { label: "Bilheteria", icon: "fa-solid fa-ticket" },
  partner: { label: "Parceiro", icon: "fa-solid fa-handshake" },
  participant: { label: "Participante", icon: "fa-solid fa-user" },
};

const image = (value) => !value ? "" : /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;

export const actorThemeClass = (identity) => {
  const roles = Array.isArray(identity?.roles) ? identity.roles : [];
  const primary = identity?.primary_role || roles[0]?.key || "participant";
  return `cut-actor-theme--${primary}${roles.length > 1 ? " cut-actor-theme--multi" : ""}`;
};

export function ProfileActorBadges({ identity }) {
  const roles = Array.isArray(identity?.roles) ? identity.roles : [];
  if (roles.length === 0) return null;

  return <div className="cut-profile-actor-badges" aria-label="Papéis na Cutinapp">
    {roles.map((role) => {
      const meta = ACTOR_META[role.key] || { label: role.label || role.key, icon: "fa-solid fa-circle" };
      return <span className={`cut-profile-actor-badge cut-profile-actor-badge--${role.key}`} key={role.key}>
        <i className={meta.icon} />{role.label || meta.label}
      </span>;
    })}
    {roles.length > 1 && <span className="cut-profile-actor-multi-label"><i className="fa-solid fa-layer-group" />Perfil multiator</span>}
  </div>;
}

export function ProfileActorLinks({ identity }) {
  const navigate = useNavigate();
  const artists = Array.isArray(identity?.artist_profiles) ? identity.artist_profiles : [];
  const productions = Array.isArray(identity?.productions) ? identity.productions : [];
  const staffTitles = Array.isArray(identity?.staff_titles) ? identity.staff_titles : [];

  if (artists.length === 0 && productions.length === 0 && staffTitles.length === 0) return null;

  return <section className="cut-profile-actor-links" aria-label="Atuação na Cutinapp">
    <div className="cut-section-heading">
      <div><span className="cut-eyebrow">Atuação na Cutinapp</span><h2>Perfis e papéis conectados</h2></div>
    </div>

    <div className="cut-profile-actor-link-grid">
      {artists.map((artist) => <button type="button" className="cut-profile-actor-link cut-profile-actor-link--artist" key={`artist-${artist.id}`} onClick={() => navigate(`/artist/${artist.slug}`)}>
        <span className="cut-profile-actor-link__media">{artist.photo ? <img src={image(artist.photo)} alt={artist.stage_name} /> : <i className="fa-solid fa-microphone-lines" />}</span>
        <span className="cut-profile-actor-link__copy"><small>Perfil artístico</small><strong>{artist.stage_name}</strong>{artist.artist_type && <span>{artist.artist_type}</span>}</span>
        <i className="fa-solid fa-chevron-right" />
      </button>)}

      {productions.map((production) => <button type="button" className="cut-profile-actor-link cut-profile-actor-link--producer" key={`production-${production.id}`} onClick={() => navigate(`/production/${production.slug}/public`)}>
        <span className="cut-profile-actor-link__media">{production.logo ? <img src={image(production.logo)} alt={production.name} /> : <i className="fa-solid fa-clapperboard" />}</span>
        <span className="cut-profile-actor-link__copy"><small>Produção</small><strong>{production.name}</strong><span>Ver página da produção</span></span>
        <i className="fa-solid fa-chevron-right" />
      </button>)}
    </div>

    {staffTitles.length > 0 && <div className="cut-profile-staff-titles">
      <span>Funções de equipe</span>
      <div>{staffTitles.map((title) => <span key={title}>{title}</span>)}</div>
    </div>}
  </section>;
}

const roleShape = PropTypes.shape({ key: PropTypes.string.isRequired, label: PropTypes.string });
const identityShape = PropTypes.shape({
  primary_role: PropTypes.string,
  roles: PropTypes.arrayOf(roleShape),
  artist_profiles: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, slug: PropTypes.string, stage_name: PropTypes.string, artist_type: PropTypes.string, photo: PropTypes.string })),
  productions: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, slug: PropTypes.string, name: PropTypes.string, logo: PropTypes.string })),
  staff_titles: PropTypes.arrayOf(PropTypes.string),
});

ProfileActorBadges.propTypes = { identity: identityShape };
ProfileActorLinks.propTypes = { identity: identityShape };
