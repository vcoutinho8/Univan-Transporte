"""Regras de negócio das áreas (bairros atendidos por cada motorista)."""

from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.modules.area.area_model import Area
from app.modules.area.area_repositorio import RepositorioArea
from app.modules.area.area_schema import AreaAtualizacao, AreaCriacao, poligono_para_banco
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.shared.enums import StatusCadastro


class ServicoArea:
    def __init__(self, repositorio: RepositorioArea, repositorio_motorista: RepositorioMotorista):
        self.repositorio = repositorio
        self.repositorio_motorista = repositorio_motorista

    def listar(self, status: StatusCadastro | None = None) -> list[Area]:
        return self.repositorio.listar(status=status)

    def obter(self, id_area: int) -> Area:
        area = self.repositorio.buscar_por_id(id_area)
        if area is None:
            raise RecursoNaoEncontrado("Área não encontrada.")
        return area

    def cadastrar(self, dados: AreaCriacao) -> Area:
        self._garantir_nome_disponivel(dados.nome)
        if dados.fk_motorista is not None:
            self._garantir_motorista_existe(dados.fk_motorista)
        area = Area(
            nome=dados.nome,
            fk_motorista=dados.fk_motorista,
            coordenadas=poligono_para_banco(dados.poligono),
        )
        self.repositorio.salvar(area)
        return self.obter(area.id)

    def atualizar(self, id_area: int, dados: AreaAtualizacao) -> Area:
        area = self.obter(id_area)
        alteracoes = dados.model_dump(exclude_unset=True)

        for campo in ("nome", "poligono", "status"):
            if campo in alteracoes and alteracoes[campo] is None:
                raise DadosInvalidos(f"O campo {campo} não pode ficar vazio.")

        # Nome repetido só importa entre áreas ativas (inclusive ao reativar uma área).
        reativando = alteracoes.get("status") == StatusCadastro.ATIVO and area.status != StatusCadastro.ATIVO
        novo_nome = alteracoes.get("nome", area.nome)
        if novo_nome.lower() != area.nome.lower() or reativando:
            self._garantir_nome_disponivel(novo_nome, ignorar=area.id)
        if alteracoes.get("fk_motorista") is not None and alteracoes["fk_motorista"] != area.fk_motorista:
            self._garantir_motorista_existe(alteracoes["fk_motorista"])

        if "poligono" in alteracoes:
            area.coordenadas = poligono_para_banco(alteracoes.pop("poligono"))
        for campo, valor in alteracoes.items():
            setattr(area, campo, valor)
        self.repositorio.salvar(area)
        return self.obter(area.id)

    def inativar(self, id_area: int) -> Area:
        """A área sai do mapa e os passageiros dela ficam sem área (nada é apagado)."""
        area = self.obter(id_area)
        if area.status == StatusCadastro.INATIVO:
            raise ConflitoDeDados("A área já está inativa.")
        area.status = StatusCadastro.INATIVO
        self.repositorio.salvar(area)
        return self.obter(area.id)

    def _garantir_nome_disponivel(self, nome: str, ignorar: int | None = None) -> None:
        existente = self.repositorio.buscar_ativa_por_nome(nome)
        if existente is not None and existente.id != ignorar:
            raise ConflitoDeDados(f"Já existe uma área ativa chamada {existente.nome}.")

    def _garantir_motorista_existe(self, id_motorista: int) -> None:
        if self.repositorio_motorista.buscar_por_id(id_motorista) is None:
            raise DadosInvalidos("Motorista não encontrado.")
