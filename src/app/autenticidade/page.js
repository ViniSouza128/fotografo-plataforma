import LegalPage, { LegalList, LegalSection } from '@/components/LegalPage'
import { getPublicStudioConfig, getStudioDisplayName } from '@/lib/publicStudio'

export const metadata = {
  title: 'Autenticidade',
}

export default function AutenticidadePage() {
  const studio = getPublicStudioConfig()
  const name = getStudioDisplayName(studio)

  return (
    <LegalPage
      title="Autenticidade"
      intro={`Informacoes para reconhecer canais oficiais, compras legitimas e arquivos entregues por ${name}.`}
    >
      <LegalSection title="1. Canal oficial">
        <p>Considere autenticas as galerias, carrinhos, pedidos e downloads acessados por este dominio e pelos contatos exibidos nesta pagina. Em caso de duvida, confirme pela pagina de contato.</p>
      </LegalSection>

      <LegalSection title="2. Pagamentos">
        <LegalList items={[
          'Confira se o link de pagamento veio do checkout ou de atendimento oficial.',
          'Nao informe senha da conta, token de acesso ou codigo de cartao por mensagem.',
          'Pedidos pendentes, pagos, cancelados ou liberados manualmente devem aparecer no painel de compras quando houver conta ou link guest valido.',
        ]} />
      </LegalSection>

      <LegalSection title="3. Arquivos e downloads">
        <p>Downloads autorizados sao liberados apenas depois da regra financeira aplicavel. Arquivos originais e derivados sao protegidos por controle de acesso e nao devem ser redistribuidos como se fossem de outro autor.</p>
      </LegalSection>

      <LegalSection title="4. Suspeita de fraude">
        <p>Se receber cobranca, link ou perfil social suspeito usando o nome do estudio, envie os detalhes pelo formulario de contato para verificacao.</p>
      </LegalSection>
    </LegalPage>
  )
}
