#!/usr/bin/env node
// ══════════════════════════════════════════════════
//  EDUTRACK — Iniciador rápido
//  Doble clic en Windows o: node start.js
// ══════════════════════════════════════════════════
const { execSync, spawn } = require('child_process');
const path = require('path');
const os   = require('os');

console.log('\n Assisto — Sistema de Asistencia');
console.log('════════════════════════════════════════\n');

// Verificar node_modules
try {
  require('express');
} catch {
  console.log('Instalando dependencias (solo la primera vez)...\n');
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
}

// Iniciar servidor
const server = spawn('node', ['server/index.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

// Abrir navegador automáticamente
setTimeout(() => {
  const url = 'http://localhost:3000';
  const open = os.platform() === 'win32' ? 'start' : os.platform() === 'darwin' ? 'open' : 'xdg-open';
  try { execSync(`${open} ${url}`); } catch {}
  console.log(`\n Navegador abierto en ${url}`);
  console.log('   Presiona Ctrl+C para detener el servidor.\n');
}, 1500);

process.on('SIGINT', () => { server.kill(); process.exit(0); });
