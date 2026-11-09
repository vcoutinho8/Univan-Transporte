# Funcionalidades

Organizado pelos requisitos do [documento do MVP](documentacao-mvp.pdf). As rotinas citadas como
"no banco" existem em [`univan-sqlite.sql`](univan-sqlite.sql) (detalhes em [database.md](database.md)).

Legenda: ✅ pronto · 🟡 parcial · 🗄️ existe no banco, falta API/tela · ⬜ a fazer

## Resumo

| Código | Requisito | Situação |
|---|---|---|
| RF1 | Autenticação e controle de acesso | ⬜ |
| RF2 | Gestão de cadastros | 🟡 veículos prontos |
| RF3 | Gerenciamento de viagens e chamadas | 🗄️ rotinas no banco |
| RF4 | Cadastro e edição de rotas | ⬜ |
| RF5 | Painel administrativo e relatórios | 🟡 painel pronto |
| RF6 | Visualização geográfica | ⬜ |

## RF1 · Autenticação e controle de acesso

| Funcionalidade | Situação | Observação |
|---|---|---|
| Login de usuários | ⬜ | O banco **não tem tabela de usuários**; precisa ser criada |
| Perfis administrador e motorista | ⬜ | Hoje a barra superior mostra "Administrador" fixo |
| Restrição de acesso por perfil | ⬜ | Motorista deve ver só as próprias viagens e chamadas |

## RF2 · Gestão de cadastros

| Funcionalidade | Situação | Observação |
|---|---|---|
| Veículos: listar, buscar, cadastrar, editar, inativar, reativar | ✅ | API + tela |
| Empresas: listar | ✅ | Só API, usada no formulário de veículos |
| Passageiros: cadastrar, editar, consultar, desativar | ⬜ | Model pronto. Área definida automaticamente pelo trigger |
| Motoristas | ⬜ | Model pronto. CPF e CNH únicos, veículo padrão |
| Associar passageiro a rota e ponto de embarque | ⬜ | Hoje a rota é deduzida: área do motorista + instituição + turno |
| Instituições e endereços | ⬜ | Necessários para o cadastro de passageiros |

## RF3 · Gerenciamento de viagens e chamadas

| Funcionalidade | Situação | Observação |
|---|---|---|
| Criar viagens por data e turno | 🗄️ | `gerar_dia(data)` cria viagens e chamadas `pendente` |
| Exibir passageiros esperados em cada viagem | 🗄️ | Tabela `chamada` |
| Registrar presença, ausência e ocorrências | ⬜ | Presença: `status = presente` + `horario_embarque` |
| Passageiro avisa "não vou" | 🗄️ | `avisar_nao_vou(...)`, até 1h antes do horário previsto |
| Identificar passageiros ainda sem registro | 🗄️ | Chamadas com `status = pendente` |
| Iniciar viagem | ⬜ | `status = em_andamento`, grava `horario_saida` |
| Encerrar viagem e guardar histórico | 🗄️ | `concluir_viagem(id)`; pendentes viram `ausente` |
| Dias sem aula (feriados) | 🗄️ | `gerar_dia` já respeita a tabela `dia_sem_aula` |

## RF4 · Cadastro e edição de rotas

| Funcionalidade | Situação | Observação |
|---|---|---|
| Cadastrar rota (motorista + instituição + turno) | ⬜ | Uma rota por combinação (restrição do banco) |
| Dias da semana da rota | ⬜ | Tabela `rota_dia` |
| Pontos de embarque com endereço e localização | ⬜ | `endereco` já tem latitude/longitude |
| Sequência dos pontos e horários previstos | ⬜ | Hoje há `horario_embarque` por passageiro; ordem manual exige mudança no banco |
| Associar motorista e veículo às viagens | 🟡 | `viagem` já guarda motorista e veículo do dia; falta tela de substituição |

## RF5 · Painel administrativo e relatórios

| Funcionalidade | Situação | Observação |
|---|---|---|
| Painel com indicadores | ✅ | Passageiros, motoristas, veículos e rotas ativos |
| Viagens do dia por situação | ✅ | Agendadas, em andamento, concluídas, canceladas |
| Alerta de passageiros sem área | ✅ | Endereço fora de todas as áreas |
| Histórico de chamadas | ⬜ | |
| Relatório de frequência por passageiro | 🗄️ | View `vw_frequencia` |
| Relatórios por período, rota e turno | ⬜ | Consultas sobre `viagem` e `chamada` |

## RF6 · Visualização geográfica

| Funcionalidade | Situação | Observação |
|---|---|---|
| Pontos de embarque em mapa interativo | ⬜ | Leaflet + OpenStreetMap |
| Consulta de endereços e sequência das paradas | ⬜ | Depende do RF4 |

## Requisitos não funcionais

| Código | Requisito | Como o projeto atende hoje |
|---|---|---|
| RNF1 | Usabilidade | Telas em português, mensagens de erro claras, layout de painel administrativo |
| RNF2 | Responsividade | Menu vira gaveta no celular; tabelas com rolagem horizontal; grades adaptáveis |
| RNF3 | Segurança | ⬜ Depende do RF1 (senhas com hash, permissões por perfil) |
| RNF4 | Integridade dos dados | Restrições do banco + validação nos schemas; nada é apagado |
| RNF5 | Desempenho | Consultas com `joinedload`; contagens do painel feitas no banco |
| RNF6 | Manutenibilidade | Módulos por assunto + camadas MVC ([architecture.md](architecture.md)); testes automáticos |
| RNF7 | Disponibilidade | ⬜ Hospedagem a definir |
| RNF8 | Privacidade (LGPD) | ⬜ Depende do RF1 para restringir acesso a dados pessoais |

## Fora do escopo do MVP

O documento do MVP deixa para versões futuras: rastreamento GPS em tempo real, otimização
automática de rotas, notificações automáticas, pagamentos e gestão financeira completa.

O banco já tem a parte financeira (`titulo_receber`, `titulo_pagar`, `gerar_titulos_mes`,
`vw_inadimplentes`, `vw_resultado_mes`) e os models existem no módulo `financeiro`, mas não haverá
telas para isso no MVP.

## Evoluções que exigem mudança no banco

- Tabela de usuários e perfis (RF1).
- Ordem de parada manual por passageiro (RF4).
- Endereço de embarque diferente na volta.
- Área com mais de um motorista (tabela `motorista_area`).

Essas mudanças devem ser discutidas antes de implementar, e o dump em `docs/` atualizado junto.
