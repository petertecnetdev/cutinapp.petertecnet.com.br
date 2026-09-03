import { apiV1BaseUrl } from "../config";
import { createApiClient } from "./ApiClient";

const appApiClient = createApiClient(apiV1BaseUrl);

export default appApiClient;
