import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, ListGroup, Modal, Spinner } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";
import userService from "../../services/UserService";

const apiErrorMessage = (err, fallback) => err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;
const displayName = (user) => {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || user?.user_name || user?.email || `Usuário #${user?.id}`;
};

export default function ProductionOwnershipTransferModal({ production, onHide, onTransferred }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searching, setSearching] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!production) return;
    setQuery("");
    setResults([]);
    setSelectedUser(null);
    setSearching(false);
    setTransferring(false);
    setError("");
    setSearched(false);
  }, [production]);

  const availableResults = useMemo(
    () => results.filter((user) => Number(user.id) !== Number(production?.user_id)),
    [results, production?.user_id]
  );

  const searchUsers = async (event) => {
    event?.preventDefault();
    const term = query.trim();
    if (term.length < 2 || searching || transferring) return;

    setSearching(true);
    setError("");
    setSelectedUser(null);
    try {
      const response = await userService.search(term, 12);
      const users = response?.results?.data;
      setResults(Array.isArray(users) ? users : []);
      setSearched(true);
    } catch (err) {
      setResults([]);
      setSearched(true);
      setError(apiErrorMessage(err, "Não foi possível buscar usuários."));
    } finally {
      setSearching(false);
    }
  };

  const transfer = async () => {
    if (!production?.id || !selectedUser?.id || transferring) return;
    setTransferring(true);
    setError("");
    try {
      const response = await cutinappService.transferProduction(production.id, selectedUser.id);
      onTransferred?.({ production, targetUser: selectedUser, response });
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível transferir a produção."));
      setTransferring(false);
    }
  };

  const close = () => {
    if (!transferring) onHide?.();
  };

  return (
    <Modal show={Boolean(production)} onHide={close} centered size="lg" backdrop={transferring ? "static" : true} keyboard={!transferring}>
      <Modal.Header closeButton={!transferring}>
        <Modal.Title>Transferir produção</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-4">
          <span className="text-muted d-block mb-1">Produção</span>
          <strong className="fs-5">{production?.name || "Produção"}</strong>
        </div>

        <Alert variant="warning">
          A transferência muda quem pode administrar esta produção. Depois da confirmação, ela sairá das suas produções e o novo responsável passará a gerenciar seus dados e eventos.
        </Alert>

        {error && <Alert variant="danger">{error}</Alert>}

        <Form onSubmit={searchUsers} className="mb-3">
          <Form.Label>Encontre o novo responsável</Form.Label>
          <div className="d-flex gap-2">
            <Form.Control
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, e-mail ou nome de usuário"
              autoComplete="off"
              disabled={transferring}
              aria-label="Buscar usuário para transferência"
            />
            <Button type="submit" variant="outline-primary" disabled={query.trim().length < 2 || searching || transferring}>
              {searching ? <Spinner animation="border" size="sm" /> : <><i className="fa-solid fa-magnifying-glass me-2" />Buscar</>}
            </Button>
          </div>
          <Form.Text>Digite pelo menos 2 caracteres. Confira o e-mail antes de selecionar.</Form.Text>
        </Form>

        {searched && !searching && availableResults.length === 0 && (
          <div className="border rounded p-3 text-muted mb-3">Nenhum outro usuário encontrado para esta busca.</div>
        )}

        {availableResults.length > 0 && (
          <ListGroup className="mb-3">
            {availableResults.map((user) => {
              const active = Number(selectedUser?.id) === Number(user.id);
              return (
                <ListGroup.Item
                  key={user.id}
                  action
                  active={active}
                  onClick={() => !transferring && setSelectedUser(user)}
                  className="d-flex align-items-center justify-content-between gap-3"
                >
                  <div className="min-w-0">
                    <strong className="d-block text-truncate">{displayName(user)}</strong>
                    <small className={active ? "text-white-50" : "text-muted"}>
                      {[user.user_name ? `@${user.user_name}` : null, user.email].filter(Boolean).join(" · ")}
                    </small>
                  </div>
                  {active && <i className="fa-solid fa-circle-check" aria-hidden="true" />}
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}

        {selectedUser && (
          <Alert variant="info" className="mb-0">
            <strong>Confirme o novo responsável:</strong> {displayName(selectedUser)}{selectedUser.email ? ` (${selectedUser.email})` : ""}. Esta ação entrega o controle da produção para essa conta.
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={close} disabled={transferring}>Cancelar</Button>
        <Button variant="primary" onClick={transfer} disabled={!selectedUser || transferring}>
          {transferring ? <><Spinner animation="border" size="sm" className="me-2" />Transferindo...</> : <><i className="fa-solid fa-arrow-right-arrow-left me-2" />Transferir produção</>}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
