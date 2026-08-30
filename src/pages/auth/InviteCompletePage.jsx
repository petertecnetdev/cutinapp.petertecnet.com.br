import React, { useState } from "react";
import { Form, Button, Spinner, Alert, Card } from "react-bootstrap";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import { apiBaseUrl } from "../../config";

export default function InviteCompletePage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    email: searchParams.get("email") || "",
    verification_code: searchParams.get("code") || "",
    password: "",
    password_confirmation: "",
  });
  const [status, setStatus] = useState({ loading: false, error: "" });

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (form.password !== form.password_confirmation) {
      setStatus({ loading: false, error: "As senhas não coincidem." });
      return;
    }

    setStatus({ loading: true, error: "" });
    try {
      await axios.post(`${apiBaseUrl}/auth/invite-complete`, {
        email: form.email,
        verification_code: form.verification_code,
        password: form.password,
        password_confirmation: form.password_confirmation,
      });
      window.location.replace("/login?invitation=completed");
    } catch (error) {
      setStatus({
        loading: false,
        error: error.response?.data?.message || Object.values(error.response?.data?.errors || {}).flat()[0] || "Não foi possível ativar sua conta.",
      });
    }
  };

  return (
    <main className="container py-5" style={{ maxWidth: 560 }}>
      <Card>
        <Card.Body className="p-4">
          <h1 className="h3 mb-2">Ative sua nova conta</h1>
          <p className="text-muted">Confirme os dados do convite e crie sua senha de acesso.</p>
          {status.error && <Alert variant="danger">{status.error}</Alert>}
          <Form onSubmit={submit}>
            <Form.Group className="mb-3">
              <Form.Label>E-mail</Form.Label>
              <Form.Control required type="email" name="email" value={form.email} onChange={change} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Código do convite</Form.Label>
              <Form.Control required name="verification_code" value={form.verification_code} onChange={change} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Nova senha</Form.Label>
              <Form.Control required minLength={8} type="password" name="password" value={form.password} onChange={change} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Confirme a senha</Form.Label>
              <Form.Control required minLength={8} type="password" name="password_confirmation" value={form.password_confirmation} onChange={change} />
            </Form.Group>
            <Button className="w-100" type="submit" disabled={status.loading}>
              {status.loading ? <Spinner size="sm" /> : "Ativar conta"}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </main>
  );
}
