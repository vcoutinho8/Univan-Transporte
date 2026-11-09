/**
 * Logo do UniVan (public/univan-logo-removebg.png).
 * O PNG é quadrado (500x500) e tem bastante margem transparente. O recorte abaixo mostra só o
 * desenho (chapéu + "Uni" + van), que ocupa a faixa x 10–492 / y 178–314 da imagem original,
 * mantendo a proporção em qualquer largura.
 */
export default function Logo({ className = 'w-36' }: { className?: string }) {
  return (
    <div className={`relative aspect-[482/136] overflow-hidden ${className}`}>
      <img
        src="/univan-logo-removebg.png"
        alt="UniVan"
        className="absolute max-w-none"
        style={{ width: '103.73%', top: '-130.9%', left: '-2.07%' }}
      />
    </div>
  )
}
