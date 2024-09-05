import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../../services/AuthService';
import LoadingComponent from '../../components/LoadingComponent'; // Importa o componente de carregamento

const LogoutPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const logout = async () => {
      try {
        await authService.logout(); // 
          history('/login', { replace: true });
      } catch (error) {
        console.error('Erro durante o logout:', error);
      } finally {
        setTimeout(() => {
          setLoading(false);
          navigate('/login');
        }, 2000); // Tempo de espera de 2 segundos (2000 milissegundos)
      }
    };

    localStorage.removeItem("token");
    window.location.href = "/login";
    logout();
  }, [navigate]);

  // Se loading for verdadeiro, renderiza o componente de carregamento
  if (loading) {
    return <LoadingComponent />; // Renderiza o componente de carregamento
  }

  return null; // Este componente não renderiza nada visível para o usuário
};

export default LogoutPage;
