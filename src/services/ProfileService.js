import axios from "axios";
import { apiBaseUrl } from "../config";

const apiServiceUrl = "profile";

const profileService = {
  getToken: () => localStorage.getItem("token"),

  list: async () => {
    try {
      const token = profileService.getToken();

      if (!token) {
        throw new Error("Usuário não autenticado.");
      }

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const response = await axios.get(`${apiBaseUrl}/${apiServiceUrl}`, {
        headers,
      });

      return response.data.profiles;
    } catch (error) {
      console.error(error);
      throw new Error("Erro ao obter a lista de usuários.");
    }
  },
  create: async (data) => {
    try {
      const token = profileService.getToken();

      if (!token) {
        throw new Error("Usuário não autenticado.");
      }

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const response = await axios.post(
        `${apiBaseUrl}/${apiServiceUrl}`,
        data,
        {
          headers,
        }
      );

      return response;
    } catch (error) {
      console.error(error);
      throw new Error("Erro ao criar o perfil.");
    }
  },

  update: async (id, data) => {
    try {
      const token = profileService.getToken();

      if (!token) {
        throw new Error("Usuário não autenticado.");
      }

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const response = await axios.put(
        `${apiBaseUrl}/${apiServiceUrl}/${id}`,
        data,
        { headers }
      );

      return response;
    } catch (error) {
      console.error(error);
      throw new Error("Erro ao atualizar o perfil.");
    }
  },

  show: async (id) => {
    try {
      const token = profileService.getToken();

      if (!token) {
        throw new Error("Usuário não autenticado.");
      }

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const response = await axios.get(`${apiBaseUrl}/${apiServiceUrl}/${id}`, {
        headers,
      });

      return response.data.profile;
    } catch (error) {
      console.error(error);
      throw new Error("Erro ao obter o perfil.");
    }
  },

  destroy: async (id) => {
    try {
      const token = profileService.getToken();

      if (!token) {
        throw new Error("Usuário não autenticado.");
      }

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      await axios.delete(`${apiBaseUrl}/${apiServiceUrl}/${id}`, { headers });

      return "Perfil excluído com sucesso.";
    } catch (error) {
      console.error(error);
      throw new Error("Erro ao excluir o perfil.");
    }
  },



};

export default profileService;
