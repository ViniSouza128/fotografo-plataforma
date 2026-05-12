import LegalPage, { LegalList, LegalSection } from '@/components/LegalPage'
import { getPublicStudioConfig, getStudioDisplayName } from '@/lib/publicStudio'

export const metadata = {
  title: 'Termos de Uso',
}

export default function TermosDeUsoPage() {
  const studio = getPublicStudioConfig()
  const name = getStudioDisplayName(studio)

  return (
    <LegalPage
      title="Termos de Uso"
      intro={`Condicoes para navegar nas galerias, criar conta, comprar fotos e solicitar atendimento em ${name}.`}
    >
      <LegalSection title="1. Uso da plataforma">
        <p>A plataforma permite visualizar eventos, selecionar fotos, montar carrinho, finalizar compras e acessar downloads autorizados. O usuario deve informar dados corretos e manter sua conta protegida.</p>
      </LegalSection>

      <LegalSection title="2. Compras e acesso">
        <LegalList items={[
          'Os valores exibidos no carrinho e no checkout indicam o preco vigente no momento da compra.',
          'Downloads sao liberados conforme confirmacao de pagamento, liberacao manual ou regra operacional informada no pedido.',
          'Links, tokens e arquivos comprados sao pessoais e nao devem ser compartilhados publicamente.',
        ]} />
      </LegalSection>

      <LegalSection title="3. Direitos autorais">
        <p>As fotos continuam protegidas por direitos autorais do fotografo ou estudio responsavel. A compra autoriza o uso pessoal conforme o produto adquirido, sem transferencia de autoria.</p>
      </LegalSection>

      <LegalSection title="4. Conduta">
        <LegalList items={[
          'E proibido tentar burlar controles de acesso, baixar arquivos sem autorizacao ou usar automacoes abusivas.',
          'Comentarios, avaliacoes e mensagens podem ser moderados quando violarem direitos, privacidade ou a operacao do servico.',
          'Contas podem ser bloqueadas em caso de fraude, abuso ou risco operacional.',
        ]} />
      </LegalSection>

      <LegalSection title="5. Remocoes e privacidade">
        <p>Pedidos de remocao de imagem ou dados pessoais sao avaliados conforme a LGPD, o contexto do evento, os direitos do titular e as obrigacoes legais do controlador.</p>
      </LegalSection>

      <LegalSection title="6. Alteracoes">
        <p>Estes termos podem ser atualizados para refletir mudancas operacionais, legais ou de seguranca. A versao publicada nesta rota e a referencia aplicavel ao uso corrente.</p>
      </LegalSection>

      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Ultima atualizacao: 2026-05-07.</p>
    </LegalPage>
  )
}
