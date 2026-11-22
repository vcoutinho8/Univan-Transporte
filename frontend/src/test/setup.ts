import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Desmonta o que cada teste renderizou, para um não enxergar a tela do outro.
afterEach(cleanup)
