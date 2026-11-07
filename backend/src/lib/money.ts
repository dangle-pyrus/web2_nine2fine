/** Làm tròn xuống tới bội số của `step`. */
export const floorTo = (n: number, step: number): number => Math.floor(n / step) * step;

/**
 * Chia `total` cho các mục theo tỷ lệ trọng số (BR-VOU-06): phần mục i = floor(total x w_i / Σw);
 * phần dư cộng vào mục có trọng số lớn nhất (hoà: `id` nhỏ nhất). Tổng phần chia = total.
 */
export function allocateByWeight<T extends { id: string; weight: number }>(
  total: number,
  items: readonly T[],
): Array<{ id: string; amount: number }> {
  const sum = items.reduce((a, i) => a + i.weight, 0);
  if (items.length === 0 || sum <= 0 || total <= 0) return items.map((i) => ({ id: i.id, amount: 0 }));
  const parts = items.map((i) => ({ id: i.id, amount: Math.floor((total * i.weight) / sum), weight: i.weight }));
  const remainder = total - parts.reduce((a, p) => a + p.amount, 0);
  if (remainder > 0) {
    const target = [...parts].sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))[0];
    target.amount += remainder;
  }
  return parts.map(({ id, amount }) => ({ id, amount }));
}
