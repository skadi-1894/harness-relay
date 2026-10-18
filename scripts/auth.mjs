// Backward-compatible command wrapper; the implementation lives in the built TypeScript CLI.
import { main } from '../dist/auth-cli.js';
const args = process.argv.slice(2);
const normalized = ['claude', 'codex'].includes(args[0]) ? args
  : args[0] === 'status' ? ['codex', 'status']
  : ['codex', 'login', args.includes('--device-auth') ? 'device' : 'browser'];
try { await main(normalized); }
catch { console.error('Authentication failed. Check the selected provider/method and terminal output.'); process.exitCode = 1; }
