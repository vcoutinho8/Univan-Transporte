"""Regras de negócio das viagens: gerar o dia, iniciar, concluir, cancelar e substituir."""

from datetime import date, datetime, timedelta

from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.modules.veiculo.veiculo_repositorio import RepositorioVeiculo
from app.modules.viagem.viagem_model import Viagem
from app.modules.viagem.viagem_repositorio import RepositorioViagem
from app.modules.viagem.viagem_schema import (
    ContagemPassageiros,
    DiaDoCalendario,
    GeracaoResposta,
    SubstituicaoPedido,
)
from app.shared.enums import Sentido, StatusCadastro, StatusChamada, StatusViagem, Turno

ROTULO_STATUS = {
    StatusViagem.AGENDADA: "agendada",
    StatusViagem.EM_ANDAMENTO: "em andamento",
    StatusViagem.CONCLUIDA: "concluída",
    StatusViagem.CANCELADA: "cancelada",
}


def agora() -> datetime:
    """Hora local, sem segundos fracionados (o banco guarda 'AAAA-MM-DD HH:MM:SS')."""
    return datetime.now().replace(microsecond=0)


def fim_da_semana(dia: date) -> date:
    """Domingo da semana do dia (a semana vai de segunda a domingo)."""
    return dia + timedelta(days=7 - dia.isoweekday())


class ServicoViagem:
    def __init__(
        self,
        repositorio: RepositorioViagem,
        repositorio_motorista: RepositorioMotorista,
        repositorio_veiculo: RepositorioVeiculo,
    ):
        self.repositorio = repositorio
        self.repositorio_motorista = repositorio_motorista
        self.repositorio_veiculo = repositorio_veiculo

    # ---------------------------------------------------------------- consulta

    def listar(
        self,
        data: date | None = None,
        turno: Turno | None = None,
        status: StatusViagem | None = None,
        fk_motorista: int | None = None,
        fk_rota: int | None = None,
    ) -> list[Viagem]:
        viagens = self.repositorio.listar(
            data=data, turno=turno, status=status, fk_motorista=fk_motorista, fk_rota=fk_rota
        )
        self._completar(viagens)
        return viagens

    def obter(self, id_viagem: int, com_chamadas: bool = False) -> Viagem:
        viagem = self.repositorio.buscar_por_id(id_viagem, com_chamadas=com_chamadas)
        if viagem is None:
            raise RecursoNaoEncontrado("Viagem não encontrada.")
        self._completar([viagem])
        if com_chamadas:
            # Ordem de embarque: pelo horário previsto; quem não tem horário vai para o fim.
            viagem.chamadas.sort(
                key=lambda c: (c.horario_previsto is None, c.horario_previsto or "", c.estudante.nome)
            )
        return viagem

    def _completar(self, viagens: list[Viagem]) -> None:
        """Preenche os campos calculados da resposta (horário previsto, substituição, passageiros)."""
        contagens = self.repositorio.contar_chamadas([v.id for v in viagens])
        for viagem in viagens:
            rota = viagem.rota
            viagem.horario_previsto = rota.horario_ida if viagem.sentido == Sentido.IDA else rota.horario_volta
            viagem.substituicao = (
                viagem.fk_motorista != rota.fk_motorista or viagem.fk_veiculo != rota.motorista.fk_veiculo
            )
            por_status = contagens.get(viagem.id, {})
            viagem.passageiros = ContagemPassageiros(total=sum(por_status.values()), **por_status)

    # ---------------------------------------------------------------- geração do dia

    def gerar_dia(self, dia: date) -> GeracaoResposta:
        """Cria as viagens e chamadas do dia. Idempotente: rodar de novo só completa o que faltar.

        Só até o fim da semana atual: gerar semanas à frente enche o banco de viagens que ainda
        podem mudar (passageiro novo, rota alterada, feriado cadastrado depois).
        """
        limite = fim_da_semana(agora().date())
        if dia > limite:
            raise ConflitoDeDados(
                f"Só dá para gerar viagens até o fim desta semana (domingo, {limite:%d/%m}). "
                f"As viagens de {dia:%d/%m} ficam disponíveis a partir de {dia - timedelta(days=dia.isoweekday() - 1):%d/%m}."
            )
        viagens_criadas, chamadas_criadas = self.repositorio.gerar_dia(dia)

        avisos = []
        dias_sem_aula = self.repositorio.dias_sem_aula(dia)
        for dia_sem_aula in dias_sem_aula:
            quem = dia_sem_aula.instituicao.nome if dia_sem_aula.instituicao else "todas as instituições"
            avisos.append(f"Sem aula em {quem}: {dia_sem_aula.motivo}.")
        # Num feriado geral nenhuma rota roda; avisar de motorista sem veículo seria só ruído.
        if not any(d.fk_instituicao is None for d in dias_sem_aula):
            for rota in self.repositorio.rotas_sem_veiculo(dia):
                avisos.append(
                    f"A rota {rota.nome} não gerou viagem: o motorista {rota.motorista.nome} está sem veículo padrão."
                )
        indisponivel = None
        if not self.repositorio.existe_viagem_no_dia(dia):
            # Nenhuma viagem no dia: diz o porquê, para a tela explicar ao usuário.
            if any(d.fk_instituicao is None for d in dias_sem_aula):
                indisponivel = "feriado"
            elif dia.isoweekday() >= 6:
                indisponivel = "fim_de_semana"
            else:
                indisponivel = "sem_rotas"
                avisos.append("Nenhuma rota ativa roda neste dia da semana.")
        elif viagens_criadas == 0 and not avisos:
            avisos.append("As viagens deste dia já tinham sido geradas.")

        return GeracaoResposta(
            data=dia,
            viagens_criadas=viagens_criadas,
            chamadas_criadas=chamadas_criadas,
            avisos=avisos,
            indisponivel=indisponivel,
        )

    def calendario(self, inicio: date, fim: date) -> list[DiaDoCalendario]:
        """Resumo de cada dia do período (no máximo 62 dias): viagens, rotas do dia e feriados."""
        if fim < inicio:
            raise DadosInvalidos("A data final é anterior à data inicial.")
        if (fim - inicio).days > 61:
            raise DadosInvalidos("Escolha no máximo 62 dias.")
        viagens = self.repositorio.contar_viagens_por_dia(inicio, fim)
        rotas = self.repositorio.contar_rotas_por_dia_semana()
        feriados: dict[date, list] = {}
        for d in self.repositorio.dias_sem_aula_no_periodo(inicio, fim):
            feriados.setdefault(d.data, []).append(d)
        dias = []
        for n in range((fim - inicio).days + 1):
            dia = inicio + timedelta(days=n)
            do_dia = feriados.get(dia, [])
            dias.append(
                DiaDoCalendario(
                    data=dia,
                    viagens=viagens.get(dia, 0),
                    rotas=rotas.get(dia.isoweekday(), 0),
                    feriados=[f"{d.instituicao.nome}: {d.motivo}" if d.instituicao else d.motivo for d in do_dia],
                    feriado_geral=any(d.fk_instituicao is None for d in do_dia),
                )
            )
        return dias

    # ---------------------------------------------------------------- andamento

    def iniciar(self, id_viagem: int) -> Viagem:
        viagem = self.obter(id_viagem)
        self._exigir_status(viagem, StatusViagem.AGENDADA, "iniciar")
        momento = agora()
        if viagem.data > momento.date():
            raise ConflitoDeDados("Esta viagem é de um dia que ainda não chegou.")
        viagem.status = StatusViagem.EM_ANDAMENTO
        viagem.horario_saida = momento
        self.repositorio.salvar(viagem)
        return self.obter(id_viagem)

    def concluir(self, id_viagem: int) -> Viagem:
        """Encerra a viagem; quem não teve presença registrada fica como ausente."""
        viagem = self.obter(id_viagem)
        self._exigir_status(viagem, StatusViagem.EM_ANDAMENTO, "concluir")
        self.repositorio.concluir(viagem.id, agora())
        return self.obter(id_viagem)

    def cancelar(self, id_viagem: int) -> Viagem:
        viagem = self.obter(id_viagem)
        self._exigir_status(viagem, StatusViagem.AGENDADA, "cancelar")
        viagem.status = StatusViagem.CANCELADA
        self.repositorio.salvar(viagem)
        return self.obter(id_viagem)

    def substituir(self, id_viagem: int, dados: SubstituicaoPedido) -> Viagem:
        """Troca motorista e/ou veículo só nesta viagem."""
        viagem = self.obter(id_viagem)
        if viagem.status not in (StatusViagem.AGENDADA, StatusViagem.EM_ANDAMENTO):
            raise ConflitoDeDados(
                f"A viagem está {ROTULO_STATUS[viagem.status]}: não dá mais para trocar motorista ou veículo."
            )
        if dados.fk_motorista is None and dados.fk_veiculo is None:
            raise DadosInvalidos("Informe o motorista ou o veículo da substituição.")

        if dados.fk_motorista is not None:
            motorista = self.repositorio_motorista.buscar_por_id(dados.fk_motorista)
            if motorista is None:
                raise DadosInvalidos("Motorista não encontrado.")
            if motorista.status != StatusCadastro.ATIVO:
                raise DadosInvalidos(f"O motorista {motorista.nome} está inativo.")
            viagem.fk_motorista = motorista.id

        if dados.fk_veiculo is not None:
            veiculo = self.repositorio_veiculo.buscar_por_id(dados.fk_veiculo)
            if veiculo is None:
                raise DadosInvalidos("Veículo não encontrado.")
            if veiculo.status != StatusCadastro.ATIVO:
                raise DadosInvalidos(f"O veículo {veiculo.placa} está inativo.")
            passageiros = self.repositorio.passageiros_confirmados(viagem.id)
            if veiculo.capacidade < passageiros:
                raise DadosInvalidos(
                    f"O veículo {veiculo.placa} tem {veiculo.capacidade} lugares e a viagem tem "
                    f"{passageiros} passageiros."
                )
            viagem.fk_veiculo = veiculo.id

        self.repositorio.salvar(viagem)
        return self.obter(id_viagem)

    # ---------------------------------------------------------------- chamada (passageiro a passageiro)

    def registrar_embarque(self, id_viagem: int, id_estudante: int) -> Viagem:
        """O passageiro embarcou: presente, com o horário de agora."""
        chamada = self._chamada_em_andamento(id_viagem, id_estudante)
        if chamada.status != StatusChamada.PENDENTE:
            raise ConflitoDeDados("Este passageiro já foi registrado nesta viagem.")
        chamada.status = StatusChamada.PRESENTE
        chamada.horario_embarque = agora()
        self.repositorio.salvar_chamada(chamada)
        return self.obter(id_viagem, com_chamadas=True)

    def registrar_falta(self, id_viagem: int, id_estudante: int) -> Viagem:
        """O passageiro não apareceu no ponto: ausente (falta sem aviso)."""
        chamada = self._chamada_em_andamento(id_viagem, id_estudante)
        if chamada.status != StatusChamada.PENDENTE:
            raise ConflitoDeDados("Este passageiro já foi registrado nesta viagem.")
        chamada.status = StatusChamada.AUSENTE
        self.repositorio.salvar_chamada(chamada)
        return self.obter(id_viagem, com_chamadas=True)

    def desfazer_registro(self, id_viagem: int, id_estudante: int) -> Viagem:
        """Desfaz o último registro do passageiro (só com a viagem em andamento).

        Se ele já desembarcou, volta a "a bordo"; se embarcou ou faltou, volta a pendente.
        """
        chamada = self._chamada_em_andamento(id_viagem, id_estudante)
        if chamada.status == StatusChamada.PRESENTE and chamada.horario_desembarque is not None:
            chamada.horario_desembarque = None
        elif chamada.status in (StatusChamada.PRESENTE, StatusChamada.AUSENTE):
            chamada.status = StatusChamada.PENDENTE
            chamada.horario_embarque = None
        else:
            raise ConflitoDeDados("Não há registro para desfazer neste passageiro.")
        self.repositorio.salvar_chamada(chamada)
        return self.obter(id_viagem, com_chamadas=True)

    def registrar_desembarque(self, id_viagem: int, id_estudante: int) -> Viagem:
        """O passageiro desceu no destino (faculdade na ida, casa na volta)."""
        chamada = self._chamada_em_andamento(id_viagem, id_estudante)
        if chamada.status != StatusChamada.PRESENTE:
            raise ConflitoDeDados("Só desembarca quem embarcou nesta viagem.")
        if chamada.horario_desembarque is not None:
            raise ConflitoDeDados("O desembarque deste passageiro já foi confirmado.")
        chamada.horario_desembarque = agora()
        self.repositorio.salvar_chamada(chamada)
        return self.obter(id_viagem, com_chamadas=True)

    def desembarcar_todos(self, id_viagem: int) -> Viagem:
        """Todos os que estão a bordo nesta rota desceram no destino (ex.: chegou na faculdade)."""
        viagem = self.obter(id_viagem, com_chamadas=True)
        if viagem.status != StatusViagem.EM_ANDAMENTO:
            raise ConflitoDeDados(f"A viagem está {ROTULO_STATUS[viagem.status]}: não há desembarque a confirmar.")
        a_bordo = [
            c for c in viagem.chamadas if c.status == StatusChamada.PRESENTE and c.horario_desembarque is None
        ]
        if not a_bordo:
            raise ConflitoDeDados("Ninguém desta rota está a bordo para desembarcar.")
        momento = agora()
        for chamada in a_bordo:
            chamada.horario_desembarque = momento
            self.repositorio.salvar_chamada(chamada)
        return self.obter(id_viagem, com_chamadas=True)

    def _chamada_em_andamento(self, id_viagem: int, id_estudante: int):
        viagem = self.obter(id_viagem)
        if viagem.status != StatusViagem.EM_ANDAMENTO:
            raise ConflitoDeDados(
                f"A viagem está {ROTULO_STATUS[viagem.status]}: inicie a viagem para registrar os passageiros."
            )
        chamada = self.repositorio.buscar_chamada(id_viagem, id_estudante)
        if chamada is None:
            raise RecursoNaoEncontrado("Este passageiro não está nesta viagem.")
        return chamada

    @staticmethod
    def _exigir_status(viagem: Viagem, esperado: StatusViagem, acao: str) -> None:
        if viagem.status != esperado:
            raise ConflitoDeDados(
                f"Só dá para {acao} uma viagem {ROTULO_STATUS[esperado]}; esta está {ROTULO_STATUS[viagem.status]}."
            )
