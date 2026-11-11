/** Thoát ký tự đặc biệt của LIKE (`\`, `%`, `_`); dùng cùng `ESCAPE '\'`. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
