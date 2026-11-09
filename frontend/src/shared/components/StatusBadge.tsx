import type { StatusCadastro } from '../types/api.ts'

const ESTILOS: Record<StatusCadastro, { rotulo: string; cores: string }> = {
  ativo: { rotulo: 'Ativo', cores: 'bg-emerald-100 text-emerald-700' },
  inativo: { rotulo: 'Inativo', cores: 'bg-slate-200 text-slate-600' },
}

export default function EtiquetaStatus({ status }: { status: StatusCadastro }) {
  const { rotulo, cores } = ESTILOS[status]
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${cores}`}>{rotulo}</span>
}
