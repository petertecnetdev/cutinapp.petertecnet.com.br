import { producerRegistrationRedirect } from "./producerRegistrationRedirect";

describe("producerRegistrationRedirect", () => {
  test("does not change normal registration or other guest routes", () => {
    expect(producerRegistrationRedirect({ pathname: "/register", search: "" }, true)).toBeNull();
    expect(producerRegistrationRedirect({ pathname: "/login", state: { from: "/production/create" } }, true)).toBeNull();
  });

  test("sends an authenticated producer to create a production with acquisition context", () => {
    expect(producerRegistrationRedirect({
      pathname: "/register",
      state: { from: "/production/create", acquisitionSource: "producer_landing_hero" },
    }, true)).toEqual({
      to: "/production/create",
      state: { from: "/production/create", acquisitionSource: "producer_landing_hero" },
    });
  });

  test("requires email verification before production creation when necessary", () => {
    expect(producerRegistrationRedirect({
      pathname: "/register",
      state: { from: "/production/create", acquisitionSource: "producer_landing_nav" },
    }, false)).toEqual({
      to: "/email-verify",
      state: { from: "/production/create", acquisitionSource: "producer_landing_nav" },
    });
  });

  test("supports producer deep links and UTM attribution", () => {
    expect(producerRegistrationRedirect({
      pathname: "/register",
      search: "?from=%2Fproduction%2Fcreate&utm_source=instagram",
    }, true)).toEqual({
      to: "/production/create",
      state: { from: "/production/create", acquisitionSource: "instagram" },
    });
    expect(producerRegistrationRedirect({
      pathname: "/register",
      search: "?role=producer",
    }, true)).toEqual({
      to: "/production/create",
      state: { from: "/production/create" },
    });
  });

  test("does not follow external return paths or forward invalid acquisition values", () => {
    expect(producerRegistrationRedirect({
      pathname: "/register",
      search: "?from=https%3A%2F%2Fexample.com",
    }, true)).toBeNull();
    expect(producerRegistrationRedirect({
      pathname: "/register",
      state: { from: "/production/create", acquisitionSource: "bad source / injected" },
    }, true)).toEqual({
      to: "/production/create",
      state: { from: "/production/create" },
    });
  });
});
