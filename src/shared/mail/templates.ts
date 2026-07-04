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
