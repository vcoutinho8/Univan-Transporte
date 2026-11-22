# Funcionalidades

Organizado pelos requisitos do [documento do MVP](documentacao-mvp.pdf). As rotinas citadas como
"no banco" existem em [`univan-sqlite.sql`](univan-sqlite.sql) (detalhes em [database.md](database.md)).

Legenda: ✅ pronto · 🟡 parcial · 🗄️ existe no banco, falta API/tela · ⬜ a fazer

## Resumo

| Código | Requisito | Situação |
|---|---|---|
| RF1 | Autenticação e controle de acesso | ✅ login por usuário e senha, perfis admin, auxiliar e motorista |
| RF2 | Gestão de cadastros | 🟡 veículos e motoristas prontos |
| RF3 | Gerenciamento de viagens e chamadas | ✅ viagens e chamada passageiro a passageiro |
| RF4 | Cadastro e edição de rotas | ⬜ |
| RF5 | Painel administrativo e relatórios | 🟡 painel e relatório de passageiros ativos |
| RF6 | Visualização geográfica | ⬜ |

## RF1 · Autenticação e controle de acesso

| Funcionalidade | Situação | Observação |
|---|---|---|
| Login de usuários | ✅ | Tabela `usuario`; entra com **usuário e senha** (ex.: `admin` / `123456` nos dados de teste). Senha com hash scrypt e sal; token assinado (8 h, `SESSION_MINUTES`); 5 senhas erradas bloqueiam o usuário por 5 min; mesma mensagem para usuário inexistente e senha errada |
| Perfis | ✅ | **admin** (tudo, menos a "Minha rota"), **auxiliar** (apoio: cadastra e consulta, não edita nem inativa; viagens só visualiza; mapa, calendário, chamadas e relatórios completos) e **motorista** (Minha rota, as próprias viagens e chamadas) |
| Restrição de acesso por perfil | ✅ | A API confere em toda rota (401 sem login, 403 sem permissão) e o motorista só enxerga/opera o que é dele; a tela esconde menus e botões que o perfil não usa e mostra "Sem acesso" se abrir o endereço direto |
| Usuários de teste | ✅ | `admin`, `auxiliar`, `motorista` (Carlos) e `joao` (João Pedro), todos com a senha `123456`: **troque em produção** e defina `SECRET_KEY` |
| Tela de gestão de usuários | ⬜ | Criar, inativar e trocar senha pela tela (hoje só pelo banco) |
| Cadastro de universidades e de modelos de veículo | ⬜ | Só o admin poderá (regra já definida) |

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
| Telas no notebook (1366×768) | ✅ | Listas com tabela rolando por dentro e paginação fixa; calendário e mapa cabem na tela sem rolar a página |
| Semana e dias indisponíveis | ✅ | Faixa da semana com viagens, feriados e dias sem rota (`/viagens/calendario`); gerar num feriado ou fim de semana abre o modal "dia indisponível". Turnos: manhã e noite (a tarde só aparece se houver viagem) |
| Limite para gerar viagens | ✅ | Só até o domingo da semana atual (dias passados continuam liberados); a tela bloqueia o botão e mostra quando a semana libera |
| Aviso de filtro sem resultado | ✅ | Componente único (`NoResults.tsx`) com os filtros ativos e "Limpar filtros" em passageiros, motoristas, veículos, viagens e rotas do mapa |
| Viagem = jornada do motorista | ✅ | Contagens da tela (semana, dia, turnos, situações) contam uma viagem por motorista, turno e sentido; destinos ficam ocultos no cartão até "Ver destinos" |
| Avisos em modal | ✅ | Viagens e relatórios dão retorno só por modal (`NoticeModal.tsx`); nada de faixas no topo |
| Aviso prévio ("não vou") | ✅ | Tela Chamadas: o administrador registra que o passageiro não vai na ida, na volta ou nas duas (`/chamadas/aviso`); sai da fila do motorista. Aviso com menos de 1 hora é aceito e marcado como "última hora". "Vai sim" desfaz enquanto a viagem não terminou |
| Ausência programada por período | ⬜ | "Vou viajar de 10 a 14/12": exige tabela nova, aplicada quando as viagens dos dias forem geradas |
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
| Ponto de parada da faculdade | ✅ | `instituicao.parada_latitude/longitude`: o administrador arrasta o pino até a rua (Mapa e rotas → Ajustar paradas); o trajeto termina ali. Até 1 km do endereço |
| Sequência dos pontos e horários previstos | ⬜ | Hoje há `horario_embarque` por passageiro; ordem manual exige mudança no banco |
| Associar motorista e veículo às viagens | ✅ | Troca de motorista/veículo só na viagem, com checagem de lotação |

## RF5 · Painel administrativo e relatórios

| Funcionalidade | Situação | Observação |
|---|---|---|
| Painel com indicadores | ✅ | Saudação com o nome de quem entrou; passageiros, motoristas, veículos e rotas ativos |
| Operação de hoje | ✅ | Uma linha por motorista e sentido: rodando, próximas, atrasadas (agendada que passou da hora) e concluídas |
| Chamadas de hoje e atalhos | ✅ | Confirmados e quem não vai; atalhos para cadastro, rotas, calendário e relatórios |
| Gráfico dos últimos 7 dias | ✅ | Passageiros transportados por dia e % de presença, com detalhe ao passar o mouse (`GET /painel/semana`) |
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
| Pontos de embarque em mapa interativo | ✅ | Leaflet + OpenStreetMap |
| Melhor ordem das paradas | ✅ | Em Mapa e rotas: sai da casa do motorista, busca todos do turno e termina nas paradas das faculdades. Tempos reais pelas ruas (OSRM `/table`) e heurísticas do caixeiro viajante (vizinho mais próximo + 2-opt + or-opt). Mostra atual x sugerida (km, tempo, chegada), permite ajustar à mão e aplicar (grava o horário de embarque de cada passageiro; a fila das viagens segue essa ordem). `OSRM_URL` configura o servidor |
| Paradas extras da faculdade | ✅ | Ex.: UVV: Biopráticas e fundos. Criadas e arrastadas no mapa; o passageiro escolhe a dele no cadastro (sem escolha = a principal) |
| Endereço do motorista | ✅ | Casa/garagem no cadastro do motorista: início da ida e fim da volta (no mapa, na ordem e na Minha rota) |
| Minha rota (motorista) | ✅ | Mapa com o trajeto até as paradas que faltam, próxima parada com **Navegar** (Google Maps), ligar e WhatsApp, posição pelo GPS (opcional) e embarque a um toque |
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