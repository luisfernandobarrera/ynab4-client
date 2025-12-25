import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 8742
	},
	define: {
		// Polyfill for Node.js process used by some libraries
		'process.env': {},
		'process.browser': true,
		'process.version': '"v18.0.0"'
	}
});
