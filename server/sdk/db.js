// sdk/db — описание схемы платформы (tgcloud/schema.js). На своём сервере схема создаётся миграциями
// игры (lib/ddl*.js), поэтому здесь только пустые заглушки, чтобы schema.js загружался.
const col = () => { const c = { primaryKey: () => c, notNull: () => c, default: () => c, unique: () => c, deprecated: () => c }; return c; };
export const table = (name, cols) => ({ name, cols });
export const integer = col, text = col, real = col, blob = col;
export const sql = (s) => s;
export const eq = () => null;
