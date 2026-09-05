import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Col, Form, Row } from "react-bootstrap";
import appApiClient from "../../services/AppApiClient";
import {
  FALLBACK_ORGANIZATION_TAXONOMY,
  canonicalOrganizationType,
  normalizeOrganizationRoles,
  normalizeOrganizationTaxonomy,
} from "../../domain/organizations/organizationTaxonomy";

export default function OrganizationTaxonomyFields({ value, onChange }) {
  const [taxonomy, setTaxonomy] = useState(FALLBACK_ORGANIZATION_TAXONOMY);

  useEffect(() => {
    let active = true;
    appApiClient.get("/organizations/taxonomy")
      .then(({ data }) => active && setTaxonomy(normalizeOrganizationTaxonomy(data)))
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const type = canonicalOrganizationType(value?.type, taxonomy);
  const roles = useMemo(() => normalizeOrganizationRoles(value?.roles, type, taxonomy), [value?.roles, type, taxonomy]);

  useEffect(() => {
    const currentType = value?.type;
    const currentRoles = Array.isArray(value?.roles) ? value.roles : [];
    if (currentType !== type || currentRoles.join("|") !== roles.join("|")) {
      onChange((current) => ({ ...current, type, roles }));
    }
  }, [onChange, roles, type, value?.roles, value?.type]);

  const changeType = (event) => {
    const nextType = canonicalOrganizationType(event.target.value, taxonomy);
    onChange((current) => ({
      ...current,
      type: nextType,
      roles: [...(taxonomy.defaults?.[nextType] || ["producer"])],
    }));
  };

  const toggleRole = (role) => {
    onChange((current) => {
      const currentRoles = normalizeOrganizationRoles(current?.roles, current?.type, taxonomy);
      const selected = currentRoles.includes(role);
      if (selected && currentRoles.length === 1) return current;
      return {
        ...current,
        roles: selected ? currentRoles.filter((item) => item !== role) : [...currentRoles, role],
      };
    });
  };

  return <>
    <Col md={6}>
      <Form.Group>
        <Form.Label>Tipo de organização</Form.Label>
        <Form.Select name="type" value={type} onChange={changeType}>
          {taxonomy.types.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </Form.Select>
        <Form.Text>Define o que este estabelecimento é dentro do ecossistema.</Form.Text>
      </Form.Group>
    </Col>
    <Col xs={12}>
      <Form.Group>
        <Form.Label>Atuações</Form.Label>
        <Row className="g-2">
          {taxonomy.roles.map((entry) => {
            const checked = roles.includes(entry.value);
            return <Col sm={6} lg={3} key={entry.value}>
              <Form.Check
                type="checkbox"
                id={`organization-role-${entry.value}`}
                label={entry.label}
                checked={checked}
                disabled={checked && roles.length === 1}
                onChange={() => toggleRole(entry.value)}
              />
            </Col>;
          })}
        </Row>
        <Form.Text>Uma casa pode também produzir, organizar ou promover eventos. Mantenha pelo menos uma atuação selecionada.</Form.Text>
      </Form.Group>
    </Col>
  </>;
}

OrganizationTaxonomyFields.propTypes = {
  value: PropTypes.shape({
    type: PropTypes.string,
    roles: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};
