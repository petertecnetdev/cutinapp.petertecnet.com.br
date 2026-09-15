import appApiClient from "./AppApiClient";

const paymentProviderService = {
  account: async (organizationId) => (
    await appApiClient.get(`/organizations/${organizationId}/payment-account`)
  ).data,

  connect: async (organizationId) => (
    await appApiClient.get(`/organizations/${organizationId}/payment-provider/connect`)
  ).data,
};

export default paymentProviderService;
