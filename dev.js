// Dev launcher: makes Node trust the machine's root CAs (incl. a corporate SSL-inspection CA)
// before starting the server, so firebase-admin can complete its TLS handshake to Google.
// NODE_EXTRA_CA_CERTS must be set BEFORE Node starts, so we set it here and re-spawn server.js.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const env = { ...process.env };
const caBundle = path.join(__dirname, 'certs', 'ca-bundle.pem');
if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(caBundle)) {
  env.NODE_EXTRA_CA_CERTS = caBundle;
  console.log(`[dev] NODE_EXTRA_CA_CERTS -> ${caBundle}`);
} else if (!fs.existsSync(caBundle)) {
  console.log('[dev] certs/ca-bundle.pem not found — run npm run gen-certs (see README).');
}

const child = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
