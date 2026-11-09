"""Configurações da aplicação, lidas de variáveis de ambiente ou do arquivo .env."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

# O .env fica na raiz do monorepo (um nível acima de backend/).
RAIZ_PROJETO = Path(__file__).resolve().parents[3]


class Configuracoes(BaseSettings):
    """Valores configuráveis do backend.

    Os nomes das variáveis de ambiente seguem o padrão em inglês (DATABASE_URL etc.);
    os atributos ficam em português, conforme a padronização do projeto.
    """

    model_config = SettingsConfigDict(
        env_file=(RAIZ_PROJETO / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    nome_aplicacao: str = Field(default="UniVan API", alias="APP_NAME")
    # Arquivo do banco SQLite, relativo à raiz do projeto.
    url_banco: str = Field(default="sqlite:///backend/univan.db", alias="DATABASE_URL")
    exibir_sql: bool = Field(default=False, alias="DATABASE_ECHO")
    origens_cors: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")

    @property
    def url_banco_resolvida(self) -> str:
        """URL do banco com o caminho do SQLite relativo à raiz do projeto.

        Assim `sqlite:///backend/univan.db` aponta para o mesmo arquivo, não importa de qual
        pasta a API foi iniciada.
        """
        url = make_url(self.url_banco)
        if url.database in (None, "", ":memory:"):
            return self.url_banco
        caminho = Path(url.database)
        if not caminho.is_absolute():
            caminho = RAIZ_PROJETO / caminho
        return url.set(database=str(caminho)).render_as_string(hide_password=False)

    @property
    def lista_origens_cors(self) -> list[str]:
        """Converte a lista separada por vírgula em uma lista de origens."""
        return [origem.strip() for origem in self.origens_cors.split(",") if origem.strip()]


@lru_cache
def obter_configuracoes() -> Configuracoes:
    """Retorna as configurações (carregadas uma única vez)."""
    return Configuracoes()
