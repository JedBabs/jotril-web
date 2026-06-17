import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = pathResolve(projectRoot, 'src');

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
        const relativePath = specifier.slice(2);
        const target = pathResolve(srcRoot, relativePath.endsWith('.js') ? relativePath : `${relativePath}.js`);
        return nextResolve(pathToFileURL(target).href, context);
    }

    return nextResolve(specifier, context);
}
