# Peter Tecnet — Agent Protocol v2

Este repositório é uma plataforma/contexto de trabalho. O agente é a conta externa do ChatGPT identificada por `NPxx`.

Antes de alterar qualquer código:
1. abra `petertecnetdev/petertecnet.com.br`;
2. leia `.agents/CONTROL_PROTOCOL.md`;
3. confirme seu `agent_id` em `.agents/AGENTS_REGISTRY.json`;
4. leia `.agents/CURRENT_STATE.md`, `.agents/DECISIONS.md` e seu state;
5. leia `.agents/AGENT_CHAT.md` para @todos ou @<AGENT_ID>;
6. verifique `.agents/tasks/` e assuma trabalho apenas com lock válido;
7. registre START/RECEIVED e atualize heartbeat.

Ao terminar:
- registre evidências (commit/PR/test/build quando aplicável);
- atualize checkpoint e next_action;
- publique DONE/REVIEW/BLOCKED no Agent Chat;
- atualize seu state;
- releia o chat antes de encerrar.

Owner/Pedro tem prioridade máxima. Não duplique tarefa com lock de outro agente. Não ultrapasse o limite de delegações. Não grave segredos no repositório. Não crie ciclos artificiais para contornar limites de tarefas do ChatGPT.

Bootstrap: `petertecnetdev/petertecnet.com.br/.agents/TASK_BOOTSTRAP.md`.

## Overlay/UI safety
- Nenhum novo elemento `fixed`/`sticky` deve definir z-index alto ou offset inferior arbitrário.
- Use `src/styles/overlay-layout-system.css` e `src/utils/overlayLayoutManager.js` como fonte única de verdade.
- Antes de concluir alterações de UI mobile, rode `npm run lint:overlays` e os testes; colisões de overlays são regressões bloqueantes.
