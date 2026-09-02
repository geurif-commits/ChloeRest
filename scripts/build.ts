/**
 * @file Build Script
 * Compiles TypeScript sources to JavaScript
 */

import { execSync } from 'child_process';

const args = process.argv.slice(2);
const env = args[0] || process.env.NODE_ENV || 'production';

console.log(`Building for environment: ${env}`);

try {
  console.log('Removing old dist directory...');
  execSync('rm -rf dist', { stdio: 'inherit' });

  console.log('Compiling TypeScript...');
  execSync('tsc --build', { stdio: 'inherit' });

  console.log('Build complete!');
  process.exit(0);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
