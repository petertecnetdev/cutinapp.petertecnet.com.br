import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// Isolate presentation tests from the Axios ESM implementation in this legacy Jest setup.
jest.mock("../../services/IndependenceClaimService", () => ({
  __esModule: true,
  default: { submit: jest.fn(), mine: jest.fn() },
}));

import UnverifiedListingPanel from "./UnverifiedListingPanel";

describe("Unverified listing public claim UI", () => {
  test("legacy producer listings remain untouched", () => {
    const html = renderToStaticMarkup(<UnverifiedListingPanel entity={{ id: 12 }} entityType="production" />);
    expect(html).toBe("");
  });

  test("a curated production displays accurate warning but never automatic grant", () => {
    const html = renderToStaticMarkup(
      <UnverifiedListingPanel
        entity={{ id: 3, ownership_status: "unclaimed", source_url: "https://example.org/event" }}
        entityType="production"
        user={null}
        onLogin={() => {}}
      />
    );
    expect(html).toContain("responsável não verificado");
    expect(html).toContain("Consultar publicação original");
    expect(html).toContain("Sou responsável por este cadastro");
    expect(html).not.toContain("Comprar ingresso");
  });

  test("claimed and verified listings never present a claim form", () => {
    const html = renderToStaticMarkup(
      <UnverifiedListingPanel
        entity={{ id: 9, ownership_status: "verified" }}
        entityType="event"
        user={{ id: 7, email: "test@example.org" }}
      />
    );
    expect(html).toBe("");
  });
});
