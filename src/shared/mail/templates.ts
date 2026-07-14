export function passwordResetCodeTemplate(code: string, ttlMinutes: number) {
  return {
    subject: 'Código para redefinir sua senha — Medcare',
    text: `Seu código para redefinir a senha é ${code}. Ele expira em ${ttlMinutes} minutos. Se você não solicitou isso, ignore este e-mail.`,
    html: `
      <p>Seu código para redefinir a senha é:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
      <p>Ele expira em ${ttlMinutes} minutos.</p>
      <p>Se você não solicitou isso, ignore este e-mail.</p>
    `,
  }
}

export function familyMemberActivationLinkTemplate(link: string, memberName: string) {
  return {
    subject: 'Você foi adicionado a uma família no Medcare — defina sua senha',
    text: `Olá, ${memberName}! Você foi cadastrado como membro de uma família no Medcare. Para acessar o app, abra o link abaixo no seu celular (com o app Medcare instalado) e defina sua senha: ${link}\nSe você não esperava este e-mail, ignore-o.`,
    html: `
      <p>Olá, ${memberName}!</p>
      <p>Você foi cadastrado como membro de uma família no Medcare.</p>
      <p>Para acessar o app, toque no botão abaixo no seu celular (com o app Medcare instalado) e defina sua senha:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Definir minha senha</a></p>
      <p>Se o botão não funcionar, copie e cole este link no seu celular: ${link}</p>
      <p>Se você não esperava este e-mail, ignore-o.</p>
    `,
  }
}

export function doctorWelcomeTemplate(name: string, temporaryPassword: string) {
  return {
    subject: 'Bem-vindo ao Medcare — defina seu acesso',
    text: `Olá, ${name}! Você foi cadastrado no Medcare. Sua senha temporária é ${temporaryPassword}. Faça login e altere sua senha o quanto antes.`,
    html: `
      <p>Olá, ${name}!</p>
      <p>Você foi cadastrado no Medcare.</p>
      <p>Sua senha temporária é:</p>
      <p style="font-size:22px;font-weight:bold;">${temporaryPassword}</p>
      <p>Faça login e altere sua senha assim que possível.</p>
    `,
  }
}

export function caregiverInviteCodeTemplate(code: string, ttlMinutes: number, familyName: string) {
  return {
    subject: 'Convite para acompanhar uma família — Medcare',
    text: `Você foi convidado a ser cuidador da família "${familyName}" no Medcare. Seu código de acesso é ${code}. Ele expira em ${ttlMinutes} minutos. Se você não esperava este convite, ignore este e-mail.`,
    html: `
      <p>Você foi convidado a ser cuidador da família <strong>${familyName}</strong> no Medcare.</p>
      <p>Seu código de acesso é:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
      <p>Ele expira em ${ttlMinutes} minutos.</p>
      <p>Se você não esperava este convite, ignore este e-mail.</p>
    `,
  }
}
