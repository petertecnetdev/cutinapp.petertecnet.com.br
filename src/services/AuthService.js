import axios from "axios";
import { apiBaseUrl } from "../config";

const authUrl = `${apiBaseUrl}/auth`;
const token = () => localStorage.getItem("token");
const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
const firstError = (error, fallback) => {
  const payload = error?.response?.data;
  if (payload?.message) return payload.message;
  if (payload?.error && typeof payload.error === "string") return payload.error;
  if (payload?.errors) return Object.values(payload.errors).flat()[0] || fallback;
  return error?.message || fallback;
};

const authService = {
  getToken: token,
  setToken: (value) => localStorage.setItem("token", value),

  async login(username, password) {
    try {
      const response = await axios.post(`${authUrl}/login`, { username, password });
      const accessToken = response.data?.token?.access_token ?? response.data?.access_token;
      if (!accessToken) throw new Error("A API não retornou um token de acesso.");
      authService.setToken(accessToken);
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível entrar."));
    }
  },

  async register(userObject) {
    try {
      const response = await axios.post(`${authUrl}/register`, userObject);
      await authService.login(userObject.email, userObject.password);
      return response.data;
    } catch (error) {
      if (error?.response?.data?.errors) throw error.response.data.errors;
      throw new Error(firstError(error, "Não foi possível criar a conta."));
    }
  },

  async logout() {
    try {
      if (token()) await axios.post(`${authUrl}/logout`, {}, { headers: headers() });
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("access_token");
    }
    return true;
  },

  async me() {
    if (!token()) throw new Error("Usuário não autenticado.");
    try {
      const response = await axios.get(`${authUrl}/me`, { headers: headers() });
      const user = response.data?.user ?? response.data;
      if (!user || typeof user !== "object") throw new Error("Resposta de usuário inválida.");
      return {
        ...user,
        _auth: {
          is_employer: Boolean(response.data?.is_employer),
          employer: response.data?.employer ?? null,
          establishments: response.data?.establishments ?? [],
          applications: response.data?.applications ?? [],
        },
      };
    } catch (error) {
      if (error?.response?.status === 401) localStorage.removeItem("token");
      throw new Error(firstError(error, "Não foi possível carregar sua conta."));
    }
  },

  async emailVerify(verificationCode) {
    try {
      const response = await axios.post(`${authUrl}/email-verify`, { verification_code: verificationCode }, { headers: headers() });
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível verificar o e-mail."));
    }
  },

  async resendCodeEmailVerification() {
    try {
      const response = await axios.post(`${authUrl}/resend-code-email-verification`, {}, { headers: headers() });
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível reenviar o código."));
    }
  },

  async changePassword(current_password, new_password, confirm_password) {
    try {
      const response = await axios.post(`${authUrl}/change-password`, { current_password, new_password, password_confirmation: confirm_password }, { headers: headers() });
      return response.data;
    } catch (error) {
      throw new Error(firstError(error, "Não foi possível alterar a senha."));
    }
  },

  async passwordEmail(email) {
    try {
      return await axios.post(`${authUrl}/password-email`, { email });
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
      });
    } catch (error) {
      if (error?.response?.data?.errors) throw error.response.data.errors;
      throw new Error(firstError(error, "Não foi possível redefinir a senha."));
    }
  },
};

export default authService;
