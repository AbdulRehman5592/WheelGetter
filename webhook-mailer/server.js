const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
// Accept large webhook payload (screenshots, data) but email only minimal info
app.use(express.json({ limit: '50mb' }));

// Log startup
console.log('=== Webhook Mailer Starting ===');
console.log('SMTP Host:', process.env.SMTP_HOST);
console.log('SMTP Port:', process.env.SMTP_PORT);
console.log('SMTP User:', process.env.SMTP_USER);
console.log('To Email:', process.env.TO_EMAIL);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('=== SMTP Authentication FAILED ===');
    console.error('Error:', error.message);
  } else {
    console.log('=== SMTP Authentication SUCCESS ===');
    console.log('Ready to send emails');
  }
});

// Track processed run IDs to prevent duplicates
const processedRuns = new Set();

// Helper to generate HTML email with better formatting
function generateHtmlEmail(robotName, status, runUrl, capturedTexts, capturedLists, rawOutput) {
  let html = `
    <h2>Maxun Scrape Results</h2>
    <p><strong>Robot:</strong> ${robotName || 'Unknown'}</p>
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>View Results:</strong> <a href="${runUrl}">${runUrl}</a></p>
  `;

  if (capturedTexts.length > 0) {
    html += `<h3>Captured Data</h3>`;
    capturedTexts.forEach(text => {
      html += `<pre style="background:#f5f5f5;padding:10px;border-radius:4px;overflow-x:auto;">${JSON.stringify(text, null, 2)}</pre>`;
    });
  }

  if (Object.keys(capturedLists).length > 0) {
    html += `<h3>Captured Lists</h3>`;
    for (const [listName, items] of Object.entries(capturedLists)) {
      html += `<h4>${listName}</h4>`;
      if (Array.isArray(items) && items.length > 0) {
        html += `<table style="border-collapse:collapse;width:100%;max-width:800px;">`;
        const headers = Object.keys(items[0]);
        html += `<tr style="background:#007bff;color:white;">`;
        headers.forEach(h => {
          html += `<th style="padding:8px;border:1px solid #ddd;">${h}</th>`;
        });
        html += `</tr>`;
        items.forEach((item, idx) => {
          html += `<tr style="${idx % 2 === 0 ? 'background:#f9f9f9' : ''}">`;
          headers.forEach(h => {
            html += `<td style="padding:8px;border:1px solid #ddd;">${item[h] || ''}</td>`;
          });
          html += `</tr>`;
        });
        html += `</table>`;
      }
    }
  }

  if (rawOutput) {
    html += `<h3>Raw Output</h3><pre style="background:#f5f5f5;padding:10px;border-radius:4px;overflow-x:auto;">${rawOutput}</pre>`;
  }

  html += `<hr><small>Sent by Maxun Webhook Mailer</small>`;
  return html;
}


app.post('/webhook', async (req, res) => {
  try {
    const { data } = req.body;

    console.log('\n=== Webhook Received ===');
    console.log('Event:', req.body.event_type);

    // Handle both camelCase (runId) and snake_case (run_id)
    const runId = data?.runId || data?.run_id;
    const robotName = data?.robotName || data?.robot_name;
    const status = data?.status;

    console.log('Robot:', robotName);
    console.log('Run ID:', runId);
    console.log('Status:', status);

    if (!data || !runId) {
      console.error('Invalid webhook payload - missing run_id');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Idempotency: skip if already processed
    if (processedRuns.has(runId)) {
      console.log('Run already processed, skipping:', runId);
      return res.json({ skipped: true, run_id: runId, reason: 'already processed' });
    }
    processedRuns.add(runId);

    // Cleanup old entries (keep last 1000)
    if (processedRuns.size > 1000) {
      const first = processedRuns.values().next().value;
      processedRuns.delete(first);
    }

    const runUrl = `${process.env.MAXUN_PUBLIC_URL || 'http://localhost:5173'}/runs/${runId}`;

    // Build email body with scraped data
    let emailBody = `Robot: ${robotName || 'Unknown'}
Status: ${status}
View results: ${runUrl}
`;

    // Add captured texts
    const capturedTexts = data.extracted_data?.captured_texts || data.captured_texts || [];
    if (capturedTexts.length > 0) {
      emailBody += `\n=== Captured Data ===\n`;
      capturedTexts.forEach(text => {
        emailBody += `\n${JSON.stringify(text, null, 2)}\n`;
      });
    }

    // Add captured lists (tabular data)
    const capturedLists = data.extracted_data?.captured_lists || data.captured_lists || {};
    if (Object.keys(capturedLists).length > 0) {
      emailBody += `\n=== Captured Lists ===\n`;
      for (const [listName, items] of Object.entries(capturedLists)) {
        emailBody += `\n${listName}:\n`;
        if (Array.isArray(items) && items.length > 0) {
          const headers = Object.keys(items[0]).join(' | ');
          emailBody += `${headers}\n`;
          emailBody += `${'-'.repeat(headers.length)}\n`;
          items.forEach(item => {
            emailBody += `${Object.values(item).join(' | ')}\n`;
          });
        }
      }
    }

    // Add raw output if available
    if (data.output) {
      emailBody += `\n=== Raw Output ===\n${data.output}\n`;
    }

    console.log('Sending email to:', process.env.TO_EMAIL);

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.TO_EMAIL,
      subject: `[Maxun] Scrape: ${robotName || 'Robot'} - ${status}`,
      text: emailBody,
      // Optional: add HTML version for better formatting
      html: generateHtmlEmail(robotName, status, runUrl, capturedTexts, capturedLists, data.output)
    });

    console.log('=== Email Sent Successfully ===');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log(`[${new Date().toISOString()}] Email sent for run ${runId} (${robotName})`);

    res.json({ sent: true, run_id: runId, messageId: info.messageId });

  } catch (err) {
    console.error('=== Email Send FAILED ===');
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'webhook-mailer',
    smtp: 'configured',
    to: process.env.TO_EMAIL
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n=================================');
  console.log('Webhook Mailer running on port', PORT);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`Webhook endpoint: http://0.0.0.0:${PORT}/webhook`);
  console.log('=================================\n');
});
