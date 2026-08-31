import React from "react";
import AuthPageShell from "../../components/auth/AuthPageShell";
import LoginFormComponent from "../../components/auth/LoginFormComponent";

export default function LoginPage() {
  return (
    <AuthPageShell
      title="Bem-vindo de volta"
      subtitle="Entre para acessar seus ingressos, eventos e ferramentas de produção."
    >
      <LoginFormComponent />
    </AuthPageShell>
  );
}
