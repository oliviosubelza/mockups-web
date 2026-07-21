/**
 * @keel/platform — primitivas agnósticas de la Capa 1 (ver .claude/ARCHITECTURE.md §14).
 * Todo lo que vive acá es TS puro, sin dependencias del negocio ni del framework de UI.
 */
export * from './lifecycle';
export * from './event';
export * from './eventbus';
export * from './contextkey';
export * from './commands';
export * from './menu';
export * from './tools';
export * from './contributions';
export * from './plugin';
export * from './rpc';
