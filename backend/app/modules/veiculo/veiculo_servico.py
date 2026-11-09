"""Regras de negócio de veículos."""

from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.modules.empresa.empresa_repositorio import RepositorioEmpresa
from app.modules.veiculo.veiculo_model import Veiculo
from app.modules.veiculo.veiculo_repositorio import RepositorioVeiculo
from app.modules.veiculo.veiculo_schema import VeiculoAtualizacao, VeiculoCriacao
from app.shared.enums import StatusCadastro


class ServicoVeiculo:
    def __init__(self, repositorio: RepositorioVeiculo, repositorio_empresa: RepositorioEmpresa):
        self.repositorio = repositorio
        self.repositorio_empresa = repositorio_empresa

    def listar(
        self, status: StatusCadastro | None = None, fk_empresa: int | None = None
    ) -> list[Veiculo]:
        return self.repositorio.listar(status=status, fk_empresa=fk_empresa)

    def obter(self, id_veiculo: int) -> Veiculo:
        veiculo = self.repositorio.buscar_por_id(id_veiculo)
        if veiculo is None:
            raise RecursoNaoEncontrado("Veículo não encontrado.")
        return veiculo

    def cadastrar(self, dados: VeiculoCriacao) -> Veiculo:
        self._garantir_empresa_existe(dados.fk_empresa)
        self._garantir_placa_disponivel(dados.placa)
        veiculo = Veiculo(**dados.model_dump())
        self.repositorio.salvar(veiculo)
        return self.obter(veiculo.id)

    def atualizar(self, id_veiculo: int, dados: VeiculoAtualizacao) -> Veiculo:
        veiculo = self.obter(id_veiculo)
        alteracoes = dados.model_dump(exclude_unset=True)

        for campo in ("fk_empresa", "placa", "modelo", "capacidade", "status"):
            if campo in alteracoes and alteracoes[campo] is None:
                raise DadosInvalidos(f"O campo {campo} não pode ficar vazio.")

        if "fk_empresa" in alteracoes and alteracoes["fk_empresa"] != veiculo.fk_empresa:
            self._garantir_empresa_existe(alteracoes["fk_empresa"])
        if "placa" in alteracoes and alteracoes["placa"] != veiculo.placa:
            self._garantir_placa_disponivel(alteracoes["placa"])

        for campo, valor in alteracoes.items():
            setattr(veiculo, campo, valor)
        self.repositorio.salvar(veiculo)
        return self.obter(veiculo.id)

    def inativar(self, id_veiculo: int) -> Veiculo:
        """Nada é apagado no UniVan: o veículo fica inativo e o histórico é mantido."""
        veiculo = self.obter(id_veiculo)
        if veiculo.status == StatusCadastro.INATIVO:
            raise ConflitoDeDados("O veículo já está inativo.")
        veiculo.status = StatusCadastro.INATIVO
        self.repositorio.salvar(veiculo)
        return self.obter(veiculo.id)

    def _garantir_empresa_existe(self, id_empresa: int) -> None:
        if self.repositorio_empresa.buscar_por_id(id_empresa) is None:
            raise DadosInvalidos("Empresa não encontrada.")

    def _garantir_placa_disponivel(self, placa: str) -> None:
        if self.repositorio.buscar_por_placa(placa) is not None:
            raise ConflitoDeDados("Já existe um veículo com esta placa.")
