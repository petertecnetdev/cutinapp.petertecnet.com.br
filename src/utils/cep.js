import axios from "axios";

const cep = {
  // Função para consultar o CEP e obter informações de endereço
  getAddressInfo: async (cep) => {
    try {
      const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
      const { uf, localidade: cidade, logradouro, complemento, bairro } = response.data;
      return { uf, cidade, logradouro, complemento, bairro };
    } catch (error) {
      console.error("Erro ao obter informações de endereço:", error);
      return null;
    }
  }
};

export default cep;
