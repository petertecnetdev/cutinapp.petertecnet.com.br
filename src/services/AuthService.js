import axios from "axios";
import { apiBaseUrl } from "../config";

const authUrl = `${apiBaseUrl}/auth`;
const token = () => localStorage.getItem("token");
const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
const firstError = (error, fallback) => {
  const payload = error?.response?.data;
  if (payload?.message) return payload.message;
  if (payload?.error) return payload.error;
  if (payload?.errors) return Object.values(payload.errors).flat()[0] || fallback;
  return error?.message || fallback;
};

const authService = {
  getToken: token,
  setToken: (value) => localStorage.setItem("token", value),

  async login(email, password) {
    try {
      const response = await axios.post(`${authUrl}/login`, { email, password });
      if (!response.data?.access_token) throw new Error("A API não retornou um token de acesso.");
      authService.setToken(response.data.access_token);
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
      return response.data;
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
      const response = await axios.post(`${authUrl}/change-password`, { current_password, new_password, confirm_password }, { headers: headers() });
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

  async passwordReset(email, resetCode, newPassword, confirmPassword) {
    try {
      return await axios.post(`${authUrl}/password-reset`, {
        email,
        reset_password_code: resetCode,
        password: newPassword,
        password_confirmation: confirmPassword,
      });
    } catch (error) {
      if (error?.response?.data?.errors) throw error.response.data.errors;
      throw new Error(firstError(error, "Não foi possível redefinir a senha."));
    }
  },
};

export default authService;
