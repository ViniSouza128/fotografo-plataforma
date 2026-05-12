import LegalPage, { LegalList, LegalSection } from '@/components/LegalPage'
import { getPublicStudioConfig, getStudioDisplayName } from '@/lib/publicStudio'

export const metadata = {
  title: 'Politica de Privacidade',
}

export default function PoliticaDePrivacidadePage() {
  const studio = getPublicStudioConfig()
  const name = getStudioDisplayName(studio)

  return (
    <LegalPage
      title="Politica de Privacidade"
      intro={`Como ${name} coleta, usa e protege dados pessoais em cadastros, compras, atendimento e galerias de eventos.`}
    >
      <LegalSection title="1. Controlador dos dados">
        <p>O controlador dos dados e {name}. Os dados de identificacao, documento e contato do estudio aparecem no quadro acima quando estiverem configurados.</p>
      </LegalSection>

      <LegalSection title="2. Dados coletados">
        <LegalList items={[
          'Nome, e-mail, WhatsApp, CPF ou CNPJ, data de nascimento quando informada.',
          'Dados de pedidos, carrinhos, downloads, comentarios, favoritos, curtidas e avaliacoes.',
          'Fotos publicadas em galerias de eventos e solicitacoes de remocao LGPD.',
          'Identificadores tecnicos de pagamento retornados pelos gateways, sem armazenar senhas ou dados completos de cartao.',
        ]} />
      </LegalSection>

      <LegalSection title="3. Finalidades">
        <LegalList items={[
          'Permitir cadastro, autenticacao, compra e acesso aos downloads adquiridos.',
          'Emitir registros fiscais e prestar suporte ao cliente.',
          'Organizar galerias de eventos e permitir que participantes encontrem suas fotos.',
          'Processar pedidos de remocao, correcao, acesso e oposicao previstos pela LGPD.',
        ]} />
      </LegalSection>

      <LegalSection title="4. Bases legais">
        <p>O tratamento pode ocorrer para execucao de contrato, cumprimento de obrigacao legal, legitimo interesse em eventos publicos e consentimento quando solicitado explicitamente.</p>
      </LegalSection>

      <LegalSection title="5. Compartilhamento">
        <p>Dados podem ser compartilhados com gateways de pagamento, meios de contato usados pelo cliente e prestadores essenciais para operar a plataforma. Nao ha compartilhamento com terceiros para marketing independente.</p>
      </LegalSection>

      <LegalSection title="6. Retencao">
        <LegalList items={[
          'Pedidos pagos e registros fiscais podem ser mantidos pelo prazo legal aplicavel.',
          'Pedidos cancelados, carrinhos e logs operacionais podem ser retidos pelo tempo necessario para atendimento, seguranca e auditoria.',
          'Fotos de evento permanecem publicadas enquanto houver finalidade operacional legitima, salvo remocao aceita ou outra decisao do controlador.',
        ]} />
      </LegalSection>

      <LegalSection title="7. Direitos do titular">
        <p>O titular pode solicitar acesso, correcao, eliminacao, portabilidade, informacao sobre compartilhamento e oposicao. Use a pagina de contato ou a area de solicitacoes LGPD quando estiver logado.</p>
      </LegalSection>

      <LegalSection title="8. Seguranca">
        <p>A plataforma usa cookie de sessao httpOnly, senhas com hash e salt, controle de acesso para downloads e protecao dos arquivos originais. Em producao, o uso de HTTPS e obrigatorio.</p>
      </LegalSection>

      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Ultima atualizacao: 2026-05-07.</p>
    </LegalPage>
  )
}
