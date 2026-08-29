import axios from "axios";
import { apiBaseUrl } from "../config";

const authUrl = `${apiBaseUrl}/auth`;
const token = () => localStorage.getItem("token") || localStorage.getItem("access_token");
const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
const USER_CACHE_TTL = 30000;
let cachedUser = null;
let cachedAt = 0;
let pendingMe = null;

const firstError = (error, fallback) => {
  const payload = error?.response?.data;
  if (payload?.message) return payload.message;
  if (payload?.error && typeof payload.error === "string") return payload.error;
  if (payload?.errors) return Object.values(payload.errors).flat()[0] || fallback;
  return error?.message || fallback;
};

const normalizeUser = (payload) => {
  const user = payload?.user ?? payload;
  if (!user || typeof user !== "object") return null;
  return {
    ...user,
    _auth: {
      is_employer: Boolean(payload?.is_employer),
      employer: payload?.employer ?? null,
      establishments: payload?.establishments ?? [],
      applications: payload?.applications ?? [],
    },
  };
};

const storeAccessToken = (payload) => {
  const accessToken = payload?.token?.access_token ?? payload?.access_token ?? payload?.token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("A API não retornou um token de acesso.");
  }
  localStorage.setItem("token", accessToken);
  localStorage.setItem("access_token", accessToken);
  cachedUser = normalizeUser(payload);
  cachedAt = cachedUser ? Date.now() : 0;
  return accessToken;
};

const clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  cachedUser = null;
  cachedAt = 0;
  pendingMe = null;
};

const authService = {
  getToken: token,
  setToken: (value) => {
    localStorage.setItem("token", value);
    localStorage.setItem("access_token", value);
  },
  clearCache: () => {
    cachedUser = null;
    cachedAt = 0;
    pendingMe = null;
  },

  async login(username, password) {
    try {
      const response = await axios.post(`${authUrl}/login`, { username, password }, { timeout: 12000 });
      storeAccessToken(response.data);
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível entrar."));
    }
  },

  async loginGoogle(credential) {
    if (!credential) throw new Error("O Google não retornou uma credencial válida.");
    try {
      const response = await axios.post(`${authUrl}/google`, { token_id: credential }, { timeout: 15000 });
      storeAccessToken(response.data);
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível entrar com o Google."));
    }
  },

  async register(userObject) {
    try {
      const response = await axios.post(`${authUrl}/register`, userObject, { timeout: 15000 });
      await authService.login(userObject.email, userObject.password);
      return response.data;
    } catch (error) {
      if (error?.response?.data?.errors) throw error.response.data.errors;
      throw new Error(firstError(error, "Não foi possível criar a conta."));
    }
  },

  async logout() {
    try {
      if (token()) await axios.post(`${authUrl}/logout`, {}, { headers: headers(), timeout: 8000 });
    } finally {
      clearSession();
    }
    return true;
  },

  async me({ force = false } = {}) {
    if (!token()) throw new Error("Usuário não autenticado.");
    if (!force && cachedUser && Date.now() - cachedAt < USER_CACHE_TTL) return cachedUser;
    if (!force && pendingMe) return pendingMe;

    pendingMe = axios.get(`${authUrl}/me`, { headers: headers(), timeout: 10000 })
      .then((response) => {
        const user = normalizeUser(response.data);
        if (!user) throw new Error("Resposta de usuário inválida.");
        cachedUser = user;
        cachedAt = Date.now();
        return user;
      })
      .catch((error) => {
        if (error?.response?.status === 401) clearSession();
        throw new Error(firstError(error, "Não foi possível carregar sua conta."));
      })
      .finally(() => {
        pendingMe = null;
      });

    return pendingMe;
  },

  async emailVerify(verificationCode) {
    try {
      const response = await axios.post(`${authUrl}/email-verify`, { verification_code: verificationCode }, { headers: headers(), timeout: 12000 });
      authService.clearCache();
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível verificar o e-mail."));
    }
  },

  async resendCodeEmailVerification() {
    try {
      const response = await axios.post(`${authUrl}/resend-code-email-verification`, {}, { headers: headers(), timeout: 12000 });
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível reenviar o código."));
    }
  },

  async changePassword(current_password, new_password, confirm_password) {
    try {
      const response = await axios.post(`${authUrl}/change-password`, { current_password, new_password, password_confirmation: confirm_password }, { headers: headers(), timeout: 12000 });
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível alterar a senha."));
    }
  },

  async passwordEmail(email) {
    try {
      return await axios.post(`${authUrl}/password-email`, { email }, { timeout: 12000 });
    } catch (error) {
      if (error?.response?.data?.errors) throw error.response.data.errors;
      throw new Error(firstError(error, "Não foi possível enviar o código de recuperação."));
    }
  },

  async passwordReset(email, resetCode, newPassword) {
    try {
      return await axios.post(`${authUrl}/password-reset`, {
        email,
        reset_password_code: resetCode,
        password: newPassword,
      }, { timeout: 12000 });
    } catch (error) {
      if (error?.response?.data?.errors) throw error.response.data.errors;
      throw new Error(firstError(error, "Não foi possível redefinir a senha."));
    }
  },
};

export default authService;
