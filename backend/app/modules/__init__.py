"""Módulos de domínio do UniVan: uma pasta por assunto (empresa, veiculo, estudante...).

Cada módulo pode ter as camadas abaixo, sempre com o nome do módulo como prefixo:

    <modulo>_model.py        Model (M do MVC): mapeia a tabela existente no banco
    <modulo>_schema.py       Formato de entrada e saída da API (validação com Pydantic)
    <modulo>_repositorio.py  Consultas e gravações no banco
    <modulo>_servico.py      Regras de negócio
    <modulo>_controller.py   Controller (C do MVC): rotas HTTP

Este arquivo importa TODOS os models. Assim, qualquer import de `app.modules...`
registra as tabelas na `Base.metadata`, o que é necessário para os relacionamentos
declarados por nome (ex.: relationship("Empresa")) se resolverem.
"""

from app.modules.area.area_model import Area
from app.modules.chamada.chamada_model import Chamada
from app.modules.dia_sem_aula.dia_sem_aula_model import DiaSemAula
from app.modules.empresa.empresa_model import Empresa
from app.modules.endereco.endereco_model import Endereco
from app.modules.estudante.estudante_model import Estudante
from app.modules.financeiro.titulo_pagar_model import TituloPagar
from app.modules.financeiro.titulo_receber_model import TituloReceber
from app.modules.instituicao.instituicao_model import Instituicao
from app.modules.motorista.motorista_model import Motorista
from app.modules.rota.rota_model import Rota, RotaDia
from app.modules.veiculo.veiculo_model import Veiculo
from app.modules.viagem.viagem_model import Viagem

__all__ = [
    "Area",
    "Chamada",
    "DiaSemAula",
    "Empresa",
    "Endereco",
    "Estudante",
    "Instituicao",
    "Motorista",
    "Rota",
    "RotaDia",
    "TituloPagar",
    "TituloReceber",
    "Veiculo",
    "Viagem",
]
