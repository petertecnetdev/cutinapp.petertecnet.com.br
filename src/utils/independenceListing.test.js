import {
  isUnverifiedListing,
  isVerifiedListing,
  canShowListingCommerce,
  safeListingSourceUrl,
  claimStatusMessage,
  listingSourceLabel,
} from './independenceListing';

describe('Independence public listing presentation guard', () => {
  test('missing entity is never shown as commerce-ready', () => {
    expect(canShowListingCommerce(null)).toBe(false);
    expect(canShowListingCommerce(undefined)).toBe(false);
    expect(canShowListingCommerce({ id: 1 })).toBe(true); // existing legacy record, server remains authoritative
  });

  test.each([
    [{ ownership_status: 'unclaimed' }],
    [{ ownership_status: 'pending_claim' }],
    [{ ownership_status: 'rejected' }],
    [{ verification_status: 'pending_claim' }],
    [{ verification_status: 'rejected' }],
    [{ listing_source: 'institutional' }],
    [{ listing_source: 'curated' }],
    [{ is_institutional_listing: true }],
    [{ ownership_status: 'unclaimed', verification_status: 'verified' }],
    [{ ownership_status: 'pending_claim', verification_status: 'manual_approved', ownership_verified_at: '2026-10-12' }],
    [{ verification_status: 'verified', listing_source: 'curated' }],
    [{ verification_status: 'verified', is_institutional_listing: true }],
    [{ verification_status: 'legacy_owner_record' }],
    [{ ownership_status: 'verified', verification_status: 'manual_approved' }],
    [{ ownership_status: 'verified', verification_status: 'legacy_owner_record', listing_source: 'curated' }],
    [{ ownership_status: 'verified', verification_status: 'verified' }],
  ])('blocks unverified and spoofed record %j', (entity) => {
    expect(isVerifiedListing(entity)).toBe(false);
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test('API-approved and legitimate legacy records retain presentation', () => {
    const approved = {
      ownership_status: 'verified',
      verification_status: 'manual_approved',
      ownership_verified_at: '2026-10-12T12:00:00Z',
    };
    const legacy = {
      ownership_status: 'verified',
      verification_status: 'legacy_owner_record',
      listing_source: 'legacy_organizer',
    };
    expect(isVerifiedListing(approved)).toBe(true);
    expect(isVerifiedListing(legacy)).toBe(true);
    expect(canShowListingCommerce(approved)).toBe(true);
    expect(canShowListingCommerce(legacy)).toBe(true);
    expect(isVerifiedListing({ verification_status: 'verified' })).toBe(true);
  });

  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/path',
    'http://example.org',
    'https://user:pass@example.org',
    'https://localhost/private',
    'https://a.local/private',
    'https://a.internal/private',
    'https://127.0.0.1/private',
    'https://[::1]/private',
    'https://example.org@127.0.0.1/',
    'not-a-url',
    '',
  ])('rejects unsafe source URL %s', (url) => {
    expect(safeListingSourceUrl(url)).toBe('');
  });

  test('accepts a public HTTPS source and strips excessively long labels', () => {
    expect(safeListingSourceUrl('https://example.org/agenda')).toBe('https://example.org/agenda');
    expect(listingSourceLabel({ source_name: 'a'.repeat(300) })).toHaveLength(140);
    expect(listingSourceLabel({})).toMatch(/Fonte não informada/);
  });

  test('claim states never promise automatic access', () => {
    expect(claimStatusMessage('duplicate')).toMatch(/Já existe/);
    expect(claimStatusMessage('pending')).toMatch(/em análise/);
    expect(claimStatusMessage('approved')).toMatch(/aprovada após verificação/);
    expect(claimStatusMessage('rejected')).toMatch(/não aprovada/);
  });
});
