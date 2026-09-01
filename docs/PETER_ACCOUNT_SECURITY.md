# Segurança

O frontend nunca coloca o JWT principal na URL. O redirecionamento aceita apenas HTTPS em `petertecnet.com.br` e subdomínios. Aplicativos sem acesso ficam desabilitados e a API revalida o vínculo no handoff e no exchange.
