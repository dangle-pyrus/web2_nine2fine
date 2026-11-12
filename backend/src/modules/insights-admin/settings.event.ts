import type { Db } from '../../lib/sql';
import type { SettingChange } from './settings.diff';

/**
 * Nhật ký đổi cài đặt (BR-SET-09): CHỈ INSERT / SELECT. Gói trong một đối tượng để test giả lỗi (`vi.spyOn`) chứng minh
 * giao dịch rollback cả `UPDATE` (AC-SET-09 / T-SET-10).
 */
export interface SettingsEventInput {
  at: Date;
  actor: { id: string; name: string };
  changes: SettingChange[];
}

export async function insertSettingsEvent(tx: Db, e: SettingsEventInput): Promise<void> {
  await tx.storeSettingsEvent.create({
    data: { at: e.at, actorUserId: e.actor.id, actorName: e.actor.name.slice(0, 100), actorRole: 'admin', changes: e.changes as unknown as object },
  });
}

export const settingsEventWriter = { insert: insertSettingsEvent };
