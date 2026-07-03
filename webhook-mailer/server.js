const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !data.run_id) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    const runUrl = `${process.env.MAXUN_PUBLIC_URL || 'http://localhost:5173'}/runs/${data.run_id}`;

    let emailBody = `Scrape completed for: ${data.robot_name || 'Unknown'}\n`;
    emailBody += `Status: ${data.status}\n`;
    emailBody += `View results: ${runUrl}\n`;

    if (data.extracted_data) {
      emailBody += `\n--- Extracted Data ---\n`;
      emailBody += JSON.stringify(data.extracted_data, null, 2);
    }

    if (data.binaryOutput && Object.keys(data.binaryOutput).length > 0) {
      emailBody += `\n--- Screenshots/Files ---\n`;
      Object.entries(data.binaryOutput).forEach(([key, url]) => {
        emailBody += `${key}: ${url}\n`;
      });
    }

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.TO_EMAIL,
      subject: `[Maxun] Scrape: ${data.robot_name || 'Robot'} - ${data.status}`,
      text: emailBody
    });

    console.log(`[${new Date().toISOString()}] Email sent for run ${data.run_id} (${data.robot_name})`);
    res.json({ sent: true, run_id: data.run_id });
  } catch (err) {
    console.error('Email send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'webhook-mailer' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook mailer listening on port ${PORT}`);
  console.log(`Ready to receive webhooks at http://0.0.0.0:${PORT}/webhook`);
});
