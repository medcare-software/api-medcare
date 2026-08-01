import type { LegalDocument } from '../legal.types.js'
import { CONSUMER_TERMS_VERSION } from './terms-of-use.js'

export const privacyPolicyDocument: LegalDocument = {
  id: 'privacy-policy',
  title: 'Política de Privacidade',
  version: CONSUMER_TERMS_VERSION,
  updatedAt: '2026-06',
  sections: [
    {
      number: '1',
      title: 'Introdução',
      blocks: [
        {
          kind: 'text',
          text: 'A MedCare respeita sua privacidade e está comprometida com a proteção dos seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018) e demais legislações aplicáveis. Esta Política descreve quais dados coletamos, como utilizamos, com quem compartilhamos e quais são seus direitos.',
        },
      ],
    },
    {
      number: '2',
      title: 'Dados que Coletamos',
      blocks: [
        { kind: 'subheading', text: '2.1 Dados fornecidos pelo usuário' },
        {
          kind: 'list',
          items: [
            'Nome completo, data de nascimento, sexo biológico',
            'E-mail e telefone',
            'Dados de saúde: medicamentos, vacinas, exames, diagnósticos, alergias, condições clínicas, tipo sanguíneo, peso e altura',
            'Comprovantes e arquivos enviados (laudos, receitas, carteirinhas)',
          ],
        },
        { kind: 'subheading', text: '2.2 Dados coletados automaticamente' },
        {
          kind: 'list',
          items: [
            'Dados de uso e navegação no app (telas acessadas, funcionalidades utilizadas)',
            'Informações do dispositivo (modelo, sistema operacional, versão do app)',
            'Endereço IP e dados de conexão — data e hora de acesso',
          ],
        },
        { kind: 'subheading', text: '2.3 Dados de terceiros' },
        {
          kind: 'list',
          items: [
            'Exames importados via Gmail (apenas com autorização expressa do usuário)',
            'Informações inseridas por médicos ou cuidadores autorizados',
          ],
        },
      ],
    },
    {
      number: '3',
      title: 'Finalidade do Tratamento',
      blocks: [
        { kind: 'text', text: 'Utilizamos seus dados para:' },
        {
          kind: 'list',
          items: [
            'Fornecer e operar as funcionalidades do aplicativo',
            'Enviar notificações de medicamentos, vacinas e lembretes de saúde',
            'Compartilhar informações com médicos autorizados pelo usuário',
            'Importar exames automaticamente via Gmail (quando autorizado)',
            'Melhorar a experiência e desenvolver novas funcionalidades',
            'Cumprir obrigações legais e regulatórias',
            'Prevenir fraudes e garantir a segurança do serviço',
          ],
        },
      ],
    },
    {
      number: '4',
      title: 'Base Legal (LGPD)',
      blocks: [
        {
          kind: 'list',
          items: [
            { bold: 'Consentimento (Art. 7º, I):', text: 'para dados de saúde e funcionalidades opcionais' },
            { bold: 'Execução de contrato (Art. 7º, V):', text: 'para operação do serviço contratado' },
            { bold: 'Legítimo interesse (Art. 7º, IX):', text: 'para melhoria do serviço e segurança' },
            { bold: 'Cumprimento de obrigação legal (Art. 7º, II):', text: 'quando exigido por lei' },
          ],
        },
        {
          kind: 'text',
          text: 'Por envolver dados sensíveis de saúde (Art. 11 da LGPD), o consentimento é coletado de forma específica, destacada e informada.',
        },
      ],
    },
    {
      number: '5',
      title: 'Compartilhamento de Dados',
      blocks: [
        {
          kind: 'text',
          text: 'Seus dados nunca são vendidos. Compartilhamos apenas nas seguintes situações:',
        },
        {
          kind: 'table',
          headers: ['Com quem', 'Por quê'],
          rows: [
            ['Médicos e clínicas', 'Apenas quando o usuário autoriza via código de acesso'],
            ['Provedores de infraestrutura', 'Hospedagem e armazenamento seguro dos dados'],
            ['Serviços de notificação', 'Envio de push notifications'],
            ['Google (Gmail)', 'Importação de exames, somente quando autorizado'],
            ['Autoridades competentes', 'Quando exigido por lei ou ordem judicial'],
          ],
        },
      ],
    },
    {
      number: '6',
      title: 'Armazenamento e Segurança',
      blocks: [
        {
          kind: 'list',
          items: [
            '6.1 Dados armazenados com criptografia em trânsito (TLS) e em repouso (AES-256).',
            '6.2 Acesso interno restrito por perfis de permissão e monitorado por logs de auditoria.',
            '6.3 Práticas de segurança alinhadas às melhores referências do mercado, incluindo autenticação em dois fatores para acessos administrativos.',
            '6.4 Em caso de incidente, a ANPD e os usuários afetados serão notificados dentro dos prazos legais.',
          ],
        },
      ],
    },
    {
      number: '7',
      title: 'Retenção dos Dados',
      blocks: [
        {
          kind: 'table',
          headers: ['Situação', 'Prazo de retenção'],
          rows: [
            ['Conta ativa', 'Enquanto durar o uso do serviço'],
            ['Após encerramento da conta', 'Até 5 anos (obrigações legais)'],
            ['Dados de saúde', 'Mínimo de 20 anos conforme CFM'],
            ['Logs de acesso', '6 meses (Marco Civil da Internet)'],
          ],
        },
        { kind: 'text', text: 'Após os prazos, os dados são eliminados de forma segura e definitiva.' },
      ],
    },
    {
      number: '8',
      title: 'Seus Direitos (LGPD — Art. 18)',
      blocks: [
        { kind: 'text', text: 'Você tem direito a, a qualquer momento:' },
        {
          kind: 'list',
          items: [
            { bold: 'Confirmar', text: 'se tratamos seus dados' },
            { bold: 'Acessar', text: 'uma cópia dos seus dados' },
            { bold: 'Corrigir', text: 'dados incompletos ou desatualizados' },
            { bold: 'Eliminar', text: 'dados desnecessários ou tratados com consentimento' },
            { bold: 'Portabilidade', text: 'dos seus dados para outro serviço' },
            { bold: 'Revogar o consentimento', text: 'a qualquer momento' },
            { bold: 'Informações', text: 'sobre compartilhamentos realizados' },
            { bold: 'Opor-se', text: 'ao tratamento em casos de descumprimento da LGPD' },
          ],
        },
        {
          kind: 'contact',
          lines: [
            {
              label: 'Para exercer seus direitos (respondemos em até 15 dias úteis):',
              email: 'privacidade@medcare.com.br',
            },
          ],
        },
      ],
    },
    {
      number: '9',
      title: 'Cookies e Tecnologias de Rastreamento',
      blocks: [
        {
          kind: 'text',
          text: 'O app utiliza tecnologias de análise de uso (como Firebase Analytics) para entender como os usuários interagem com o aplicativo e melhorar a experiência. Esses dados são anonimizados e não identificam você individualmente.',
        },
      ],
    },
    {
      number: '10',
      title: 'Dados de Menores',
      blocks: [
        {
          kind: 'text',
          text: 'O MedCare permite o cadastro de menores de 18 anos apenas por responsáveis legais. Não coletamos dados de menores diretamente. O responsável é integralmente responsável pelas informações inseridas.',
        },
      ],
    },
    {
      number: '11',
      title: 'Transferência Internacional',
      blocks: [
        {
          kind: 'text',
          text: 'Alguns provedores de infraestrutura podem armazenar dados em servidores fora do Brasil. Nesses casos, garantimos que as transferências cumprem os requisitos da LGPD e que os provedores adotam nível adequado de proteção.',
        },
      ],
    },
    {
      number: '12',
      title: 'Encarregado de Dados (DPO)',
      blocks: [
        {
          kind: 'contact',
          lines: [{ label: 'Nosso Encarregado de Proteção de Dados:', email: 'dpo@medcare.com.br' }],
        },
      ],
    },
    {
      number: '13',
      title: 'Alterações desta Política',
      blocks: [
        {
          kind: 'text',
          text: 'Podemos atualizar esta Política periodicamente. Notificaremos alterações relevantes pelo app ou por e-mail. A data de "última atualização" no topo do documento reflete sempre a versão mais recente.',
        },
      ],
    },
    {
      number: '14',
      title: 'Contato',
      blocks: [
        {
          kind: 'contact',
          lines: [
            { email: 'contato@medcare.com.br' },
            { email: 'privacidade@medcare.com.br' },
          ],
        },
      ],
    },
  ],
}
