/**
 * Logo do UniVan (public/univan-logo.png).
 * O arquivo já vem recortado rente ao desenho (chapéu + "Uni" + van), com uma pequena margem,
 * então basta definir a largura: a altura acompanha a proporção da imagem.
 */
export default function Logo({ className = 'w-36' }: { className?: string }) {
  return <img src="/univan-logo.png" alt="UniVan" width={490} height={150} className={`h-auto ${className}`} />
}
