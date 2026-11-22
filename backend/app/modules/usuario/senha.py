"""Esqueci a senha: link de redefinição para o gestor (por e-mail) e pedido ao gestor (os demais).

O link vale 1 hora e só uma vez: ele carrega um pedaço do hash da senha atual, que muda quando a
senha é trocada. Sem SMTP configurado (.env), o link vai para o log da API.
"""

import json
import logging
import smtplib
import time
from email.message import EmailMessage

from app.config.configuracoes import obter_configuracoes
from app.config.erros import DadosInvalidos
from app.config.seguranca import _assinar, _b64, _desb64
from app.modules.usuario.usuario_model import Usuario

log = logging.getLogger("univan.senha")

VALIDADE_SEGUNDOS = 60 * 60
INVALIDO = "Este link de redefinição é inválido ou já foi usado. Peça um novo em \"Esqueci a senha\"."


def criar_link(usuario: Usuario, agora: float | None = None) -> str:
    agora = time.time() if agora is None else agora
    dados = {"sub": usuario.id, "tipo": "senha", "exp": int(agora + VALIDADE_SEGUNDOS), "h": usuario.senha_hash[-12:]}
    conteudo = _b64(json.dumps(dados).encode())
    return f"{obter_configuracoes().url_app.rstrip('/')}/redefinir-senha?token={conteudo}.{_assinar(conteudo)}"


def ler_link(token: str) -> dict:
    """Os dados do token, se for um link de senha válido e ainda não expirado."""
    try:
        conteudo, assinatura = token.split(".")
        dados = json.loads(_desb64(conteudo))
    except ValueError:
        raise DadosInvalidos(INVALIDO) from None
    if _assinar(conteudo) != assinatura or dados.get("tipo") != "senha" or dados.get("exp", 0) < time.time():
        raise DadosInvalidos(INVALIDO)
    return dados


def link_ainda_vale(dados: dict, usuario: Usuario) -> bool:
    """Senha trocada depois do link: o link morre (uso único)."""
    return usuario.senha_hash[-12:] == dados.get("h")


def enviar_email_de_senha(usuario: Usuario) -> None:
    """Manda o link ao e-mail do gestor. Sem SMTP (ou sem e-mail), registra o link no log."""
    link = criar_link(usuario)
    config = obter_configuracoes()
    if not config.smtp_host or not usuario.email:
        log.warning("Redefinição de senha de %s (sem e-mail configurado). Link: %s", usuario.login, link)
        return
    mensagem = EmailMessage()
    mensagem["Subject"] = "UniVan · Redefinição de senha"
    mensagem["From"] = config.smtp_remetente
    mensagem["To"] = usuario.email
    mensagem.set_content(
        f"Olá, {usuario.nome.split()[0]}!\n\n"
        f"Recebemos um pedido para criar uma senha nova no UniVan. Abra o link abaixo (vale por 1 hora):\n\n{link}\n\n"
        "Se não foi você, ignore este e-mail: sua senha continua a mesma."
    )
    try:
        with smtplib.SMTP(config.smtp_host, config.smtp_porta, timeout=15) as smtp:
            smtp.starttls()
            if config.smtp_usuario:
                smtp.login(config.smtp_usuario, config.smtp_senha)
            smtp.send_message(mensagem)
    except (OSError, smtplib.SMTPException):
        # O pedido não pode falhar por causa do e-mail: o link fica no log para o suporte.
        log.exception("Não foi possível enviar o e-mail de senha para %s. Link: %s", usuario.login, link)
