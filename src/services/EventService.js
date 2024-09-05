import axios from "axios";
import { apiBaseUrl } from "../config";

const apiServiceUrl = "event";

const eventService = {
  getToken: () => localStorage.getItem("token"),

  store: async (formData) => {
    try {
      const response = await axios.post(
        `${apiBaseUrl}/${apiServiceUrl}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${eventService.getToken()}`,
          },
        }
      );
      return response.data.message;
    } catch (error) {
      if (error.response) {
        return error.response.data.error;
      } else {
        return "Erro ao se conectar ao servidor.";
      }
    }
  },

  list: async () => {
    try {
      const response = await axios.get(`${apiBaseUrl}/${apiServiceUrl}`, {
        headers: {
          Authorization: `Bearer ${eventService.getToken()}`,
        },
      });
      return response.data.events;
    } catch (error) {
      if (error.response) {
        return error.response.data.error;
      } else {
        return "Erro ao se conectar ao servidor.";
      }
    }
  },

  update: async (eventId, formData) => {
    try {
      const response = await axios.post(
        `${apiBaseUrl}/${apiServiceUrl}/${eventId}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${eventService.getToken()}`,
          },
        }
      );
      return response.data.message;
    } catch (error) {
      if (error.response) {
        return error.response.data.error;
      } else {
        return "Erro ao se conectar ao servidor.";
      }
    }
  },

  show: async (eventId) => {
    try {
      const response = await axios.get(
        `${apiBaseUrl}/${apiServiceUrl}/show/${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${eventService.getToken()}`,
          },
        }
      );
      return response.data.event;
    } catch (error) {
      if (error.response) {
        return error.response.data.error;
      } else {
        return "Erro ao se conectar ao servidor.";
      }
    }
  },

  view: async (slug) => {
    try {
      const response = await axios.get(
        `${apiBaseUrl}/${apiServiceUrl}/${slug}`,
        {
          headers: {
            Authorization: `Bearer ${eventService.getToken()}`,
          },
        }
      );
      return response; // Retorna o JSON com os detalhes da produção
    } catch (error) {
      if (error.response) {
        return error.response.data.error;
      } else {
        return "Erro ao se conectar ao servidor.";
      }
    }
  },

  delete: async (eventId) => {
    try {
      const response = await axios.delete(
        `${apiBaseUrl}/${apiServiceUrl}/${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${eventService.getToken()}`,
          },
        }
      );
      return response.data.message;
    } catch (error) {
      if (error.response) {
        return error.response.data.error;
      } else {
        return "Erro ao se conectar ao servidor.";
      }
    }
  },
  myEvents: async () => {
    try {
      const response = await axios.get(`${apiBaseUrl}/${apiServiceUrl}/myevents/list`, {
        headers: {
          Authorization: `Bearer ${eventService.getToken()}`,
        },
      });
      return response.data.events;
    } catch (error) {
      if (error.response) {
        return error.response.data.error;
      } else {
        return "Erro ao se conectar ao servidor.";
      }
    }
  },
};

export default eventService;
