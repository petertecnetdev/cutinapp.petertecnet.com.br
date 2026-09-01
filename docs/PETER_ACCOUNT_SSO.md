# Conta Peter Tecnet

A Cutinapp inicializa o `PeterAccountGateway` antes do `AuthProvider`. Assim, um handoff de uso único é trocado por uma sessão própria da Cutinapp antes que as rotas protegidas avaliem o login.

O launcher mostra os produtos ativos da conta, respeita o vínculo de acesso retornado pela API e envia apenas o código temporário `peter_sso` ao trocar de subdomínio. JWTs não são enviados em query string.
