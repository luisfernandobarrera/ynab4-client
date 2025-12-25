import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Empty stub for Node.js modules not used in browser
const emptyModule = path.resolve(__dirname, 'src/lib/utils/empty-module.js');

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 8742
	},
	optimizeDeps: {
		include: ['ynab-library', 'path-browserify'],
	},
	resolve: {
		alias: {
			// Polyfills for Node.js modules
			'path': path.resolve(__dirname, 'node_modules/path-browserify'),
			// Stub Node.js modules not available in browser
			'fs': emptyModule,
			'crypto': emptyModule,
			'util': emptyModule
		}
	},
	define: {
		// Polyfill for Node.js process used by some libraries
		'process.env': {},
		'process.browser': true,
		'process.version': '"v18.0.0"',
		'global': 'globalThis'
	},
	build: {
		commonjsOptions: {
			transformMixedEsModules: true
		}
	}
});
