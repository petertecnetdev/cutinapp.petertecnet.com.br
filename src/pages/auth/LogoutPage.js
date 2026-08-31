import React, { useContext, useEffect, useRef, useState } from "react";
import { Alert, Button, Container } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";

export default function LogoutPage() {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const startedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    let active = true;

    (async () => {
      try {
        await logout();
        if (active) navigate("/login", { replace: true });
      } catch (err) {
        if (active) setError(err?.message || "Não foi possível concluir a saída.");
      }
    })();

    return () => {
      active = false;
    };
  }, [logout, navigate]);

  if (!error) {
    return <ProcessingIndicatorComponent label="Encerrando sua sessão" />;
  }

  return (
    <div className="cut-app-page">
      <Container className="cut-page-container py-5">
        <Alert variant="danger">{error}</Alert>
        <Button onClick={() => navigate("/login", { replace: true })}>Voltar ao login</Button>
      </Container>
    </div>
  );
}
