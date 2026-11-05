const nodemailer = require('nodemailer');

let transporter = null;

/**
 * A working transport needs a host, a user and a password. Anything less means
 * "print it to the console" — that is what keeps the reset flow usable in a
 * local demo, where Gmail credentials are usually absent.
 */
function getTransporter() {
  if (transporter !== null) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    transporter = false;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass }
  });
  return transporter;
}

function printMail({ to, subject, text, html }) {
  console.log('\n--- mail (not delivered, printed instead) ---');
  console.log(`to      : ${to}`);
  console.log(`subject : ${subject}`);
  console.log(text || html);
  console.log('--- end mail ---\n');
}

/**
 * Sends mail when SMTP is configured, otherwise prints it to the server console
 * so password resets and report sharing still work in a local demo.
 * A failed send degrades the same way rather than failing the request.
 * Returns `{ delivered, reason? }` so callers can tell the user which path ran.
 */
async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();

  if (!tx) {
    printMail({ to, subject, text, html });
    return { delivered: false, reason: 'not_configured' };
  }

  try {
    await tx.sendMail({
      from: process.env.MAIL_FROM || 'Spendify <no-reply@campuscoin.app>',
      to,
      subject,
      text,
      html
    });
    return { delivered: true };
  } catch (err) {
    // A wrong app password or a blocked sign-in must not take the endpoint down.
    console.error(`  mail       : send failed (${err.code || err.message})`);
    printMail({ to, subject, text, html });
    return { delivered: false, reason: 'send_failed', error: err.message };
  }
}

module.exports = { sendMail };
