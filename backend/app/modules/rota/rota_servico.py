"""Regras de negócio das rotas."""

from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.modules.estudante.estudante_model import Estudante
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.modules.rota.rota_model import Rota, RotaDia
from app.modules.rota.rota_repositorio import RepositorioRota
from app.modules.rota.rota_schema import RotaAtualizacao, RotaCriacao
from app.shared.enums import StatusCadastro

CAMPOS_OBRIGATORIOS = ("nome", "fk_motorista", "fk_instituicao", "turno", "dias", "status")


class ServicoRota:
    def __init__(
        self,
        repositorio: RepositorioRota,
        repositorio_motorista: RepositorioMotorista,
        repositorio_instituicao: RepositorioInstituicao,
    ):
        self.repositorio = repositorio
        self.repositorio_motorista = repositorio_motorista
        self.repositorio_instituicao = repositorio_instituicao

    def listar(self, status: StatusCadastro | None = None, fk_motorista: int | None = None) -> list[Rota]:
        rotas = self.repositorio.listar(status=status, fk_motorista=fk_motorista)
        totais = self.repositorio.contar_passageiros()
        for rota in rotas:
            rota.total_passageiros = totais.get(rota.id, 0)
        return rotas

    def obter(self, id_rota: int) -> Rota:
        rota = self.repositorio.buscar_por_id(id_rota)
        if rota is None:
            raise RecursoNaoEncontrado("Rota não encontrada.")
        rota.total_passageiros = self.repositorio.contar_passageiros().get(rota.id, 0)
        return rota

    def passageiros(self, id_rota: int) -> list[Estudante]:
        self.obter(id_rota)
        return self.repositorio.passageiros(id_rota)

    def cadastrar(self, dados: RotaCriacao) -> Rota:
        self._garantir_referencias(dados.fk_motorista, dados.fk_instituicao)
        self._garantir_combinacao_livre(dados.fk_motorista, dados.fk_instituicao, dados.turno)
        self._garantir_horarios(dados.horario_ida, dados.horario_volta)
        campos = dados.model_dump(exclude={"dias"})
        rota = Rota(**campos, dias=[RotaDia(dia_semana=d) for d in dados.dias])
        self.repositorio.salvar(rota)
        return self.obter(rota.id)

    def atualizar(self, id_rota: int, dados: RotaAtualizacao) -> Rota:
        rota = self.obter(id_rota)
        alteracoes = dados.model_dump(exclude_unset=True)

        for campo in CAMPOS_OBRIGATORIOS:
            if campo in alteracoes and alteracoes[campo] is None:
                raise DadosInvalidos(f"O campo {campo} não pode ficar vazio.")

        motorista = alteracoes.get("fk_motorista", rota.fk_motorista)
        instituicao = alteracoes.get("fk_instituicao", rota.fk_instituicao)
        turno = alteracoes.get("turno", rota.turno)
        self._garantir_referencias(motorista, instituicao)
        self._garantir_combinacao_livre(motorista, instituicao, turno, ignorar=rota.id)
        self._garantir_horarios(
            alteracoes.get("horario_ida", rota.horario_ida), alteracoes.get("horario_volta", rota.horario_volta)
        )

        if "dias" in alteracoes:
            novos = alteracoes.pop("dias")
            rota.dias = [d for d in rota.dias if d.dia_semana in novos] + [
                RotaDia(dia_semana=d) for d in novos if d not in {x.dia_semana for x in rota.dias}
            ]
        for campo, valor in alteracoes.items():
            setattr(rota, campo, valor)
        self.repositorio.salvar(rota)
        return self.obter(rota.id)

    def inativar(self, id_rota: int) -> Rota:
        """A rota para de gerar viagens; o histórico de viagens e chamadas é mantido."""
        rota = self.obter(id_rota)
        if rota.status == StatusCadastro.INATIVO:
            raise ConflitoDeDados("A rota já está inativa.")
        rota.status = StatusCadastro.INATIVO
        self.repositorio.salvar(rota)
        return self.obter(rota.id)

    def _garantir_referencias(self, id_motorista: int, id_instituicao: int) -> None:
        if self.repositorio_motorista.buscar_por_id(id_motorista) is None:
            raise DadosInvalidos("Motorista não encontrado.")
        if self.repositorio_instituicao.buscar_por_id(id_instituicao) is None:
            raise DadosInvalidos("Instituição não encontrada.")

    def _garantir_combinacao_livre(self, id_motorista, id_instituicao, turno, ignorar: int | None = None) -> None:
        existente = self.repositorio.buscar_por_combinacao(id_motorista, id_instituicao, turno)
        if existente is not None and existente.id != ignorar:
            complemento = " (inativa: reative-a)" if existente.status == StatusCadastro.INATIVO else ""
            raise ConflitoDeDados(
                f"Este motorista já tem uma rota para esta instituição neste turno: {existente.nome}{complemento}."
            )

    @staticmethod
    def _garantir_horarios(ida, volta) -> None:
        if ida is not None and volta is not None and volta <= ida:
            raise DadosInvalidos("O horário de volta deve ser depois do horário de ida.")
