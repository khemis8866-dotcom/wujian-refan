import { emptyData, validateData, type Data, type Preferences } from './domain';

const DB_NAME = 'wujian-refan-local';
let database: Promise<IDBDatabase> | undefined;
function openDB() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('local', { keyPath: 'key' }); };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(new Error('无法打开本地数据库，请使用普通 Safari 窗口并允许网站保存数据。')); };
    request.onblocked = () => { database = undefined; reject(new Error('本地数据库被其他窗口占用，请关闭其他窗口后重试。')); };
  });
  return database;
}
export async function readData(): Promise<Data> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('local', 'readonly');
    const request = transaction.objectStore('local').get('data');
    transaction.oncomplete = () => {
      try { resolve(request.result ? validateData(request.result.value) : emptyData()); }
      catch { reject(new Error('本地数据格式异常。请先重试；可从有效的 JSON 备份恢复，不会自动覆盖原数据。')); }
    };
    transaction.onerror = () => reject(new Error('读取本地数据失败，请重试。'));
  });
}
export async function writeData(value: Data): Promise<void> {
  validateData(value);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local', 'readwrite');
    tx.objectStore('local').put({ key: 'data', value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('保存失败，可能是存储空间不足。请释放空间或导出备份后重试。'));
    tx.onabort = () => reject(new Error('保存未完成，请重试；原数据未被部分覆盖。'));
  });
}
export function readPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem('lunch-preferences') || '{}');
    return { safety: Number.isInteger(p.safety) && p.safety >= 0 && p.safety <= 120 ? p.safety : 5,
      lunchTime: typeof p.lunchTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.lunchTime) ? p.lunchTime : '12:15' };
  } catch { return { safety: 5, lunchTime: '12:15' }; }
}
export function writePreferences(p: Preferences) { localStorage.setItem('lunch-preferences', JSON.stringify(p)); }
