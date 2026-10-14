const UNVERIFIED_STATES = new Set(['unclaimed', 'pending_claim', 'rejected']);

/**
 * The API uses ownership_status for ownership and verification_status for
 * the *method* of verification. Neither field alone grants commerce rights.
 * Legacy records with no Independence fields retain their existing UI, while
 * the server remains the sole authority for ticket sales.
 */
export const isVerifiedListing = (entity) => {
  if (!entity || typeof entity !== 'object') return false;
  const ownership = String(entity.ownership_status || '').trim().toLowerCase();
  const review = String(entity.verification_status || '').trim().toLowerCase();
  const source = String(entity.listing_source || '').trim().toLowerCase();
  if (ownership) {
    if (ownership !== 'verified') return false;
    if (review === 'manual_approved') return Boolean(entity.ownership_verified_at);
    if (review === 'legacy_owner_record') return source === 'legacy_organizer';
    return false;
  }
  // Compatibility with the older frontend field; do not treat arbitrary
  // verification_status strings as proof of ownership.
  return review === 'verified' && entity.is_institutional_listing !== true
    && (!source || source === 'legacy_organizer');
};

export const isUnverifiedListing = (entity) => {
  if (!entity || typeof entity !== 'object') return false;
  if (isVerifiedListing(entity)) return false;
  const ownership = String(entity.ownership_status || '').trim().toLowerCase();
  const review = String(entity.verification_status || '').trim().toLowerCase();
  const source = String(entity.listing_source || '').trim();
  return Boolean(ownership || UNVERIFIED_STATES.has(review) || review || source || entity.is_institutional_listing === true);
};

// Presentation-only safeguard. W01's ListingCommercePolicy must independently
// validate the event, its production, their app ownership and sale permissions.
export const canShowListingCommerce = (entity) => Boolean(entity) && !isUnverifiedListing(entity);

export const safeListingSourceUrl = (value) => {
  if (typeof value !== 'string') return '';
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return '';
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return '';
    return parsed.href;
  } catch (_) { return ''; }
};

export const listingSourceLabel = (entity) => {
  const label = String(entity?.source_name || entity?.listing_source_label || '').trim();
  return label.slice(0, 140) || 'Fonte não informada — solicite verificação';
};

export const claimStatusMessage = (status) => {
  if (status === 'duplicate') return 'Já existe uma solicitação para esta ficha. Nossa equipe fará a análise.';
  if (status === 'approved') return 'Reivindicação aprovada após verificação. Consulte sua conta para saber quais acessos foram liberados.';
  if (status === 'rejected') return 'Reivindicação não aprovada. Entre em contato com o suporte para esclarecimentos.';
  if (status === 'pending' || status === 'pending_claim') return 'Solicitação recebida e em análise. O envio não transfere acesso ou propriedade.';
  return 'Solicitação recebida. A equipe verificará sua identidade antes de qualquer transferência de acesso.';
};