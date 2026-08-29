import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import authService from "../../services/AuthService";
import LoadingComponent from "../../components/LoadingComponent";

export default function LogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    authService.logout().finally(() => {
      if (mounted) navigate("/login", { replace: true });
    });
    return () => { mounted = false; };
  }, [navigate]);

  return <LoadingComponent />;
}
