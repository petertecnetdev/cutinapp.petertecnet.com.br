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

  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    const response = await apiClient.post(`/${apiServiceUrl}/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
      password_confirmation: confirmPassword,
    });
    return response.data;
  },

  me: async () => {
    if (!authService.getToken()) throw new Error("Usuário não autenticado.");
    const response = await apiClient.get(`/${apiServiceUrl}/me`);
    const payload = response.data || {};
    const user = payload.user ?? payload;
    return {
      ...user,
      applications: payload.applications ?? user?.applications ?? [],
      establishments: payload.establishments ?? user?.establishments ?? [],
    };
  },

  passwordEmail: async (email) => {
    const response = await apiClient.post(`/${apiServiceUrl}/password-email`, { email });
    return response.data;
  },

  passwordReset: async (email, resetCode, newPassword, confirmPassword) => {
    const response = await apiClient.post(`/${apiServiceUrl}/password-reset`, {
      email,
      reset_password_code: String(resetCode || "").trim(),
      password: newPassword,
      password_confirmation: confirmPassword,
    });
    return response.data;
  },

  resendCodeEmailVerification: async () => {
    const response = await apiClient.post(`/${apiServiceUrl}/resend-code-email-verification`, {});
    return response.data;
  },
};

export default authService;
