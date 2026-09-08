import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Container, Spinner } from "react-bootstrap";
import { Navigate, useLocation } from "react-router-dom";
import appApiClient from "../services/AppApiClient";

let cachedContext = null;
let pendingContext = null;

export const clearApplicationAdminContextCache = () => {
  cachedContext = null;
  pendingContext = null;
};

export const loadApplicationAdminContext = async ({ force = false } = {}) => {
  if (!force && cachedContext?.authorized) return cachedContext;
  if (!force && pendingContext) return pendingContext;

  pendingContext = appApiClient.get("/admin/context")
    .then((response) => {
      cachedContext = response.data?.data || null;
      return cachedContext;
    })
    .finally(() => { pendingContext = null; });

  return pendingContext;
};

export default function ApplicationAdminGate({ children, permission = null }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, context: null, forbidden: false, error: "" });

  useEffect(() => {
    let active = true;
    loadApplicationAdminContext()
      .then((context) => {
        if (!active) return;
        const allowed = Boolean(context?.authorized) && (!permission || context?.is_owner || (context?.permissions || []).includes(permission));
        setState({ loading: false, context, forbidden: !allowed, error: "" });
      })
      .catch((error) => {
        if (!active) return;
        const status = error?.response?.status;
        setState({
          loading: false,
          context: null,
          forbidden: status === 401 || status === 403,
          error: status === 401 || status === 403 ? "" : (error?.response?.data?.message || error?.message || "Não foi possível validar o acesso administrativo."),
        });
      });
    return () => { active = false; };
  }, [permission]);

  if (state.loading) {
    return <div className="cut-app-page"><Container className="cut-page-container py-5 text-center"><Spinner /><p className="mt-2">Validando autoridade administrativa...</p></Container></div>;
  }

  if (state.forbidden) return <Navigate to="/dashboard" state={{ from: `${location.pathname}${location.search}` }} replace />;

  if (state.error) {
    return <div className="cut-app-page"><Container className="cut-page-container py-5"><Alert variant="danger">{state.error}</Alert><Button onClick={() => window.location.reload()}>Tentar novamente</Button></Container></div>;
  }

  return children;
}

ApplicationAdminGate.propTypes = {
  children: PropTypes.node.isRequired,
  permission: PropTypes.string,
};
