import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import FormularioMotorista from './DriverForm.tsx'
import type { Motorista } from './types.ts'
import type { Veiculo } from '../veiculo/types.ts'

const VEICULOS_EXEMPLO: Veiculo[] = [
  {
    id: 1,
    fk_empresa: 1,
    placa: 'QJA1B23',
    modelo: 'Sprinter 416',
    cor: 'Branca',
    capacidade: 20,
    status: 'ativo',
    empresa: { id: 1, razao_social: 'Vale Sul', nome_fantasia: 'Vale Sul' },
  },
]

const MOTORISTA_EXEMPLO: Motorista = {
  id: 1,
  fk_empresa: 1,
  fk_veiculo: 1,
  nome: 'Carlos Eduardo Martins',
  apelido: 'Cadu',
  cpf: '12345678909',
  celular: '27991110001',
  cnh: '02650306461',
  cnh_validade: '2030-05-15',
  status: 'ativo',
  veiculo: {
    id: 1,
    placa: 'QJA1B23',
    modelo: 'Sprinter 416',
    cor: 'Branca',
    capacidade: 20,
    status: 'ativo',
  },
}

describe('FormularioMotorista', () => {
  it('preenche campos ao editar motorista existente', () => {
    render(
      <FormularioMotorista
        motorista={MOTORISTA_EXEMPLO}
        veiculos={VEICULOS_EXEMPLO}
        aoSalvar={vi.fn()}
        aoFechar={vi.fn()}
      />,
    )

    expect(screen.getByDisplayValue('Carlos Eduardo Martins')).toBeTruthy()
    expect(screen.getByDisplayValue('Cadu')).toBeTruthy()
    expect(screen.getByDisplayValue('123.456.789-09')).toBeTruthy()
    expect(screen.getByDisplayValue('(27) 99111-0001')).toBeTruthy()
    expect(screen.getByDisplayValue('02650306461')).toBeTruthy()
    expect(screen.getByDisplayValue('2030-05-15')).toBeTruthy()
    expect(screen.getByText('Salvar alterações')).toBeTruthy()
  })

  it('exibe erro ao tentar salvar com CPF inválido', async () => {
    const usuario = userEvent.setup()
    const aoSalvar = vi.fn()

    render(
      <FormularioMotorista
        motorista={null}
        veiculos={VEICULOS_EXEMPLO}
        aoSalvar={aoSalvar}
        aoFechar={vi.fn()}
      />,
    )

    await usuario.type(screen.getByLabelText(/Nome completo/i), 'João da Silva')
    await usuario.type(screen.getByLabelText(/CPF/i), '111.111.111-11')
    await usuario.type(screen.getByLabelText(/Celular/i), '27999998888')
    await usuario.type(screen.getByLabelText(/registro da CNH/i), '02650306461')
    await usuario.type(screen.getByLabelText(/Validade da CNH/i), '2030-01-01')

    await usuario.click(screen.getByRole('button', { name: /Cadastrar motorista/i }))

    expect(screen.getByText(/CPF inválido/i)).toBeTruthy()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('exibe erro ao tentar salvar motorista ativo com CNH vencida', async () => {
    const usuario = userEvent.setup()
    const aoSalvar = vi.fn()

    render(
      <FormularioMotorista
        motorista={null}
        veiculos={VEICULOS_EXEMPLO}
        aoSalvar={aoSalvar}
        aoFechar={vi.fn()}
      />,
    )

    await usuario.type(screen.getByLabelText(/Nome completo/i), 'João da Silva')
    await usuario.type(screen.getByLabelText(/CPF/i), '123.456.789-09')
    await usuario.type(screen.getByLabelText(/Celular/i), '27999998888')
    await usuario.type(screen.getByLabelText(/registro da CNH/i), '02650306461')
    await usuario.type(screen.getByLabelText(/Validade da CNH/i), '2020-01-01')

    await usuario.click(screen.getByRole('button', { name: /Cadastrar motorista/i }))

    expect(screen.getByText(/CNH vencida em/i)).toBeTruthy()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('salva motorista com dados válidos e veículo vinculado', async () => {
    const usuario = userEvent.setup()
    const aoSalvar = vi.fn().mockResolvedValue(undefined)

    render(
      <FormularioMotorista
        motorista={null}
        veiculos={VEICULOS_EXEMPLO}
        aoSalvar={aoSalvar}
        aoFechar={vi.fn()}
      />,
    )

    await usuario.type(screen.getByLabelText(/Nome completo/i), 'Mariana Rios')
    await usuario.type(screen.getByLabelText(/Apelido/i), 'Mari')
    await usuario.type(screen.getByLabelText(/CPF/i), '123.456.789-09')
    await usuario.type(screen.getByLabelText(/Celular/i), '27999887766')
    await usuario.type(screen.getByLabelText(/registro da CNH/i), '02650306461')
    await usuario.type(screen.getByLabelText(/Validade da CNH/i), '2030-10-10')
    await usuario.selectOptions(screen.getByLabelText(/Veículo padrão vinculado/i), '1')

    await usuario.click(screen.getByRole('button', { name: /Cadastrar motorista/i }))

    expect(aoSalvar).toHaveBeenCalledWith({
      nome: 'Mariana Rios',
      apelido: 'Mari',
      cpf: '12345678909',
      celular: '27999887766',
      cnh: '02650306461',
      cnh_validade: '2030-10-10',
      fk_veiculo: 1,
      status: 'ativo',
    })
  })
})
