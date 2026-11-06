import { defineConfig } from 'vitest/config';

// Firestore security-rules tests. They need the Firestore emulator, so they are
// kept out of the default `npm test` run; use `npm run test:rules`.
export default defineConfig({
    test: {
        include: ['tests/rules/**/*.rules-test.ts'],
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 60000,
        fileParallelism: false,
    },
});
