import apiClient from "./ApiClient";

const apiServiceUrl = "auth";
const EMAIL_VERIFICATION_DEFERRED_TOKEN_KEY = "cutinapp_email_verification_deferred_token";

const extractToken = (payload = {}) =>
  payload.token?.access_token ??
  payload.token?.original?.access_token ??
  payload.access_token ??
  (typeof payload.token === "string" ? payload.token : null);

const authService = {
  getToken: () => localStorage.getItem("token"),
  setToken: (token) => {
    localStorage.removeItem(EMAIL_VERIFICATION_DEFERRED_TOKEN_KEY);
    localStorage.setItem("token", token);
  },
  clearToken: () => {
    localStorage.removeItem("token");
    localStorage.removeItem(EMAIL_VERIFICATION_DEFERRED_TOKEN_KEY);
  },

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

  startInstagram: async () => {
    const response = await apiClient.post(`/${apiServiceUrl}/instagram/start`, {});
    const authorizationUrl = String(response.data?.authorization_url || "").trim();
    if (!authorizationUrl) throw new Error("A API não retornou a URL de autenticação do Instagram.");
    return response.data;
  },

  loginInstagram: async (code, state) => {
    if (!code || !state) throw new Error("O Instagram não retornou uma autorização válida.");
    const response = await apiClient.post(`/${apiServiceUrl}/instagram/callback`, { code, state });
    if (!response.data?.requires_completion) authService.finishAuthentication(response.data);
    return response.data;
  },

  completeInstagram: async ({ completionToken, email, firstName }) => {
    const response = await apiClient.post(`/${apiServiceUrl}/instagram/complete`, {
      completion_token: completionToken,
      email,
      first_name: firstName || undefined,
    });
    authService.finishAuthentication(response.data);
    return response.data;
  },

  linkInstagram: async (completionToken) => {
    if (!completionToken) throw new Error("A confirmação do Instagram não foi encontrada.");
    const response = await apiClient.post(`/${apiServiceUrl}/instagram/link`, {
      completion_token: completionToken,
    });
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
    localStorage.removeItem(EMAIL_VERIFICATION_DEFERRED_TOKEN_KEY);
    return response.data;
  },

  emailVerificationState: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}/email-verification-state`);
    return response.data;
  },

  deferEmailVerification: async () => {
    const response = await apiClient.post(`/${apiServiceUrl}/defer-email-verification`, {});
    const token = authService.getToken();
    if (token) localStorage.setItem(EMAIL_VERIFICATION_DEFERRED_TOKEN_KEY, token);
    return response.data;
  },

  isEmailVerificationDeferredForCurrentSession: () => {
    const token = authService.getToken();
    if (!token) return false;
    return localStorage.getItem(EMAIL_VERIFICATION_DEFERRED_TOKEN_KEY) === token;
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
