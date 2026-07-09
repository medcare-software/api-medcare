import nodemailer, { type Transporter } from 'nodemailer'

import { env } from '../../config/env.js'
import { AppError } from '../errors/index.js'

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
      // Porta 465 usa SSL implícito (secure acima); provedores em 587 (Gmail/Workspace
      // incluso) esperam STARTTLS explícito — sem isso alguns rejeitam a conexão em vez
      // de fazer upgrade automático.
      requireTLS: env.SMTP_PORT === 587,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  }
  return transporter
}

/**
 * Envia e-mail transacional via SMTP. Sem SMTP_HOST/USER/PASS configurados (dev
 * local sem credenciais reais), loga o conteúdo no console em vez de falhar —
 * nunca bloqueia o fluxo de "esqueci a senha"/convite por falta de config local.
 * Com credenciais configuradas, uma falha real de envio (auth, conexão, etc.)
 * propaga como EMAIL_SEND_FAILED em vez de estourar cru — quem chama sendMail()
 * precisa saber que o e-mail não saiu, não assumir sucesso silenciosamente.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const client = getTransporter()

  if (!client) {
    console.warn(
      `[mail] SMTP não configurado — e-mail não enviado de verdade.\n  Para: ${input.to}\n  Assunto: ${input.subject}\n  Conteúdo: ${input.text}`,
    )
    return
  }

  try {
    const info = await client.sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    console.warn(
      `[mail] SMTP resposta: ${info.response} | accepted: ${JSON.stringify(info.accepted)} | rejected: ${JSON.stringify(info.rejected)} | messageId: ${info.messageId}`,
    )
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
    console.error(`[mail] Falha ao enviar e-mail via SMTP para ${input.to}: ${cause}`)
    throw new AppError({
      code: 'EMAIL_SEND_FAILED',
      message: 'Não foi possível enviar o e-mail. Tente novamente em instantes.',
    })
  }
}
