import apiClient from "./ApiClient";

const apiServiceUrl = "auth";

const authService = {
  getToken: () => localStorage.getItem("token"),
  setToken: (token) => localStorage.setItem("token", token),
  clearToken: () => localStorage.removeItem("token"),

  login: async (email, password) => {
    const response = await apiClient.post(`/${apiServiceUrl}/login`, {
      email,
      password,
    });

    const token = response.data?.access_token;
    if (!token) throw new Error("A API não retornou um token de acesso.");

    authService.setToken(token);
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
    await apiClient.post(`/${apiServiceUrl}/email-verify`, {
      verification_code: verificationCode,
    });
    return true;
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
    return response.data;
  },

  passwordEmail: async (email) =>
    apiClient.post(`/${apiServiceUrl}/password-email`, { email }),

  passwordReset: async (email, resetCode, newPassword, confirmPassword) =>
    apiClient.post(`/${apiServiceUrl}/password-update`, {
      email,
      reset_password_code: resetCode,
      password: newPassword,
      password_confirmation: confirmPassword,
    }),

  resendCodeEmailVerification: async () => {
    await apiClient.post(`/${apiServiceUrl}/resend-code-email-verification`, {});
    return true;
  },
};

export default authService;
