#!/usr/bin/env node
// Applies Polo's Supabase Auth settings through the Management API:
//   - accounts confirm their email (mailer_autoconfirm off), so an anonymous
//     device that sets an email must type the code before it becomes an account
//   - 6-digit codes in every email, next to the link: the code keeps the flow
//     inside the installed app (a link from Mail opens Safari on iOS)
//   - Spanish subjects and templates
// SMTP fields are never sent (a partial SMTP patch resets its siblings).
//   node scripts/auth-config.mjs            → apply
//   node scripts/auth-config.mjs --check    → print the current values only
import { loadEnv } from './lib/env.mjs'

loadEnv()
const PAT = process.env.SUPABASE_PAT
const REF = process.env.SUPABASE_PROJECT_REF
if (!PAT || !REF) {
  console.error('Missing SUPABASE_PAT / SUPABASE_PROJECT_REF')
  process.exit(1)
}
const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`
const headers = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' }

const wrap = (title, body) => `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 20px;color:#1c211d;line-height:1.5">
<p style="font-size:13px;letter-spacing:.04em;margin:0 0 20px;color:#4f5a53">POLO</p>
<h1 style="font-size:22px;font-weight:600;margin:0 0 12px">${title}</h1>
${body}
<p style="font-size:12px;color:#4f5a53;margin:28px 0 0">Si no fuiste tú, ignora este correo.</p>
</div>`
const code = `<p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:8px 0 20px;font-variant-numeric:tabular-nums">{{ .Token }}</p>`

const settings = {
  mailer_autoconfirm: false,
  mailer_otp_length: 6,
  mailer_otp_exp: 3600,
  rate_limit_email_sent: 60,
  mailer_subjects_confirmation: 'Tu código de Polo: {{ .Token }}',
  mailer_templates_confirmation_content: wrap('Confirma tu correo', `<p style="margin:0">Escribe este código en Polo para confirmar tu correo:</p>${code}<p style="font-size:14px;margin:0">O abre este enlace en tu teléfono: <a href="{{ .ConfirmationURL }}">confirmar mi correo</a>.</p>`),
  mailer_subjects_magic_link: 'Tu código para entrar a Polo: {{ .Token }}',
  mailer_templates_magic_link_content: wrap('Entra a Polo', `<p style="margin:0">Escribe este código en Polo para entrar:</p>${code}<p style="font-size:14px;margin:0">O abre este enlace en tu teléfono: <a href="{{ .ConfirmationURL }}">entrar</a>.</p>`),
  mailer_subjects_email_change: 'Tu código para guardar tu perfil: {{ .Token }}',
  mailer_templates_email_change_content: wrap('Guarda tu perfil', `<p style="margin:0">Escribe este código en Polo para confirmar {{ .NewEmail }}:</p>${code}<p style="font-size:14px;margin:0">O abre este enlace en tu teléfono: <a href="{{ .ConfirmationURL }}">confirmar</a>.</p>`),
  mailer_subjects_recovery: 'Cambia tu contraseña de Polo',
  mailer_templates_recovery_content: wrap('Nueva contraseña', `<p style="margin:0">Abre este enlace en tu teléfono para elegir una contraseña nueva:</p><p style="margin:12px 0 0"><a href="{{ .ConfirmationURL }}">cambiar contraseña</a></p><p style="font-size:14px;margin:16px 0 0">Código: <strong>{{ .Token }}</strong></p>`),
  mailer_subjects_reauthentication: '{{ .Token }} es tu código de Polo',
  mailer_templates_reauthentication_content: wrap('Tu código', `<p style="margin:0">Escribe este código en Polo:</p>${code}`),
  mailer_subjects_invite: 'Te invitaron a Polo',
  mailer_templates_invite_content: wrap('Te invitaron a Polo', `<p style="margin:0">Abre este enlace para crear tu cuenta:</p><p style="margin:12px 0 0"><a href="{{ .ConfirmationURL }}">aceptar invitación</a></p>`),
}

const show = (d) => {
  const keys = ['mailer_autoconfirm', 'mailer_otp_length', 'rate_limit_email_sent', 'mailer_subjects_confirmation', 'mailer_subjects_magic_link', 'mailer_subjects_email_change', 'smtp_host', 'smtp_sender_name', 'smtp_admin_email', 'smtp_port', 'smtp_user']
  for (const k of keys) console.log(`  ${k} = ${JSON.stringify(d[k])}`)
  console.log(`  smtp_pass = ${d.smtp_pass ? '(set)' : '(missing!)'}`)
}

if (process.argv.includes('--check')) {
  show(await (await fetch(url, { headers })).json())
  process.exit(0)
}
const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(settings) })
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`)
  process.exit(1)
}
console.log('applied; now:')
show(await (await fetch(url, { headers })).json())
