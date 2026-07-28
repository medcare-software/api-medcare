const NOREPLY_TEXT =
  '\n\n—\nEste é um e-mail automático. Não responda (noreply).'

const NOREPLY_HTML = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;" />
  <p style="font-size:12px;color:#6b7280;">Este é um e-mail automático. Não responda (noreply).</p>
`

function withNoreply(content: { subject: string; text: string; html: string }) {
  return {
    subject: content.subject,
    text: `${content.text}${NOREPLY_TEXT}`,
    html: `${content.html}${NOREPLY_HTML}`,
  }
}

export function passwordResetCodeTemplate(code: string, ttlMinutes: number) {
  return withNoreply({
    subject: 'Código para redefinir sua senha — Medcare',
    text: `Seu código para redefinir a senha é ${code}. Ele expira em ${ttlMinutes} minutos. Se você não solicitou isso, ignore este e-mail.`,
    html: `
      <p>Seu código para redefinir a senha é:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
      <p>Ele expira em ${ttlMinutes} minutos.</p>
      <p>Se você não solicitou isso, ignore este e-mail.</p>
    `,
  })
}

export function familyMemberActivationLinkTemplate(link: string, memberName: string) {
  return withNoreply({
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
  })
}

export function doctorTemporaryPasswordTemplate(
  doctorName: string,
  temporaryPassword: string,
  loginUrl: string,
) {
  return withNoreply({
    subject: 'Bem-vindo ao Medcare — sua senha de acesso',
    text: `Olá, ${doctorName}! Você foi cadastrado como médico no Medcare. Sua senha temporária é ${temporaryPassword}. Acesse o portal em ${loginUrl}. Você pode manter essa senha ou alterá-la pelo fluxo "Esqueci a senha". Se você não esperava este e-mail, ignore-o.`,
    html: `
      <p>Olá, ${doctorName}!</p>
      <p>Você foi cadastrado como médico no Medcare.</p>
      <p>Sua senha temporária é:</p>
      <p style="font-size:22px;font-weight:bold;letter-spacing:1px;">${temporaryPassword}</p>
      <p>Acesse o portal médico: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Você pode manter essa senha ou alterá-la pelo fluxo &ldquo;Esqueci a senha&rdquo;.</p>
      <p>Se você não esperava este e-mail, ignore-o.</p>
    `,
  })
}

export function clinicAdminTemporaryPasswordTemplate(
  adminName: string,
  temporaryPassword: string,
  loginUrl: string,
) {
  return withNoreply({
    subject: 'Bem-vindo ao Medcare — sua senha de acesso',
    text: `Olá, ${adminName}! Você foi cadastrado como administrador de clínica no Medcare. Sua senha temporária é ${temporaryPassword}. Acesse o painel em ${loginUrl}. Você pode manter essa senha ou alterá-la pelo fluxo "Esqueci a senha". Se você não esperava este e-mail, ignore-o.`,
    html: `
      <p>Olá, ${adminName}!</p>
      <p>Você foi cadastrado como administrador de clínica no Medcare.</p>
      <p>Sua senha temporária é:</p>
      <p style="font-size:22px;font-weight:bold;letter-spacing:1px;">${temporaryPassword}</p>
      <p>Acesse o painel da clínica: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Você pode manter essa senha ou alterá-la pelo fluxo &ldquo;Esqueci a senha&rdquo;.</p>
      <p>Se você não esperava este e-mail, ignore-o.</p>
    `,
  })
}

/** Conta já existente (ex.: app) que ganhou perfil médico/clínica — não sobrescreve a senha. */
export function professionalPortalAccessGrantedTemplate(
  name: string,
  roleLabel: string,
  loginUrl: string,
) {
  return withNoreply({
    subject: 'Acesso liberado ao portal Medcare',
    text: `Olá, ${name}! Seu acesso como ${roleLabel} no Medcare foi liberado. Entre em ${loginUrl} com a senha atual da sua conta. Se não lembrar, use "Esqueci a senha". Se você não esperava este e-mail, ignore-o.`,
    html: `
      <p>Olá, ${name}!</p>
      <p>Seu acesso como <strong>${roleLabel}</strong> no Medcare foi liberado.</p>
      <p>Acesse: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Use a senha atual da sua conta. Se não lembrar, utilize o fluxo &ldquo;Esqueci a senha&rdquo;.</p>
      <p>Se você não esperava este e-mail, ignore-o.</p>
    `,
  })
}

/** @deprecated Prefer doctorTemporaryPasswordTemplate — mantido só se algum caller legado ainda importar. */
export function doctorActivationLinkTemplate(link: string, doctorName: string) {
  return withNoreply({
    subject: 'Bem-vindo ao Medcare — defina sua senha',
    text: `Olá, ${doctorName}! Você foi cadastrado como médico no Medcare. Para acessar o portal médico, abra o link abaixo e defina sua senha: ${link}\nSe você não esperava este e-mail, ignore-o.`,
    html: `
      <p>Olá, ${doctorName}!</p>
      <p>Você foi cadastrado como médico no Medcare.</p>
      <p>Para acessar o portal médico, toque no botão abaixo e defina sua senha:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Definir minha senha</a></p>
      <p>Se o botão não funcionar, copie e cole este link no navegador: ${link}</p>
      <p>Se você não esperava este e-mail, ignore-o.</p>
    `,
  })
}

/** @deprecated Prefer clinicAdminTemporaryPasswordTemplate */
export function clinicAdminActivationLinkTemplate(link: string, adminName: string) {
  return withNoreply({
    subject: 'Bem-vindo ao Medcare — defina sua senha',
    text: `Olá, ${adminName}! Você foi cadastrado como administrador de clínica no Medcare. Para acessar o painel da clínica, abra o link abaixo e defina sua senha: ${link}\nSe você não esperava este e-mail, ignore-o.`,
    html: `
      <p>Olá, ${adminName}!</p>
      <p>Você foi cadastrado como administrador de clínica no Medcare.</p>
      <p>Para acessar o painel da clínica, toque no botão abaixo e defina sua senha:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Definir minha senha</a></p>
      <p>Se o botão não funcionar, copie e cole este link no navegador: ${link}</p>
      <p>Se você não esperava este e-mail, ignore-o.</p>
    `,
  })
}

export function employeeActivationLinkTemplate(link: string, employeeName: string) {
  return withNoreply({
    subject: 'Bem-vindo ao Medcare — defina sua senha',
    text: `Olá, ${employeeName}! Você foi cadastrado como funcionário no Medcare. Para acessar a plataforma, abra o link abaixo e defina sua senha: ${link}\nSe você não esperava este e-mail, ignore-o.`,
    html: `
      <p>Olá, ${employeeName}!</p>
      <p>Você foi cadastrado como funcionário no Medcare.</p>
      <p>Para acessar a plataforma, toque no botão abaixo e defina sua senha:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Definir minha senha</a></p>
      <p>Se o botão não funcionar, copie e cole este link no navegador: ${link}</p>
      <p>Se você não esperava este e-mail, ignore-o.</p>
    `,
  })
}

export function accountWelcomeTemplate(name: string, temporaryPassword: string) {
  return withNoreply({
    subject: 'Bem-vindo ao Medcare — defina seu acesso',
    text: `Olá, ${name}! Você foi cadastrado no Medcare. Sua senha temporária é ${temporaryPassword}. Faça login e altere sua senha o quanto antes.`,
    html: `
      <p>Olá, ${name}!</p>
      <p>Você foi cadastrado no Medcare.</p>
      <p>Sua senha temporária é:</p>
      <p style="font-size:22px;font-weight:bold;">${temporaryPassword}</p>
      <p>Faça login e altere sua senha assim que possível.</p>
    `,
  })
}

export function caregiverInviteCodeTemplate(code: string, ttlMinutes: number, familyName: string) {
  return withNoreply({
    subject: 'Convite para acompanhar uma família — Medcare',
    text: `Você foi convidado a ser cuidador da família "${familyName}" no Medcare. Seu código de acesso é ${code}. Ele expira em ${ttlMinutes} minutos. Se você não esperava este convite, ignore este e-mail.`,
    html: `
      <p>Você foi convidado a ser cuidador da família <strong>${familyName}</strong> no Medcare.</p>
      <p>Seu código de acesso é:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
      <p>Ele expira em ${ttlMinutes} minutos.</p>
      <p>Se você não esperava este convite, ignore este e-mail.</p>
    `,
  })
}
