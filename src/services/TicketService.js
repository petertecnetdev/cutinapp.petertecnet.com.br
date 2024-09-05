import axios from "axios";
import { apiBaseUrl } from "../config";

const apiServiceUrl = "ticket";

const ticketService = {
  getToken: () => localStorage.getItem("token"),

  store: async (formData) => {
    try {
      const response = await axios.post(
        `${apiBaseUrl}/${apiServiceUrl}`,
        formData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ticketService.getToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      } else {
        return { message: "Erro ao se conectar ao servidor." };
      }
    }
  },

  listByEvent: async (eventId) => {
    try {
      const response = await axios.get(
        `${apiBaseUrl}/${apiServiceUrl}/event/${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${ticketService.getToken()}`,
          },
        }
      );
      console.log('Resposta da API:', response.data); // Adicionei este log para depuração
      return response.data;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      } else {
        return { message: "Erro ao se conectar ao servidor." };
      }
    }
  },

  delete: async (id) => {
    try {
      const response = await axios.delete(
        `${apiBaseUrl}/${apiServiceUrl}/${id}`,
        {
          headers: {
            Authorization: `Bearer ${ticketService.getToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      } else {
        return { message: "Erro ao se conectar ao servidor." };
      }
    }
  },

  update: async (id, updateData) => {
    try {
      const response = await axios.put(
        `${apiBaseUrl}/${apiServiceUrl}/${id}`,
        updateData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ticketService.getToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      } else {
        return { message: "Erro ao se conectar ao servidor." };
      }
    }
  },

  show: async (id) => {
    try {
      const response = await axios.get(
        `${apiBaseUrl}/${apiServiceUrl}/show/${id}`,
        {
          headers: {
            Authorization: `Bearer ${ticketService.getToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      } else {
        return { message: "Erro ao se conectar ao servidor." };
      }
    }
  },
};

export default ticketService;
