import React from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';

const LogoutComponent = () => {
  
  const history = useNavigate();

  const handleLogout = async () => {
    try {
      await authService.logout 
        history('/login', { replace: true });
    } catch (error) {
      console.error('Erro durante o logout:', error);
    }
  };

  return (
    <li  onClick={handleLogout}><Link to="/logout" className="dropdown-item">Sair</Link></li>

  );
};

export default LogoutComponent;
