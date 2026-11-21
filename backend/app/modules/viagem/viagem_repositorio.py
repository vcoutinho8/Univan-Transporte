"""Acesso a dados das tabelas `viagem` e `chamada`."""

from datetime import date, datetime

from sqlalchemy import String, case, func, select, text
from sqlalchemy.orm import Session, joinedload, selectinload

from app.config.rotinas import comandos_da_rotina
from app.modules.chamada.chamada_model import Chamada
from app.modules.dia_sem_aula.dia_sem_aula_model import DiaSemAula
from app.modules.estudante.estudante_model import Estudante
from app.modules.motorista.motorista_model import Motorista
from app.modules.rota.rota_model import Rota, RotaDia
from app.modules.viagem.viagem_model import Viagem
from app.shared.enums import Sentido, StatusCadastro, StatusChamada, StatusViagem, Turno

_RELACOES = (
    joinedload(Viagem.rota).joinedload(Rota.instituicao),
    joinedload(Viagem.rota).joinedload(Rota.motorista),
    joinedload(Viagem.motorista),
    joinedload(Viagem.veiculo),
)

# Horário previsto da viagem: o de ida ou o de volta da rota.
_HORARIO_PREVISTO = case((Viagem.sentido == Sentido.IDA, Rota.horario_ida), else_=Rota.horario_volta)


class RepositorioViagem:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(
        self,
        data: date | None = None,
        turno: Turno | None = None,
        status: StatusViagem | None = None,
        fk_motorista: int | None = None,
        fk_rota: int | None = None,
    ) -> list[Viagem]:
        consulta = (
            select(Viagem)
            .join(Viagem.rota)
            .options(*_RELACOES)
            # Em ordem de saída; viagem sem horário vai para o fim do dia.
            .order_by(Viagem.data, _HORARIO_PREVISTO.is_(None), _HORARIO_PREVISTO, Rota.nome, Viagem.sentido)
        )
        if data is not None:
            consulta = consulta.where(Viagem.data == data)
        if turno is not None:
            consulta = consulta.where(Rota.turno == turno)
        if status is not None:
            consulta = consulta.where(Viagem.status == status)
        if fk_motorista is not None:
            consulta = consulta.where(Viagem.fk_motorista == fk_motorista)
        if fk_rota is not None:
            consulta = consulta.where(Viagem.fk_rota == fk_rota)
        return list(self.sessao.scalars(consulta).unique())

    def buscar_por_id(self, id_viagem: int, com_chamadas: bool = False) -> Viagem | None:
        opcoes = list(_RELACOES)
        if com_chamadas:
            opcoes.append(
                selectinload(Viagem.chamadas).joinedload(Chamada.estudante).joinedload(Estudante.endereco)
            )
        return self.sessao.get(Viagem, id_viagem, options=opcoes, populate_existing=True)

    def contar_chamadas(self, ids_viagem: list[int]) -> dict[int, dict[str, int]]:
        """{id da viagem: {status da chamada: quantidade}}."""
        if not ids_viagem:
            return {}
        linhas = self.sessao.execute(
            select(Chamada.fk_viagem, Chamada.status, func.count())
            .where(Chamada.fk_viagem.in_(ids_viagem))
            .group_by(Chamada.fk_viagem, Chamada.status)
        )
        contagem: dict[int, dict[str, int]] = {}
        for id_viagem, status, quantidade in linhas:
            contagem.setdefault(id_viagem, {})[status.value] = quantidade
        return contagem

    # ---------------------------------------------------------------- geração do dia

    def gerar_dia(self, dia: date) -> tuple[int, int]:
        """Roda a rotina `gerar_dia`. Devolve (viagens criadas, chamadas criadas)."""
        viagens, chamadas = comandos_da_rotina("gerar_dia")
        parametros = {"data": dia.isoformat()}
        try:
            criadas = self.sessao.execute(text(viagens), parametros).rowcount
            incluidas = self.sessao.execute(text(chamadas), parametros).rowcount
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return criadas, incluidas

    def dias_sem_aula(self, dia: date) -> list[DiaSemAula]:
        return list(
            self.sessao.scalars(
                select(DiaSemAula).options(joinedload(DiaSemAula.instituicao)).where(DiaSemAula.data == dia)
            )
        )

    def rotas_sem_veiculo(self, dia: date) -> list[Rota]:
        """Rotas ativas que rodam no dia, mas cujo motorista não tem veículo padrão (o gerar_dia pula)."""
        return list(
            self.sessao.scalars(
                select(Rota)
                .join(Rota.motorista)
                .join(RotaDia, RotaDia.fk_rota == Rota.id)
                .options(joinedload(Rota.motorista))
                .where(
                    Rota.status == StatusCadastro.ATIVO,
                    Motorista.fk_veiculo.is_(None),
                    RotaDia.dia_semana == dia.isoweekday(),
                )
                .order_by(Rota.nome)
            )
        )

    def contar_viagens_por_dia(self, inicio: date, fim: date) -> dict[date, int]:
        """Viagens por dia, contadas como jornadas: motorista + turno + sentido (o cartão da tela).

        Um motorista que leva alunos para três faculdades na ida da noite faz uma viagem, não três.
        """
        jornada = func.distinct(Viagem.fk_motorista.cast(String) + "|" + Rota.turno.cast(String) + "|" + Viagem.sentido.cast(String))
        linhas = self.sessao.execute(
            select(Viagem.data, func.count(jornada))
            .join(Rota, Rota.id == Viagem.fk_rota)
            .where(Viagem.data.between(inicio, fim))
            .group_by(Viagem.data)
        )
        return dict(linhas.all())

    def contar_rotas_por_dia_semana(self) -> dict[int, int]:
        """{dia da semana ISO: rotas ativas que rodam nele}."""
        linhas = self.sessao.execute(
            select(RotaDia.dia_semana, func.count())
            .join(Rota, Rota.id == RotaDia.fk_rota)
            .where(Rota.status == StatusCadastro.ATIVO)
            .group_by(RotaDia.dia_semana)
        )
        return dict(linhas.all())

    def dias_sem_aula_no_periodo(self, inicio: date, fim: date) -> list[DiaSemAula]:
        return list(
            self.sessao.scalars(
                select(DiaSemAula)
                .options(joinedload(DiaSemAula.instituicao))
                .where(DiaSemAula.data.between(inicio, fim))
                .order_by(DiaSemAula.data)
            )
        )

    def existe_viagem_no_dia(self, dia: date) -> bool:
        return self.sessao.scalar(select(func.count()).select_from(Viagem).where(Viagem.data == dia)) > 0

    # ---------------------------------------------------------------- andamento

    def concluir(self, id_viagem: int, momento: datetime) -> None:
        """Roda a rotina `concluir_viagem`: conclui e marca `ausente` quem ficou `pendente`."""
        parametros = {"viagem": id_viagem, "momento": momento.strftime("%Y-%m-%d %H:%M:%S")}
        try:
            for comando in comandos_da_rotina("concluir_viagem"):
                self.sessao.execute(text(comando), parametros)
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise

    def passageiros_confirmados(self, id_viagem: int) -> int:
        """Quem ainda pode embarcar: todos menos quem avisou que não vai."""
        return self.sessao.scalar(
            select(func.count())
            .select_from(Chamada)
            .where(Chamada.fk_viagem == id_viagem, Chamada.status != StatusChamada.NAO_VAI)
        )

    def buscar_chamada(self, id_viagem: int, id_estudante: int) -> Chamada | None:
        return self.sessao.get(Chamada, (id_viagem, id_estudante))

    def salvar_chamada(self, chamada: Chamada) -> Chamada:
        self.sessao.add(chamada)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return chamada

    def salvar(self, viagem: Viagem) -> Viagem:
        self.sessao.add(viagem)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return viagem
