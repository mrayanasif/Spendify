/**
 * Branded HTML email templates for Spendify.
 * All functions return { subject, html, text } ready for sendMail().
 */

const PRIMARY = '#BE123C';
const PRIMARY_DARK = '#881337';
const SOFT_ROSE = '#FFE4E6';
const CHARCOAL = '#1F2937';
const MUTED = '#6B7280';
const WHITE = '#FFFFFF';

function baseLayout(bodyContent, previewText = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spendify</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${previewText}</div>` : ''}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F9FAFB">
    <tr><td style="padding:32px 16px">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;margin:0 auto">

        <!-- Header -->
        <tr>
          <td style="background:${PRIMARY_DARK};border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
            <span style="font-size:22px;font-weight:700;color:${WHITE};letter-spacing:-0.5px">
              &#9733; Spendify
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:${WHITE};padding:32px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">
            ${bodyContent}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F3F4F6;border-radius:0 0 12px 12px;border:1px solid #E5E7EB;border-top:none;padding:20px 32px;text-align:center">
            <p style="margin:0;font-size:12px;color:${MUTED}">
              &copy; ${new Date().getFullYear()} Spendify &mdash; Student Finance Tracker
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#9CA3AF">
              If you did not request this email, you can safely ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(label, href) {
  return `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto">
    <tr>
      <td style="border-radius:8px;background:${PRIMARY}">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:${WHITE};text-decoration:none;border-radius:8px;font-family:'Segoe UI',Arial,sans-serif">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

/* ----------------------------------------------------------------
   1. Password reset request email
---------------------------------------------------------------- */
function resetPasswordEmail(name, resetLink, expiryMinutes = 15) {
  const subject = 'Reset your Spendify password';

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;font-size:22px;color:${CHARCOAL}">Reset your password</h2>
    <p style="margin:0 0 16px;font-size:15px;color:${MUTED}">Hi ${escHtml(name)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:${CHARCOAL};line-height:1.6">
      We received a request to reset the password for your Spendify account.
      Click the button below to choose a new password.
    </p>

    ${btn('Reset password', resetLink)}

    <div style="background:${SOFT_ROSE};border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0;font-size:13px;color:${PRIMARY_DARK};font-weight:600">
        &#9719; This link expires in ${expiryMinutes} minutes.
      </p>
    </div>

    <p style="margin:16px 0 0;font-size:13px;color:${MUTED};line-height:1.6">
      If the button doesn't work, paste this link into your browser:<br/>
      <a href="${resetLink}" style="color:${PRIMARY};word-break:break-all">${resetLink}</a>
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:${MUTED}">
      If you didn't request a password reset, no action is needed &mdash; your account is safe.
    </p>
  `, 'Reset your Spendify password — link expires in ' + expiryMinutes + ' minutes');

  const text =
    `Hi ${name},\n\n` +
    `We received a request to reset the password for your Spendify account.\n\n` +
    `Use the link below to set a new password. It expires in ${expiryMinutes} minutes.\n\n` +
    `${resetLink}\n\n` +
    `If you didn't request a password reset, you can safely ignore this email — your account is unchanged.\n\n` +
    `— Spendify`;

  return { subject, html, text };
}

/* ----------------------------------------------------------------
   2. Password changed confirmation email
---------------------------------------------------------------- */
function passwordChangedEmail(name) {
  const subject = 'Your Spendify password was changed';

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;font-size:22px;color:${CHARCOAL}">Password changed</h2>
    <p style="margin:0 0 16px;font-size:15px;color:${MUTED}">Hi ${escHtml(name)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:${CHARCOAL};line-height:1.6">
      This is a confirmation that the password for your Spendify account was just changed.
    </p>
    <div style="background:${SOFT_ROSE};border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0;font-size:13px;color:${PRIMARY_DARK};font-weight:600">
        &#9888; If this wasn't you, contact support immediately.
      </p>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:${MUTED};line-height:1.6">
      You can now sign in with your new password. If you did not make this change,
      please reset your password right away or contact your campus administrator.
    </p>
  `, 'Your Spendify password has been changed');

  const text =
    `Hi ${name},\n\n` +
    `This is a confirmation that the password for your Spendify account was just changed.\n\n` +
    `If you did not make this change, please reset your password immediately or contact support.\n\n` +
    `— Spendify`;

  return { subject, html, text };
}

/** Basic HTML entity escaping to prevent injection into email templates. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { resetPasswordEmail, passwordChangedEmail };

