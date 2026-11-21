# Funcionalidades

Organizado pelos requisitos do [documento do MVP](documentacao-mvp.pdf). As rotinas citadas como
"no banco" existem em [`univan-sqlite.sql`](univan-sqlite.sql) (detalhes em [database.md](database.md)).

Legenda: ✅ pronto · 🟡 parcial · 🗄️ existe no banco, falta API/tela · ⬜ a fazer

## Resumo

| Código | Requisito | Situação |
|---|---|---|
| RF1 | Autenticação e controle de acesso | ⬜ |
| RF2 | Gestão de cadastros | 🟡 veículos e motoristas prontos |
| RF3 | Gerenciamento de viagens e chamadas | ✅ viagens e chamada passageiro a passageiro |
| RF4 | Cadastro e edição de rotas | ⬜ |
| RF5 | Painel administrativo e relatórios | 🟡 painel e relatório de passageiros ativos |
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
| Motoristas: listar, buscar, cadastrar, editar, inativar, reativar | ✅ | API + tela |
| Associar passageiro a rota e ponto de embarque | ⬜ | Hoje a rota é deduzida: área do motorista + instituição + turno |
| Instituições e endereços | ⬜ | Necessários para o cadastro de passageiros |

## RF3 · Gerenciamento de viagens e chamadas

| Funcionalidade | Situação | Observação |
|---|---|---|
| Criar viagens por data e turno | ✅ | Tela Viagens: "Gerar viagens do dia" roda `gerar_dia` (avisa feriado e motorista sem veículo) |
| Viagens por turno, ida e volta | ✅ | Botões de turno; ida e volta separadas; um cartão por motorista (jornada), paginado |
| Jornada do motorista | ✅ | Todas as rotas do motorista no turno e sentido saem juntas com um botão só (`/viagens/jornada/iniciar`); fila única de passageiros na ordem de embarque; concluída ao registrar o último |
| Desembarque e fases da jornada | ✅ | Embarque → A caminho → Concluída. Na ida, "Todos desceram aqui" por faculdade (ou um a um); na volta, "Deixei em casa". Coluna nova `chamada.horario_desembarque` (adicionada sozinha em bancos antigos ao subir a API) |
| Tela de viagens no celular | ✅ | Cartões empilhados, botões grandes, painel do motorista em tela cheia; link direto `?data=AAAA-MM-DD&turno=noite` |
| Semana e dias indisponíveis | ✅ | Faixa da semana com viagens, feriados e dias sem rota (`/viagens/calendario`); gerar num feriado ou fim de semana abre o modal "dia indisponível". Turnos: manhã e noite (a tarde só aparece se houver viagem) |
| Limite para gerar viagens | ✅ | Só até o domingo da semana atual (dias passados continuam liberados); a tela bloqueia o botão e mostra quando a semana libera |
| Aviso de filtro sem resultado | ✅ | Componente único (`NoResults.tsx`) com os filtros ativos e "Limpar filtros" em passageiros, motoristas, veículos, viagens e rotas do mapa |
| Viagem = jornada do motorista | ✅ | Contagens da tela (semana, dia, turnos, situações) contam uma viagem por motorista, turno e sentido; destinos ficam ocultos no cartão até "Ver destinos" |
| Avisos em modal | ✅ | Viagens e relatórios dão retorno só por modal (`NoticeModal.tsx`); nada de faixas no topo |
| Aviso prévio ("não vou") | 🟡 | Quem tem chamada `nao_vai` não entra na fila do embarque (só na contagem). Falta a tela/API para o passageiro avisar (rotina `avisar_nao_vou` já existe no banco) |
| Exibir passageiros esperados em cada viagem | ✅ | Gaveta de passageiros da viagem, na ordem de embarque |
| Registrar presença, ausência e ocorrências | ✅ | Viagem em andamento: o próximo da fila fica em destaque (Embarcou / Não embarcou / Desfazer); o último registro conclui a viagem |
| Passageiro avisa "não vou" | 🗄️ | `avisar_nao_vou(...)`, até 1h antes do horário previsto |
| Identificar passageiros ainda sem registro | 🗄️ | Chamadas com `status = pendente` |
| Iniciar viagem | ✅ | `status = em_andamento`, grava `horario_saida`; não inicia viagem de dia futuro |
| Encerrar viagem e guardar histórico | ✅ | `concluir_viagem(id)`; pendentes viram `ausente`. Também cancela viagem agendada |
| Calendário (dias sem aula: feriados, recessos, férias) | ✅ | Tela Calendário: clique num dia ou arraste para marcar um período, para todas ou várias instituições; `gerar_dia` respeita. Remover apaga de verdade (não há coluna de status nessa tabela) |

## RF4 · Cadastro e edição de rotas

| Funcionalidade | Situação | Observação |
|---|---|---|
| Cadastrar rota (motorista + instituição + turno) | ⬜ | Uma rota por combinação (restrição do banco) |
| Dias da semana da rota | ⬜ | Tabela `rota_dia` |
| Pontos de embarque com endereço e localização | ⬜ | `endereco` já tem latitude/longitude |
| Sequência dos pontos e horários previstos | ⬜ | Hoje há `horario_embarque` por passageiro; ordem manual exige mudança no banco |
| Associar motorista e veículo às viagens | ✅ | Troca de motorista/veículo só na viagem, com checagem de lotação |

## RF5 · Painel administrativo e relatórios

| Funcionalidade | Situação | Observação |
|---|---|---|
| Painel com indicadores | ✅ | Passageiros, motoristas, veículos e rotas ativos |
| Viagens do dia por situação | ✅ | Agendadas, em andamento, concluídas, canceladas |
| Alerta de passageiros sem área | ✅ | Endereço fora de todas as áreas |
| Histórico de chamadas | ⬜ | |
| Relatório de frequência por passageiro | 🗄️ | View `vw_frequencia` |
| Catálogo de relatórios | ✅ | Lista central agrupada por módulo (Passageiros → Passageiros ativos...), com busca e favoritos (o favorito sai do módulo e fica só em Favoritos) (guardados no navegador até existir login); planejados aparecem como "Em breve" |
| Relatório de passageiros ativos | ✅ | Período obrigatório (presenças, faltas e avisos no período); abre vazio com os filtros; sem resultado mostra aviso; PDF A4 em pé (logo, período, indicadores, tabela com bairro e frequência), na tela e para baixar, ou CSV |
| Relatório de dias sem aula | ✅ | Período e instituição; dias seguidos agrupados em períodos (período, motivo, quem fica sem aula); PDF e CSV |
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
- ~~Desembarque por passageiro~~ (feito: `chamada.horario_desembarque`).
- Área com mais de um motorista (tabela `motorista_area`).

Essas mudanças devem ser discutidas antes de implementar, e o dump em `docs/` atualizado junto.

Colocar o endereço do motorista como point de referência nas rotas para auxiliar na imagem