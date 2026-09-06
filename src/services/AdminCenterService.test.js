import appApiClient from "./AppApiClient";
import adminCenterService from "./AdminCenterService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("AdminCenterService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the application-scoped admin context", async () => {
    appApiClient.get.mockResolvedValue({
      data: { data: { authorized: true, is_root: true } },
    });

    await expect(adminCenterService.context()).resolves.toEqual({
      authorized: true,
      is_root: true,
    });
    expect(appApiClient.get).toHaveBeenCalledWith("/admin/context");
  });

  it("grants a profile through the application admin endpoint", async () => {
    const payload = { email: "admin@example.com", profile_id: 7 };
    appApiClient.post.mockResolvedValue({ data: { data: { id: 11, ...payload } } });

    await expect(adminCenterService.assign(payload)).resolves.toMatchObject({
      id: 11,
      profile_id: 7,
    });
    expect(appApiClient.post).toHaveBeenCalledWith("/admin/assignments", payload);
  });

  it("revokes an existing delegated administrator", async () => {
    appApiClient.delete.mockResolvedValue({ data: { data: { id: 11, status: "revoked" } } });

    await expect(adminCenterService.revoke(11)).resolves.toMatchObject({ status: "revoked" });
    expect(appApiClient.delete).toHaveBeenCalledWith("/admin/assignments/11");
  });
});
