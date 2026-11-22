"""Regras de negócio dos motoristas."""

from datetime import date

from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.modules.empresa.empresa_repositorio import RepositorioEmpresa
from app.modules.endereco.endereco_model import Endereco
from app.modules.motorista.motorista_model import Motorista
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.modules.motorista.motorista_schema import MotoristaAtualizacao, MotoristaCriacao
from app.modules.veiculo.veiculo_repositorio import RepositorioVeiculo
from app.shared.documentos import cnh_valida, cpf_valido
from app.shared.enums import StatusCadastro

# Campos que existem no banco como NOT NULL (e o celular, que a API exige): no PATCH podem ser
# omitidos, mas não anulados.
CAMPOS_OBRIGATORIOS = ("nome", "cpf", "celular", "cnh", "cnh_validade", "status")

# CNH vale 5 ou 10 anos; mais que isso é quase certo erro de digitação do ano.
ANOS_MAXIMOS_DE_VALIDADE = 10


def _data_br(valor: date) -> str:
    return valor.strftime("%d/%m/%Y")


def _limite_de_validade(hoje: date) -> date:
    try:
        return hoje.replace(year=hoje.year + ANOS_MAXIMOS_DE_VALIDADE)
    except ValueError:  # hoje é 29/02
        return hoje.replace(year=hoje.year + ANOS_MAXIMOS_DE_VALIDADE, day=28)


class ServicoMotorista:
    def __init__(
        self,
        repositorio: RepositorioMotorista,
        repositorio_veiculo: RepositorioVeiculo,
        repositorio_empresa: RepositorioEmpresa,
    ):
        self.repositorio = repositorio
        self.repositorio_veiculo = repositorio_veiculo
        self.repositorio_empresa = repositorio_empresa

    def listar(self, status: StatusCadastro | None = None) -> list[Motorista]:
        return self.repositorio.listar(status=status)

    def obter(self, id_motorista: int) -> Motorista:
        motorista = self.repositorio.buscar_por_id(id_motorista)
        if motorista is None:
            raise RecursoNaoEncontrado("Motorista não encontrado.")
        return motorista

    def cadastrar(self, dados: MotoristaCriacao, id_empresa: int) -> Motorista:
        """Cadastra o motorista na empresa de quem está usando o sistema."""
        self._garantir_empresa_existe(id_empresa)
        self._garantir_cpf_disponivel(dados.cpf)
        self._garantir_cnh_disponivel(dados.cnh)
        if dados.status == StatusCadastro.ATIVO:
            self._garantir_cnh_em_dia(dados.cnh_validade)
        else:
            self._garantir_validade_plausivel(dados.cnh_validade)
        if dados.fk_veiculo is not None:
            self._garantir_veiculo_utilizavel(dados.fk_veiculo, id_empresa)
        endereco = dados.endereco
        motorista = Motorista(
            **dados.model_dump(exclude={"endereco"}),
            fk_empresa=id_empresa,
            endereco=Endereco(**endereco.model_dump()) if endereco else None,
        )
        self.repositorio.salvar(motorista)
        return self.obter(motorista.id)

    def atualizar(self, id_motorista: int, dados: MotoristaAtualizacao) -> Motorista:
        motorista = self.obter(id_motorista)
        alteracoes = dados.model_dump(exclude_unset=True)

        for campo in CAMPOS_OBRIGATORIOS:
            if campo in alteracoes and alteracoes[campo] is None:
                raise DadosInvalidos(f"O campo {campo} não pode ficar vazio.")

        # CPF, CNH e veículo só são conferidos quando mudam: o motorista antigo continua editável
        # mesmo que o número gravado no passado não passe na conta dos dígitos.
        if "cpf" in alteracoes and alteracoes["cpf"] != motorista.cpf:
            self._garantir_cpf_disponivel(alteracoes["cpf"])
        if "cnh" in alteracoes and alteracoes["cnh"] != motorista.cnh:
            self._garantir_cnh_disponivel(alteracoes["cnh"])
        if alteracoes.get("fk_veiculo") is not None and alteracoes["fk_veiculo"] != motorista.fk_veiculo:
            self._garantir_veiculo_utilizavel(alteracoes["fk_veiculo"], motorista.fk_empresa)

        nova_validade = alteracoes.get("cnh_validade")
        reativando = alteracoes.get("status") == StatusCadastro.ATIVO and motorista.status != StatusCadastro.ATIVO
        if nova_validade is not None and nova_validade != motorista.cnh_validade:
            ficara_ativo = alteracoes.get("status", motorista.status) == StatusCadastro.ATIVO
            if ficara_ativo:
                self._garantir_cnh_em_dia(nova_validade)
            else:
                self._garantir_validade_plausivel(nova_validade)
        elif reativando:
            self._garantir_cnh_em_dia(motorista.cnh_validade)

        if "endereco" in alteracoes:
            novo = alteracoes.pop("endereco")
            if novo is None:
                motorista.endereco = None
            elif motorista.endereco is None:
                motorista.endereco = Endereco(**novo)
            else:
                for campo, valor in novo.items():
                    setattr(motorista.endereco, campo, valor)

        for campo, valor in alteracoes.items():
            setattr(motorista, campo, valor)
        self.repositorio.salvar(motorista)
        return self.obter(motorista.id)

    def inativar(self, id_motorista: int) -> Motorista:
        """Nada é apagado no UniVan: o motorista fica inativo e o histórico é mantido."""
        motorista = self.obter(id_motorista)
        if motorista.status == StatusCadastro.INATIVO:
            raise ConflitoDeDados("O motorista já está inativo.")
        motorista.status = StatusCadastro.INATIVO
        self.repositorio.salvar(motorista)
        return self.obter(motorista.id)

    # ------------------------------------------------------------------ regras

    def _garantir_empresa_existe(self, id_empresa: int) -> None:
        if self.repositorio_empresa.buscar_por_id(id_empresa) is None:
            raise DadosInvalidos("Empresa não encontrada.")

    def _garantir_cpf_disponivel(self, cpf: str) -> None:
        if not cpf_valido(cpf):
            raise DadosInvalidos("CPF inválido. Confira os números digitados.")
        if self.repositorio.buscar_por_cpf(cpf) is not None:
            raise ConflitoDeDados("Já existe um motorista com este CPF.")

    def _garantir_cnh_disponivel(self, cnh: str) -> None:
        if not cnh_valida(cnh):
            raise DadosInvalidos("CNH inválida. Confira o número do registro.")
        if self.repositorio.buscar_por_cnh(cnh) is not None:
            raise ConflitoDeDados("Já existe um motorista com esta CNH.")

    @staticmethod
    def _garantir_validade_plausivel(validade: date) -> None:
        if validade > _limite_de_validade(date.today()):
            raise DadosInvalidos(
                f"Validade da CNH inválida: {_data_br(validade)} está longe demais. Confira o ano."
            )

    def _garantir_cnh_em_dia(self, validade: date) -> None:
        """Motorista ativo precisa de CNH dentro da validade."""
        if validade < date.today():
            raise DadosInvalidos(f"CNH vencida em {_data_br(validade)}. Atualize a validade.")
        self._garantir_validade_plausivel(validade)

    def _garantir_veiculo_utilizavel(self, id_veiculo: int, id_empresa: int) -> None:
        veiculo = self.repositorio_veiculo.buscar_por_id(id_veiculo)
        if veiculo is None:
            raise DadosInvalidos("Veículo não encontrado.")
        if veiculo.fk_empresa != id_empresa:
            raise DadosInvalidos("Este veículo pertence a outra empresa.")
        if veiculo.status != StatusCadastro.ATIVO:
            raise DadosInvalidos(f"O veículo {veiculo.placa} está inativo.")
