# Critérios de aceite

- Um usuário autenticado visualiza no launcher os produtos ativos da Conta Peter Tecnet.
- Produtos sem vínculo ativo aparecem bloqueados e não podem gerar handoff.
- Ao abrir outro produto, apenas `peter_sso` temporário é enviado pela URL.
- O handoff é trocado por um JWT próprio da Cutinapp antes do `AuthProvider` e das rotas protegidas.
- O código de passagem é removido da URL após a troca.
