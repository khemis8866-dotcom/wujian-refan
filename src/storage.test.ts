import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { readData, writeData } from './storage';
import { emptyData } from './domain';
import { fixture } from './fixtures';
beforeEach(async () => { await writeData(emptyData()); });
it('IndexedDB 完整保存并读取关联数据', async () => { const d = fixture(); await writeData(d); expect(await readData()).toEqual(d); });
it('无效导入在写入前拒绝，不破坏已有数据', async () => { const d = fixture(); await writeData(d); await expect(writeData({ ...d, meals: [] })).rejects.toThrow(); expect(await readData()).toEqual(d); });
it('清空后只得到空数据，不残留菜单和历史', async () => { await writeData(fixture()); await writeData(emptyData()); expect(await readData()).toEqual(emptyData()); });
