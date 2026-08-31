import apiClient from "./ApiClient";

const apiServiceUrl = "auth";

const extractToken = (payload = {}) =>
  payload.token?.access_token ??
  payload.token?.original?.access_token ??
  payload.access_token ??
  (typeof payload.token === "string" ? payload.token : null);

const authService = {
  getToken: () => localStorage.getItem("token"),
  setToken: (token) => localStorage.setItem("token", token),
  clearToken: () => localStorage.removeItem("token"),

  finishAuthentication: (payload) => {
    const token = extractToken(payload);
    if (!token) throw new Error("A API não retornou um token de acesso.");
    authService.setToken(token);
    return token;
  },

  login: async (email, password) => {
    const response = await apiClient.post(`/${apiServiceUrl}/login`, {
      email,
      username: email,
      password,
    });
    authService.finishAuthentication(response.data);
    return response.data;
  },

  loginGoogle: async (credential) => {
    if (!credential) throw new Error("Credencial do Google não recebida.");
    const response = await apiClient.post(`/${apiServiceUrl}/google`, {
      token_id: credential,
    });
    authService.finishAuthentication(response.data);
    return response.data;
  },

  register: async (userObject) => {
    const response = await apiClient.post(`/${apiServiceUrl}/register`, userObject);
    return response.data;
  },

  logout: async () => {
    try {
      await apiClient.post(`/${apiServiceUrl}/logout`);
    } finally {
      authService.clearToken();
    }
    return true;
  },

  emailVerify: async (verificationCode) => {
    const response = await apiClient.post(`/${apiServiceUrl}/email-verify`, {
      verification_code: String(verificationCode || "").trim(),
    });
    return response.data;
  },

  changePassword: async (current_password, new_password, confirm_password) => {
    await apiClient.post(`/${apiServiceUrl}/change-password`, {
      current_password,
      new_password,
      confirm_password,
    });
    return true;
  },

  me: async () => {
    if (!authService.getToken()) throw new Error("Usuário não autenticado.");
    const response = await apiClient.get(`/${apiServiceUrl}/me`);
    return response.data?.user ?? response.data;
  },

  passwordEmail: async (email) => apiClient.post(`/${apiServiceUrl}/password-email`, { email }),

  passwordReset: async (email, resetCode, newPassword, confirmPassword) =>
    apiClient.post(`/${apiServiceUrl}/password-update`, {
      email,
      reset_password_code: resetCode,
      password: newPassword,
      password_confirmation: confirmPassword,
    }),

  resendCodeEmailVerification: async () => {
    const response = await apiClient.post(`/${apiServiceUrl}/resend-code-email-verification`, {});
    return response.data;
  },
};

export default authService;
