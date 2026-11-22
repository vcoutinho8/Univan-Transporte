"""Regras de negócio dos passageiros."""

from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.modules.endereco.endereco_model import Endereco
from app.modules.estudante.estudante_model import Estudante
from app.modules.estudante.estudante_repositorio import RepositorioEstudante
from app.modules.estudante.estudante_schema import EstudanteAtualizacao, EstudanteCriacao
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.shared.enums import StatusCadastro

# Campos que existem no banco como NOT NULL: no PATCH podem ser omitidos, mas não anulados.
CAMPOS_OBRIGATORIOS = (
    "nome",
    "cpf",
    "celular",
    "fk_instituicao",
    "turno",
    "valor_mensal",
    "dia_vencimento",
    "endereco",
    "status",
)


class ServicoEstudante:
    def __init__(
        self, repositorio: RepositorioEstudante, repositorio_instituicao: RepositorioInstituicao
    ):
        self.repositorio = repositorio
        self.repositorio_instituicao = repositorio_instituicao

    def listar(
        self,
        status: StatusCadastro | None = None,
        fk_area: int | None = None,
        fk_instituicao: int | None = None,
    ) -> list[Estudante]:
        return self.repositorio.listar(status=status, fk_area=fk_area, fk_instituicao=fk_instituicao)

    def obter(self, id_estudante: int) -> Estudante:
        estudante = self.repositorio.buscar_por_id(id_estudante)
        if estudante is None:
            raise RecursoNaoEncontrado("Passageiro não encontrado.")
        return estudante

    def cadastrar(self, dados: EstudanteCriacao) -> Estudante:
        self._garantir_instituicao_existe(dados.fk_instituicao)
        self._garantir_cpf_disponivel(dados.cpf)
        self._garantir_parada_da_instituicao(dados.fk_parada, dados.fk_instituicao)
        campos = dados.model_dump(exclude={"endereco"})
        estudante = Estudante(**campos, endereco=Endereco(**dados.endereco.model_dump()))
        self.repositorio.salvar(estudante)
        return self.obter(estudante.id)

    def atualizar(self, id_estudante: int, dados: EstudanteAtualizacao) -> Estudante:
        estudante = self.obter(id_estudante)
        alteracoes = dados.model_dump(exclude_unset=True)

        for campo in CAMPOS_OBRIGATORIOS:
            if campo in alteracoes and alteracoes[campo] is None:
                raise DadosInvalidos(f"O campo {campo} não pode ficar vazio.")

        if "fk_instituicao" in alteracoes and alteracoes["fk_instituicao"] != estudante.fk_instituicao:
            self._garantir_instituicao_existe(alteracoes["fk_instituicao"])
        if "cpf" in alteracoes and alteracoes["cpf"] != estudante.cpf:
            self._garantir_cpf_disponivel(alteracoes["cpf"])

        # Mudou de faculdade sem escolher parada: volta para a principal da nova.
        instituicao_final = alteracoes.get("fk_instituicao", estudante.fk_instituicao)
        if "fk_parada" in alteracoes:
            self._garantir_parada_da_instituicao(alteracoes["fk_parada"], instituicao_final)
        elif instituicao_final != estudante.fk_instituicao:
            alteracoes["fk_parada"] = None

        novo_endereco = alteracoes.pop("endereco", None)
        if novo_endereco is not None:
            for campo, valor in novo_endereco.items():
                setattr(estudante.endereco, campo, valor)

        for campo, valor in alteracoes.items():
            setattr(estudante, campo, valor)
        self.repositorio.salvar(estudante, recalcular_area=novo_endereco is not None)
        return self.obter(estudante.id)

    def inativar(self, id_estudante: int) -> Estudante:
        """Nada é apagado no UniVan: o passageiro fica inativo e o histórico é mantido."""
        estudante = self.obter(id_estudante)
        if estudante.status == StatusCadastro.INATIVO:
            raise ConflitoDeDados("O passageiro já está inativo.")
        estudante.status = StatusCadastro.INATIVO
        self.repositorio.salvar(estudante)
        return self.obter(estudante.id)

    def _garantir_parada_da_instituicao(self, id_parada: int | None, id_instituicao: int) -> None:
        if id_parada is not None and self.repositorio_instituicao.buscar_parada(id_instituicao, id_parada) is None:
            raise DadosInvalidos("Essa parada não é da faculdade do passageiro.")

    def _garantir_instituicao_existe(self, id_instituicao: int) -> None:
        if self.repositorio_instituicao.buscar_por_id(id_instituicao) is None:
            raise DadosInvalidos("Instituição não encontrada.")

    def _garantir_cpf_disponivel(self, cpf: str) -> None:
        if self.repositorio.buscar_por_cpf(cpf) is not None:
            raise ConflitoDeDados("Já existe um passageiro com este CPF.")
        self.repositorio.garantir_cpf_livre(cpf)
