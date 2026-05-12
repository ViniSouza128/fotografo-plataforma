import LegalPage, { LegalList, LegalSection } from '@/components/LegalPage'

export const metadata = {
  title: 'Politica de Cookies',
}

export default function PoliticaDeCookiesPage() {
  return (
    <LegalPage
      title="Politica de Cookies"
      intro="Como a plataforma usa cookies e armazenamento local para sessao, carrinho, compras de visitante e preferencias essenciais."
    >
      <LegalSection title="1. Cookies essenciais">
        <p>A plataforma usa cookie de autenticacao httpOnly para manter a sessao de clientes e administradores. Esse cookie e necessario para login, area do cliente, area administrativa e downloads autorizados.</p>
      </LegalSection>

      <LegalSection title="2. Armazenamento local">
        <LegalList items={[
          'Carrinho do navegador, inclusive fluxo de visitante.',
          'Indicadores de sessao usados pela interface para atualizar menus e atalhos.',
          'Historico local de compras guest quando o usuario finaliza sem conta.',
          'Preferencias visuais ou filtros temporarios quando aplicavel.',
        ]} />
      </LegalSection>

      <LegalSection title="3. Pagamentos e terceiros">
        <p>Gateways de pagamento podem usar seus proprios cookies ou identificadores tecnicos durante o checkout. Esses recursos seguem as politicas dos respectivos provedores.</p>
      </LegalSection>

      <LegalSection title="4. Como gerenciar">
        <p>O usuario pode limpar cookies e armazenamento local no navegador. Ao fazer isso, pode perder sessao ativa, carrinho local e acesso facil a compras feitas como visitante neste dispositivo.</p>
      </LegalSection>

      <LegalSection title="5. O que nao fazemos">
        <p>Esta plataforma nao depende de cookies de publicidade comportamental para vender fotos, nem compartilha dados com terceiros para marketing independente.</p>
      </LegalSection>

      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Ultima atualizacao: 2026-05-07.</p>
    </LegalPage>
  )
}
