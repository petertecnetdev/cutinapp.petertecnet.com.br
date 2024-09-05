import axios from "axios";

const companyInfo = {
  // Função para consultar o CNPJ e obter informações da empresa
  getCompanyInfo: async (cnpj) => {
    try {
      // Formata o CNPJ removendo caracteres não numéricos
      cnpj = cnpj.replace(/\D/g, '');
      console.log(cnpj);
      // Verifica se o CNPJ tem o tamanho correto
      if (cnpj.length !== 14) {
        throw new Error('CNPJ inválido');
      }

      // Consulta a API da Receita Federal
      const response = await axios.get(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`);
      
      // Retorna a resposta completa da API
      return response.data;
    } catch (error) {
      console.error("Erro ao obter informações da empresa:", error);
      return null;
    }
  }
};

export default companyInfo;
