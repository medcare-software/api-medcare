import type { ProfessionalTermsDocument } from '../legal.types.js'

export const PROFESSIONAL_TERMS_CONTENT_VERSION = 'v1-2026-07-25'

export const professionalTermsDocument: ProfessionalTermsDocument = {
  id: 'professional-terms',
  title: 'Termos para profissionais de saúde',
  version: PROFESSIONAL_TERMS_CONTENT_VERSION,
  updatedAt: '2026-07-25',
  shortCommitmentLegalBasis: 'Base legal: Lei nº 13.709/2018 (LGPD), Art. 11, I.',
  shortCommitment: [
    'Meu acesso depende de autorização voluntária do paciente, que pode ser revogada a qualquer momento.',
    'Utilizarei os dados exclusivamente para assistência à saúde do paciente que me autorizou.',
    'Manterei sigilo absoluto sobre todas as informações acessadas.',
    'Não compartilharei os dados com terceiros sem autorização do paciente.',
    'Ativarei e utilizarei obrigatoriamente a autenticação de dois fatores (2FA).',
    'Sou o único responsável por qualquer uso indevido ou vazamento dos dados que acessar.',
    'A MedCare não será responsabilizada por usos indevidos praticados por mim.',
    'O descumprimento pode resultar no bloqueio imediato do meu acesso.',
  ],
  sections: [
    {
      number: '1',
      title: 'Termo de Compromisso e Responsabilidade para Acesso a Dados de Pacientes',
      blocks: [
        {
          kind: 'text',
          text: 'Plataforma MedCare — Portal Médico Web. Pelo presente instrumento, o profissional médico declara estar ciente e assume expressamente as seguintes condições para acesso, consulta e tratamento de dados pessoais de pacientes por meio da plataforma MedCare.',
        },
        { kind: 'subheading', text: '1. Finalidade e base legal do acesso' },
        {
          kind: 'text',
          text: 'O acesso do médico aos dados de pacientes no MedCare destina-se exclusivamente à prestação de assistência à saúde, incluindo consulta a histórico clínico, diagnósticos, exames, medicamentos, vacinas e demais informações de prontuário disponibilizadas pelo paciente ou seu responsável legal. O tratamento de dados sensíveis de saúde realizado pelo médico tem como fundamento o consentimento do titular (Art. 11, I, da Lei nº 13.709/2018 — LGPD), manifestado por meio da geração voluntária de código de acesso temporário pelo próprio paciente ou responsável legal na plataforma.',
        },
        { kind: 'subheading', text: '2. Condição de acesso' },
        {
          kind: 'text',
          text: 'O médico declara estar ciente de que:',
        },
        {
          kind: 'list',
          items: [
            'O acesso aos dados de cada paciente depende exclusivamente da autorização prévia, expressa e voluntária do paciente ou de seu responsável legal, materializada pela geração de código de acesso temporário no aplicativo MedCare;',
            'O código de acesso possui validade definida pelo paciente (24 horas, 7 dias, 30 dias ou permanente), podendo ser revogado a qualquer momento, de forma unilateral e sem necessidade de justificativa, cessando imediatamente o acesso do médico aos respectivos dados;',
            'O médico não possui qualquer direito adquirido de acesso aos dados de pacientes, sendo este um privilégio de acesso condicionado à autorização vigente.',
          ],
        },
        { kind: 'subheading', text: '3. Obrigações do médico' },
        {
          kind: 'text',
          text: 'O médico compromete-se a:',
        },
        {
          kind: 'list',
          items: [
            'Utilizar os dados acessados exclusivamente para os fins clínicos e assistenciais relacionados ao paciente que autorizou o acesso;',
            'Manter sigilo absoluto sobre todas as informações de saúde a que tiver acesso, nos termos do Código de Ética Médica e da LGPD;',
            'Adotar medidas técnicas e organizacionais adequadas para proteger os dados contra acessos não autorizados, vazamentos, perdas ou qualquer outra forma de tratamento inadequado;',
            'Não compartilhar, ceder, transferir ou divulgar os dados a terceiros, salvo quando estritamente necessário para a prestação do serviço de saúde ao paciente e mediante autorização deste;',
            'Não utilizar os dados para finalidades diversas das previstas neste termo, incluindo, mas não se limitando a, pesquisas não autorizadas, atividades comerciais, publicitárias ou de qualquer outra natureza estranha à relação médico-paciente;',
            'Não armazenar cópias dos dados em dispositivos ou sistemas não autorizados, nem mantê-los por prazo superior ao necessário para a finalidade assistencial;',
            'Comunicar imediatamente à MedCare, pelo canal dpo@medcare.com.br, qualquer incidente de segurança, acesso não autorizado, perda ou vazamento de dados de que tenha conhecimento;',
            'Respeitar as políticas de segurança da informação e os controles de acesso implementados na plataforma MedCare.',
          ],
        },
        { kind: 'subheading', text: '4. Obrigatoriedade de autenticação multifator (2FA)' },
        {
          kind: 'text',
          text: 'O médico declara estar ciente de que:',
        },
        {
          kind: 'list',
          items: [
            'O acesso ao Portal Médico Web do MedCare exige, como requisito obrigatório de segurança, a ativação e o uso de autenticação de dois fatores (2FA) na respectiva conta de acesso;',
            'O 2FA deverá ser configurado no primeiro acesso à plataforma, sendo vedado ao médico acessar dados de pacientes enquanto o fator adicional de autenticação não estiver ativo e verificado;',
            'O médico é o único responsável pela guarda e confidencialidade dos seus dispositivos, códigos e fatores de autenticação, respondendo objetivamente por qualquer acesso indevido decorrente de sua negligência quanto a essa obrigação;',
            'Em caso de perda, roubo, extravio ou comprometimento do dispositivo ou fator de autenticação, o médico deverá comunicar imediatamente a MedCare pelo canal dpo@medcare.com.br para bloqueio temporário do acesso e reconfiguração do 2FA;',
            'A MedCare poderá, a qualquer tempo, exigir a reconfiguração ou atualização do método de 2FA como medida de segurança adicional, devendo o médico atender prontamente à solicitação.',
          ],
        },
        { kind: 'subheading', text: '5. Responsabilidade exclusiva do médico' },
        {
          kind: 'text',
          text: 'O médico assume responsabilidade civil, administrativa e penal exclusiva por:',
        },
        {
          kind: 'list',
          items: [
            'Qualquer uso indevido, tratamento inadequado, compartilhamento não autorizado, divulgação indevida ou vazamento de dados de pacientes acessados por meio da plataforma MedCare;',
            'Qualquer tratamento de dados realizado em desacordo com a LGPD, o Código de Ética Médica ou a legislação aplicável;',
            'Decisões clínicas tomadas com base nas informações acessadas, sendo o MedCare mera ferramenta de organização e gestão de dados, não substituindo avaliação médica presencial;',
            'Atos praticados por terceiros que tenham obtido acesso aos dados por ação ou omissão do médico, incluindo, mas não se limitando a, uso não autorizado de dispositivo, compartilhamento de credenciais ou falha na proteção do fator de autenticação multifator.',
          ],
        },
        { kind: 'subheading', text: '6. Exoneração da MedCare' },
        {
          kind: 'text',
          text: 'A MedCare Software Ltda., na qualidade de controladora dos dados perante a LGPD, não será responsabilizada por quaisquer danos, perdas, prejuízos, sanções administrativas ou condenações judiciais decorrentes de:',
        },
        {
          kind: 'list',
          items: [
            'Uso indevido dos dados pelo médico em desacordo com este termo, com a LGPD ou com a legislação aplicável;',
            'Compartilhamento não autorizado ou divulgação indevida de dados praticados pelo médico;',
            'Tratamento de dados realizado pelo médico fora dos limites da autorização concedida pelo paciente;',
            'Descumprimento, pelo médico, de suas obrigações legais e contratuais de proteção de dados pessoais, incluindo a obrigação de manter o 2FA ativo e funcional.',
          ],
        },
        { kind: 'subheading', text: '7. Vigência e revogação' },
        {
          kind: 'text',
          text: 'Este termo entra em vigor na data de sua aceitação pelo médico e permanece válido enquanto o médico mantiver vínculo com a plataforma MedCare, independentemente da vigência de autorizações individuais de pacientes. A revogação de autorizações específicas de pacientes não afeta a validade deste termo, que subsiste enquanto o médico estiver habilitado na plataforma.',
        },
        { kind: 'subheading', text: '8. Disposições gerais' },
        {
          kind: 'list',
          items: [
            'O médico declara ter lido, compreendido e aceito integralmente os Termos de Uso e a Política de Privacidade do MedCare, disponíveis na plataforma;',
            'O descumprimento de qualquer cláusula deste termo poderá acarretar o bloqueio imediato do acesso do médico à plataforma, sem prejuízo das demais sanções legais cabíveis;',
            'Este termo é regido pelas leis da República Federativa do Brasil.',
          ],
        },
        { kind: 'subheading', text: 'Versão curta — para aceite na plataforma' },
        {
          kind: 'list',
          items: [
            'Meu acesso depende de autorização voluntária do paciente, que pode ser revogada a qualquer momento.',
            'Utilizarei os dados exclusivamente para assistência à saúde do paciente que me autorizou.',
            'Manterei sigilo absoluto sobre todas as informações acessadas.',
            'Não compartilharei os dados com terceiros sem autorização do paciente.',
            'Ativarei e utilizarei obrigatoriamente a autenticação de dois fatores (2FA).',
            'Sou o único responsável por qualquer uso indevido ou vazamento dos dados que acessar.',
            'A MedCare não será responsabilizada por usos indevidos praticados por mim.',
            'O descumprimento pode resultar no bloqueio imediato do meu acesso.',
          ],
        },
        {
          kind: 'text',
          text: 'Base legal: Lei nº 13.709/2018 (LGPD), Art. 11, I.',
        },
      ],
    },
    {
      number: '2',
      title: 'Política de Segurança da Informação para Profissionais Médicos',
      blocks: [
        {
          kind: 'text',
          text: 'Plataforma MedCare — Portal Médico Web.',
        },
        { kind: 'subheading', text: '1. Objetivo' },
        {
          kind: 'text',
          text: 'Esta política estabelece as diretrizes de segurança da informação que devem ser observadas por todos os profissionais médicos que acessam dados de pacientes por meio do Portal Médico Web do MedCare. O descumprimento destas diretrizes sujeita o médico ao bloqueio imediato do acesso e às demais sanções previstas no Termo de Compromisso e Responsabilidade.',
        },
        { kind: 'subheading', text: '2. Controle de acesso e autenticação' },
        {
          kind: 'list',
          items: [
            '2.1. O acesso ao Portal Médico Web exige autenticação de dois fatores (2FA) obrigatória, nos termos da cláusula 4 do Termo de Compromisso e Responsabilidade.',
            '2.2. O médico não deve compartilhar suas credenciais de acesso (login, senha, código 2FA, token ou dispositivo de autenticação) com qualquer outra pessoa, sob nenhuma circunstância.',
            '2.3. O médico deve encerrar a sessão ao finalizar o uso do portal e não deve manter sessões abertas em dispositivos compartilhados ou públicos.',
            '2.4. Em caso de suspeita de comprometimento de credenciais, o médico deve comunicar imediatamente a MedCare pelo canal dpo@medcare.com.br e solicitar o bloqueio temporário do acesso.',
          ],
        },
        { kind: 'subheading', text: '3. Uso de dispositivos e redes' },
        {
          kind: 'list',
          items: [
            '3.1. O acesso ao Portal Médico Web deve ser realizado preferencialmente a partir de dispositivos corporativos ou pessoais com software de segurança atualizado (antivírus, firewall, sistema operacional com patches de segurança).',
            '3.2. É vedado o acesso ao portal a partir de dispositivos públicos, compartilhados ou não confiáveis (lan houses, terminais de uso coletivo, computadores de terceiros sem controle de segurança).',
            '3.3. O médico deve evitar o uso de redes Wi-Fi públicas ou não seguras para acessar o portal. Quando inevitável, deve utilizar obrigatoriamente uma rede privada virtual (VPN) de confiança.',
          ],
        },
        { kind: 'subheading', text: '4. Tratamento e armazenamento de dados' },
        {
          kind: 'list',
          items: [
            '4.1. O médico não deve realizar download, cópia, captura de tela, impressão ou armazenamento local de dados de pacientes acessados via MedCare, salvo quando estritamente necessário para a prestação do serviço de saúde e mediante autorização do paciente.',
            '4.2. Quando o download for inevitável (ex.: impressão de receituário para entrega ao paciente), o médico deve eliminar o arquivo ou documento imediatamente após o uso, não mantendo cópias em dispositivos, nuvens pessoais ou sistemas não autorizados.',
            '4.3. É vedado o envio de dados de pacientes acessados via MedCare por meio de canais não seguros (e-mail pessoal, WhatsApp, SMS, aplicativos de mensagem sem criptografia de ponta a ponta), salvo quando expressamente autorizado pelo paciente e em conformidade com a LGPD.',
            '4.4. O médico deve utilizar o próprio MedCare como repositório central dos dados clínicos, evitando a criação de registros paralelos em sistemas externos não autorizados pela plataforma.',
          ],
        },
        { kind: 'subheading', text: '5. Comunicação de incidentes' },
        {
          kind: 'text',
          text: '5.1. O médico deve comunicar à MedCare, pelo canal dpo@medcare.com.br, em prazo máximo de 24 horas a contar do conhecimento, qualquer incidente de segurança envolvendo dados de pacientes acessados via plataforma, incluindo:',
        },
        {
          kind: 'list',
          items: [
            'Perda, roubo ou extravio de dispositivo utilizado para acesso;',
            'Acesso não autorizado à conta por terceiros;',
            'Envio acidental de dados a destinatário incorreto;',
            'Qualquer outra situação que possa comprometer a confidencialidade, integridade ou disponibilidade dos dados.',
          ],
        },
        {
          kind: 'text',
          text: '5.2. A comunicação deve conter, no mínimo: descrição do incidente, data e hora do ocorrido, dados potencialmente afetados e medidas já adotadas.',
        },
        { kind: 'subheading', text: '6. Atualizações e treinamento' },
        {
          kind: 'list',
          items: [
            '6.1. O médico compromete-se a manter seus dados cadastrais atualizados na plataforma MedCare, especialmente e-mail e telefone de contato.',
            '6.2. A MedCare poderá, a qualquer tempo, exigir a reconfiguração do 2FA ou a adoção de novas medidas de segurança, devendo o médico atendê-las prontamente.',
            '6.3. Recomenda-se que o médico realize treinamentos periódicos sobre LGPD e segurança da informação aplicados à prática clínica.',
          ],
        },
        { kind: 'subheading', text: '7. Sanções' },
        {
          kind: 'text',
          text: 'O descumprimento de qualquer diretriz desta política poderá acarretar, sem prejuízo das demais sanções legais:',
        },
        {
          kind: 'list',
          items: [
            'Bloqueio temporário ou definitivo do acesso do médico ao Portal Médico Web;',
            'Comunicação ao Conselho Regional de Medicina (CRM);',
            'Responsabilização civil, administrativa e penal nos termos da LGPD e da legislação aplicável.',
          ],
        },
      ],
    },
  ],
}
