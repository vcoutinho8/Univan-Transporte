import { Link } from 'react-router-dom'

export default function PaginaNaoEncontrada() {
  return (
    <div className="py-16 text-center">
      <p className="text-6xl font-extrabold text-laranja">404</p>
      <h1 className="mt-4 text-2xl font-extrabold text-marinho">Página não encontrada</h1>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold text-laranja hover:underline">
        Voltar para o painel
      </Link>
    </div>
  )
}
