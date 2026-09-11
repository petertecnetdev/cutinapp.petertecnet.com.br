import appApiClient from "./AppApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const walletService = {
  mine: async () => {
    const data = (await appApiClient.get("/passes/mine")).data || {};
    return {
      passes: unwrap(data.passes),
      transfers: unwrap(data.transfers),
      summary: data?.summary && typeof data.summary === "object" ? data.summary : {},
    };
  },
};

export default walletService;
