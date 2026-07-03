import nodemailer, { type Transporter } from 'nodemailer'

import { env } from '../../config/env.js'

type SendMailInput = {
  to: string
  subject: string
  html: string
  text: string
}

let transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  }
  return transporter
}

/**
 * Envia e-mail transacional via SMTP. Sem SMTP_HOST/USER/PASS configurados (dev
 * local sem credenciais reais), loga o conteúdo no console em vez de falhar —
 * nunca bloqueia o fluxo de "esqueci a senha"/convite por falta de config local.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const client = getTransporter()

  if (!client) {
    console.warn(
      `[mail] SMTP não configurado — e-mail não enviado de verdade.\n  Para: ${input.to}\n  Assunto: ${input.subject}\n  Conteúdo: ${input.text}`,
    )
    return
  }

  await client.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })
}
