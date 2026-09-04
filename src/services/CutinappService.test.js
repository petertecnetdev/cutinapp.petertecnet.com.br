import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("CutinappService production ownership transfer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("transfers ownership through the generic organization contract", async () => {
    appApiClient.patch.mockResolvedValue({
      data: {
        message: "Responsabilidade transferida.",
        organization: { id: 42, user_id: 99, name: "Produção Teste" },
        owner: { id: 99, email: "novo@cutinapp.test" },
      },
    });

    const result = await cutinappService.transferProduction(42, "99");

    expect(appApiClient.patch).toHaveBeenCalledTimes(1);
    expect(appApiClient.patch).toHaveBeenCalledWith("/organizations/42", { owner_user_id: 99 });
    expect(result.production).toEqual(expect.objectContaining({ id: 42, user_id: 99 }));
    expect(result.owner).toEqual(expect.objectContaining({ id: 99 }));
  });
});
