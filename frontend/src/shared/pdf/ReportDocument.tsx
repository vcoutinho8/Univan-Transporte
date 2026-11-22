import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { DadosPdf } from './types.ts'

/**
 * Layout padrão dos relatórios em PDF (A4 em pé), com base no @raicampos/pdfmake-toolkit (MIT):
 * - cabeçalho: logo da UniVan à esquerda; título, período e data de geração à direita;
 *   uma faixa laranja fina separa o cabeçalho do conteúdo;
 * - filtros usados em etiquetas (só aparecem quando houver filtro);
 * - indicadores em cartões (Passageiros, Presenças...);
 * - tabela com cabeçalho azul-marinho, linhas alternadas, sem linhas verticais; o cabeçalho das
 *   colunas se repete em cada página;
 * - rodapé com "Página X de Y".
 *
 * Este arquivo só é carregado quando o usuário gera um PDF (ver gerarPdf.ts).
 */

// Sem hifenização: o padrão quebrava palavras curtas ("FAL-TAS") nos cabeçalhos estreitos.
Font.registerHyphenationCallback((palavra) => [palavra])

const COR = {
  marinho: '#1b3c59',
  laranja: '#f2600c',
  titulo: '#0f172a',
  texto: '#334155',
  suave: '#64748b',
  claro: '#94a3b8',
  zebra: '#f8fafc',
  borda: '#e2e8f0',
  fundoCartao: '#f8fafc',
  fundoGrupo: '#eef2f6',
}

const estilos = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 54, paddingHorizontal: 36, fontSize: 8, color: COR.texto, fontFamily: 'Helvetica' },

  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 150, height: 46, objectFit: 'contain' },
  cabecalhoTexto: { alignItems: 'flex-end' },
  titulo: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: COR.marinho },
  periodo: { marginTop: 3, fontSize: 9, color: COR.texto },
  gerado: { marginTop: 2, fontSize: 7, color: COR.claro },
  faixa: { flexDirection: 'row', marginTop: 12, marginBottom: 14, height: 3 },

  filtros: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  filtro: { flexDirection: 'row', backgroundColor: COR.fundoGrupo, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8, marginRight: 5, marginBottom: 4 },
  filtroRotulo: { color: COR.suave },
  filtroValor: { fontFamily: 'Helvetica-Bold', color: COR.marinho },

  indicadores: { flexDirection: 'row', marginBottom: 16 },
  indicador: { flex: 1, backgroundColor: COR.fundoCartao, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: COR.laranja, paddingVertical: 8, paddingHorizontal: 10, marginRight: 6 },
  indicadorRotulo: { fontSize: 6.5, color: COR.suave, textTransform: 'uppercase', letterSpacing: 0.4 },
  indicadorValor: { marginTop: 4, fontSize: 14, fontFamily: 'Helvetica-Bold', color: COR.titulo },

  linhaCabecalho: { flexDirection: 'row', backgroundColor: COR.marinho, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.3, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  linha: { flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: COR.borda },
  linhaGrupo: { flexDirection: 'row', backgroundColor: COR.fundoGrupo, fontFamily: 'Helvetica-Bold', color: COR.marinho, marginTop: 6 },
  celula: { paddingVertical: 5, paddingHorizontal: 5 },
  vazio: { padding: 18, textAlign: 'center', color: COR.suave },

  rodape: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: COR.borda, paddingTop: 6, fontSize: 7, color: COR.claro },
})

/**
 * As fontes padrão do PDF (Helvetica) só têm os caracteres do Latin-1: os acentos do português
 * funcionam, mas símbolos como "→" sairiam quebrados.
 */
export function textoPdf(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replace(/[→⇒➜]/g, '>')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[^\x20-\xFF\n]/g, '')
}

export default function DocumentoRelatorio({ dados }: { dados: DadosPdf }) {
  const { colunas } = dados
  const celula = (indice: number) => [
    estilos.celula,
    { width: `${colunas[indice].largura}%`, textAlign: colunas[indice].alinhar ?? 'left' } as const,
  ]
  // Zebra só nas linhas de dados; recomeça depois de cada título de grupo.
  let posicao = 0

  return (
    <Document title={textoPdf(dados.titulo)} author="UniVan" creator="UniVan" language="pt-BR">
      <Page size="A4" style={estilos.pagina}>
        {/* Cabeçalho */}
        <View style={estilos.cabecalho}>
          {dados.logo ? <Image src={dados.logo} style={estilos.logo} /> : <Text style={estilos.titulo}>UniVan</Text>}
          <View style={estilos.cabecalhoTexto}>
            <Text style={estilos.titulo}>{textoPdf(dados.titulo)}</Text>
            <Text style={estilos.periodo}>{textoPdf(`Período: ${dados.periodo}`)}</Text>
            <Text style={estilos.gerado}>{textoPdf(`Gerado em ${dados.geradoEm}`)}</Text>
          </View>
        </View>
        {/* Faixa: laranja + marinho, as duas cores da marca */}
        <View style={estilos.faixa}>
          <View style={{ flex: 3, backgroundColor: COR.laranja }} />
          <View style={{ flex: 1, backgroundColor: COR.marinho }} />
        </View>

        {dados.filtros.length > 0 && (
          <View style={estilos.filtros}>
            {dados.filtros.map((f) => (
              <View key={f.rotulo} style={estilos.filtro}>
                <Text style={estilos.filtroRotulo}>{textoPdf(`${f.rotulo}: `)}</Text>
                <Text style={estilos.filtroValor}>{textoPdf(f.valor)}</Text>
              </View>
            ))}
          </View>
        )}

        {dados.indicadores.length > 0 && (
          <View style={estilos.indicadores}>
            {dados.indicadores.map((ind, i) => (
              <View key={ind.rotulo} style={[estilos.indicador, i === dados.indicadores.length - 1 ? { marginRight: 0 } : {}]}>
                <Text style={estilos.indicadorRotulo}>{textoPdf(ind.rotulo)}</Text>
                <Text style={estilos.indicadorValor}>{textoPdf(ind.valor)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* `fixed`: o cabeçalho das colunas se repete em cada página da tabela. */}
        <View style={estilos.linhaCabecalho} fixed>
          {colunas.map((c, i) => (
            <Text key={c.titulo} style={celula(i)}>
              {textoPdf(c.titulo)}
            </Text>
          ))}
        </View>

        {dados.linhas.length === 0 && <Text style={estilos.vazio}>Nenhum registro com esses filtros.</Text>}
        {dados.linhas.map((linha, indice) => {
          if ('grupo' in linha) {
            posicao = 0
            return (
              <View key={`g${indice}`} style={estilos.linhaGrupo} wrap={false} minPresenceAhead={30}>
                <Text style={[estilos.celula, { width: '100%' }]}>{textoPdf(linha.grupo)}</Text>
              </View>
            )
          }
          posicao += 1
          return (
            <View key={indice} style={[estilos.linha, posicao % 2 === 0 ? { backgroundColor: COR.zebra } : {}]} wrap={false}>
              {linha.map((valor, i) => (
                <Text key={i} style={[...celula(i), i === 0 ? { fontFamily: 'Helvetica-Bold', color: COR.titulo } : {}]}>
                  {textoPdf(valor)}
                </Text>
              ))}
            </View>
          )
        })}

        <View style={estilos.rodape} fixed>
          <Text>{textoPdf(`UniVan · ${dados.titulo} · ${dados.periodo}`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
