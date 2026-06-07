const nodemailer = require('nodemailer');

// Transporter — configured via env vars.
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in Render environment.
// Supports any SMTP provider (Gmail, SendGrid, Mailgun, etc.)
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null; // email not configured — skip silently
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

const FROM = process.env.SMTP_FROM || 'GangFlow <noreply@inkdyno.com>';
const STORE_NAME = process.env.STORE_NAME || 'GangFlow / inkdyno.com';

// Status-specific email templates
const STATUS_TEMPLATES = {
  Ordered: (order) => ({
    subject: `✅ Order Received — #${order.orderNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a2e">Your order is confirmed! 🎉</h2>
        <p>Hi ${order.customerName || 'there'},</p>
        <p>We received your DTF gang sheet order and it's now in our queue.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Order #</td>
              <td style="padding:8px">${order.orderNumber}</td></tr>
          <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Amount</td>
              <td style="padding:8px">$${(order.totalAmount || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Status</td>
              <td style="padding:8px;color:#7c3aed">Ordered ✓</td></tr>
        </table>
        <p style="color:#666;font-size:13px">You'll receive another email when your order is shipped.</p>
        <p style="color:#666;font-size:13px">${STORE_NAME}</p>
      </div>`,
  }),
  Processing: (order) => ({
    subject: `🖨️ Your order is being processed — #${order.orderNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a2e">Your DTF sheets are being printed! 🖨️</h2>
        <p>Hi ${order.customerName || 'there'},</p>
        <p>Great news — your order <strong>#${order.orderNumber}</strong> is now in production.</p>
        <p>We'll notify you once it ships.</p>
        <p style="color:#666;font-size:13px">${STORE_NAME}</p>
      </div>`,
  }),
  Completed: (order) => ({
    subject: `📦 Your order has shipped — #${order.orderNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a2e">Your order is on its way! 📦</h2>
        <p>Hi ${order.customerName || 'there'},</p>
        <p>Your DTF gang sheet order <strong>#${order.orderNumber}</strong> has been completed and shipped.</p>
        <p>Thank you for choosing ${STORE_NAME}!</p>
        <p style="color:#666;font-size:13px">${STORE_NAME}</p>
      </div>`,
  }),
  Cancelled: (order) => ({
    subject: `Order Cancelled — #${order.orderNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a2e">Order Cancelled</h2>
        <p>Hi ${order.customerName || 'there'},</p>
        <p>Your order <strong>#${order.orderNumber}</strong> has been cancelled.</p>
        <p>If this was a mistake, please contact us.</p>
        <p style="color:#666;font-size:13px">${STORE_NAME}</p>
      </div>`,
  }),
};

/**
 * Send a status-change email to the customer.
 * Silently skips if email is not configured or no customer email exists.
 */
async function sendStatusEmail(order, newStatus) {
  try {
    const mailer = getTransporter();
    if (!mailer) return; // SMTP not configured

    const customerEmail = order.customerEmail;
    if (!customerEmail) return; // no email stored — skip

    const template = STATUS_TEMPLATES[newStatus];
    if (!template) return; // no template for this status — skip

    const { subject, html } = template(order);
    await mailer.sendMail({ from: FROM, to: customerEmail, subject, html });
    console.log(`[email] Sent "${newStatus}" email to ${customerEmail} for order ${order.orderNumber}`);
  } catch (err) {
    console.warn('[email] Failed to send status email:', err.message);
    // Never throw — email failure must not break the status update
  }
}

module.exports = { sendStatusEmail };
