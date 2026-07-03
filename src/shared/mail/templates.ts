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
