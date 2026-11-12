/**
 * Tìm kiếm tiếng Việt không phân biệt dấu và hoa/thường trên PostgreSQL.
 *
 * LIKE trên PostgreSQL phân biệt dấu ("mu cang" không khớp "Mù Cang"). {@link unaccentSql} bỏ dấu phía cột bằng
 * translate() thuần SQL (không cần extension unaccent); phía tham số bỏ dấu bằng {@link normalize} trong JS, nên hai vế
 * luôn cùng dạng "chữ thường, không dấu".
 */

/** Chữ gốc và các chữ có dấu (dạng dựng sẵn NFC) quy về nó. Chữ hoa được sinh tự động. */
const LETTER_GROUPS: Array<[string, string]> = [
  ['a', 'àáảãạăằắẳẵặâầấẩẫậ'],
  ['e', 'èéẻẽẹêềếểễệ'],
  ['i', 'ìíỉĩị'],
  ['o', 'òóỏõọôồốổỗộơờớởỡợ'],
  ['u', 'ùúủũụưừứửữự'],
  ['y', 'ỳýỷỹỵ'],
  ['d', 'đ'],
];

/** Dấu tổ hợp (dữ liệu gõ ở dạng NFD): móc, nặng, huyền, sắc, ngã, hỏi, mũ, trăng. Đặt cuối chuỗi nguồn nên bị xóa. */
const COMBINING_MARKS = '\u031b\u0323\u0300\u0301\u0303\u0309\u0302\u0306';

const TRANSLATE_FROM = LETTER_GROUPS.map(([, accented]) => accented + accented.toUpperCase()).join('') + COMBINING_MARKS;
const TRANSLATE_TO = LETTER_GROUPS.map(([base, accented]) => base.repeat((accented + accented.toUpperCase()).length)).join('');

/** Biểu thức SQL bỏ dấu tiếng Việt rồi chuyển chữ thường cho một cột / biểu thức. */
export function unaccentSql(column: string): string {
  return `lower(translate(${column}, '${TRANSLATE_FROM}', '${TRANSLATE_TO}'))`;
}

/** Chuẩn hóa từ khóa phía JS: bỏ dấu (kể cả đ/Đ), chữ thường, gộp khoảng trắng. */
export function normalize(value: string | null | undefined): string {
  if (value == null) return '';
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Mẫu LIKE "chứa từ khóa" đã chuẩn hóa và thoát \ % _ (ký tự thoát là \). Trả về null khi từ khóa rỗng sau chuẩn hóa để
 * bên gọi bỏ qua điều kiện.
 */
export function containsPattern(keyword: string | null | undefined): string | null {
  const normalized = normalize(keyword);
  if (!normalized) return null;
  return `%${normalized.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

/** Điều kiện SQL "unaccent(cột) LIKE $n ESCAPE '\\'" với tham số đã là mẫu từ {@link containsPattern}. */
export function likeSql(column: string, placeholder: string): string {
  return `${unaccentSql(column)} LIKE ${placeholder} ESCAPE '\\'`;
}
