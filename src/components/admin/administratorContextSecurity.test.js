// Testes isolados de segurança administrativa; não ativam rotas ou privilégios.
import { clearApplicationAdminContextCache, loadApplicationAdminContext } from "../ApplicationAdminGate";
import authService from "../../services/AuthService";
import appApiClient from "../../services/AppApiClient";

jest.mock("../../services/AuthService", () => ({ __esModule: true, default: { getToken: jest.fn() } }));
jest.mock("../../services/AppApiClient", () => ({ __esModule: true, default: { get: jest.fn() } }));

beforeEach(() => { jest.resetAllMocks(); clearApplicationAdminContextCache(); });

test.each([401, 403])("falha fechada quando API retorna %i", async (status) => {
  authService.getToken.mockReturnValue("token-a");
  appApiClient.get.mockRejectedValue({ response: { status } });
  await expect(loadApplicationAdminContext()).rejects.toMatchObject({ response: { status } });
  expect(appApiClient.get).toHaveBeenCalledWith("/admin/context");
});

test("sem token não reaproveita autorização anterior", async () => {
  authService.getToken.mockReturnValueOnce("token-a").mockReturnValueOnce(null);
  appApiClient.get.mockResolvedValue({ data: { data: { authorized: true, permissions: ["manage_team"] } } });
  await expect(loadApplicationAdminContext()).resolves.toMatchObject({ authorized: true });
  await expect(loadApplicationAdminContext()).resolves.toBeNull();
});

test("troca de token não reutiliza cache administrativo", async () => {
  authService.getToken.mockReturnValueOnce("token-a").mockReturnValueOnce("token-b");
  appApiClient.get.mockResolvedValueOnce({ data: { data: { authorized: true } } }).mockResolvedValueOnce({ data: { data: { authorized: false } } });
  await expect(loadApplicationAdminContext()).resolves.toMatchObject({ authorized: true });
  await expect(loadApplicationAdminContext()).resolves.toMatchObject({ authorized: false });
  expect(appApiClient.get).toHaveBeenCalledTimes(2);
});
