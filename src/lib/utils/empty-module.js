/**
 * Empty stub module for Node.js built-ins not used in browser
 * 
 * This provides empty exports for modules like 'fs', 'crypto', etc.
 * that are imported by ynab-library but not actually used in browser context.
 */

// fs promises stub
export const promises = {
  readFile: async () => { throw new Error('fs not available in browser') },
  writeFile: async () => { throw new Error('fs not available in browser') },
  readdir: async () => { throw new Error('fs not available in browser') },
  mkdir: async () => { throw new Error('fs not available in browser') },
  stat: async () => { throw new Error('fs not available in browser') },
  unlink: async () => { throw new Error('fs not available in browser') },
  access: async () => { throw new Error('fs not available in browser') },
}

// crypto stub
export const randomBytes = () => { throw new Error('crypto not available in browser') }
export const createHash = () => { throw new Error('crypto not available in browser') }

// util stub  
/** @param {Function} fn */
export const promisify = (fn) => fn

// Default export
export default {
  promises,
  randomBytes,
  createHash,
  promisify
}

