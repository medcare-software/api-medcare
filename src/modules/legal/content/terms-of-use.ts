import type { LegalDocument } from '../legal.types.js'

export const CONSUMER_TERMS_VERSION = 'v1-2026-06'

export const termsOfUseDocument: LegalDocument = {
  id: 'terms-of-use',
  title: 'Termos de Uso',
  version: CONSUMER_TERMS_VERSION,
  updatedAt: '2026-06',
  sections: [
    {
      number: '1',
      title: 'Aceitação dos Termos',
      blocks: [
        {
          kind: 'text',
          text: 'Ao baixar, instalar ou utilizar o aplicativo MedCare, você concorda com estes Termos de Uso. Caso não concorde com qualquer disposição, não utilize o aplicativo.',
        },
      ],
    },
    {
      number: '2',
      title: 'Sobre o MedCare',
      blocks: [
        {
          kind: 'text',
          text: 'O MedCare é um aplicativo de gestão de saúde familiar que permite o registro e acompanhamento de medicamentos, vacinas, exames e histórico clínico de usuários e seus familiares. O app também possibilita o compartilhamento de informações de saúde com profissionais médicos mediante autorização expressa do usuário.',
        },
        {
          kind: 'text',
          text: 'O MedCare não é um serviço médico, não substitui consultas presenciais, diagnósticos ou prescrições realizadas por profissionais de saúde habilitados.',
        },
      ],
    },
    {
      number: '3',
      title: 'Cadastro e Conta',
      blocks: [
        {
          kind: 'list',
          items: [
            '3.1 Para utilizar o MedCare, é necessário criar uma conta com informações verdadeiras, precisas e atualizadas.',
            '3.2 Você é responsável pela confidencialidade de suas credenciais e por todas as atividades realizadas em sua conta.',
            '3.3 O cadastro de menores de 18 anos deve ser realizado por um responsável legal, que assumirá plena responsabilidade pelo uso.',
            '3.4 É vedado criar contas falsas, utilizar identidade de terceiros ou fornecer informações incorretas.',
          ],
        },
      ],
    },
    {
      number: '4',
      title: 'Perfis de Uso',
      blocks: [
        { kind: 'text', text: 'O MedCare oferece diferentes perfis de acesso:' },
        {
          kind: 'list',
          items: [
            { bold: 'Administrador da Família:', text: 'acesso completo à gestão familiar' },
            { bold: 'Membro da Família:', text: 'acesso restrito às próprias informações' },
            { bold: 'Cuidador:', text: 'acesso às famílias para as quais foi autorizado' },
            {
              bold: 'Médico:',
              text: 'acesso ao prontuário de pacientes mediante código de autorização temporário, condicionado à aceitação prévia do Termo de Compromisso e Responsabilidade para Acesso a Dados de Pacientes, disponível no Portal Médico Web',
            },
          ],
        },
        {
          kind: 'text',
          text: 'Cada perfil possui permissões específicas. O usuário é responsável pelo uso adequado do perfil que lhe foi atribuído.',
        },
      ],
    },
    {
      number: '5',
      title: 'Compartilhamento com Médicos',
      blocks: [
        {
          kind: 'list',
          items: [
            '5.1 O compartilhamento de dados de saúde com médicos ocorre exclusivamente mediante geração de código de acesso pelo próprio usuário.',
            '5.2 O código possui validade definida pelo usuário (24 horas, 7 dias, 30 dias ou permanente) e pode ser revogado a qualquer momento.',
            '5.3 O MedCare não compartilha dados com médicos ou clínicas sem autorização expressa do titular ou responsável.',
            '5.4 O profissional de saúde que acessa os dados mediante código fornecido pelo usuário atua como Controlador Independente, sendo exclusivamente responsável pelo sigilo profissional e pela guarda dos dados acessados, nos termos do Código de Ética Médica e da LGPD.',
          ],
        },
      ],
    },
    {
      number: '6',
      title: 'Uso Permitido',
      blocks: [
        {
          kind: 'text',
          text: 'O usuário compromete-se a utilizar o MedCare exclusivamente para fins lícitos, sendo vedado:',
        },
        {
          kind: 'list',
          items: [
            'Inserir informações falsas ou enganosas sobre saúde',
            'Utilizar o app para fins comerciais não autorizados',
            'Tentar acessar dados de outros usuários sem permissão',
            'Realizar engenharia reversa ou decompilação do aplicativo',
            'Utilizar o app de forma que prejudique outros usuários ou a infraestrutura do serviço',
          ],
        },
      ],
    },
    {
      number: '7',
      title: 'Limitação de Responsabilidade',
      blocks: [
        {
          kind: 'list',
          items: [
            '7.1 O MedCare é uma ferramenta de organização e não se responsabiliza por decisões médicas tomadas com base nas informações registradas.',
            '7.2 Não nos responsabilizamos por falhas decorrentes de uso inadequado, perda de acesso por esquecimento de senha, ou danos causados por terceiros.',
            '7.3 O serviço é fornecido "como está", podendo estar sujeito a interrupções programadas ou não para manutenção.',
            '7.4 A MEDCARE não será responsabilizada por: (i) falhas na infraestrutura tecnológica, rede de dados ou hardware do Hospital ou instituição de saúde onde o usuário se encontre; (ii) acessos realizados por profissionais de saúde que utilizem o código de autorização fornecido pelo usuário; (iii) decisões clínicas, diagnósticos ou prescrições, sendo o aplicativo meramente um repositório de informações sob gestão do titular.',
          ],
        },
      ],
    },
    {
      number: '8',
      title: 'Propriedade Intelectual',
      blocks: [
        {
          kind: 'text',
          text: 'Todo o conteúdo do MedCare — incluindo marca, logotipo, design, código-fonte e funcionalidades — é de propriedade exclusiva da MedCare e protegido pelas leis brasileiras de propriedade intelectual. É vedada a reprodução, cópia ou distribuição sem autorização prévia.',
        },
      ],
    },
    {
      number: '9',
      title: 'Modificações',
      blocks: [
        {
          kind: 'text',
          text: 'O MedCare reserva-se o direito de alterar estes Termos a qualquer momento. Alterações relevantes serão comunicadas por notificação no app ou por e-mail com antecedência mínima de 15 dias. O uso continuado após a notificação implica aceitação dos novos termos.',
        },
      ],
    },
    {
      number: '10',
      title: 'Cancelamento e Encerramento',
      blocks: [
        {
          kind: 'list',
          items: [
            '10.1 O usuário pode encerrar sua conta a qualquer momento pelas configurações do aplicativo.',
            '10.2 O MedCare pode suspender ou encerrar contas que violem estes Termos, sem aviso prévio em casos graves.',
            '10.3 Após o encerramento, os dados serão retidos pelo prazo legal aplicável e então eliminados conforme a Política de Privacidade.',
          ],
        },
      ],
    },
    {
      number: '11',
      title: 'Foro e Lei Aplicável',
      blocks: [
        {
          kind: 'text',
          text: 'Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias.',
        },
      ],
    },
  ],
}
