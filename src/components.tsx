import { cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
export type IconName = 'bowl' | 'today' | 'calendar' | 'shop' | 'chart' | 'settings' | 'plus' | 'arrow' | 'check' | 'clock' | 'close' | 'download' | 'leaf';
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    bowl: <><path d="M3 12h18c-.6 6-3.5 9-9 9s-8.4-3-9-9Z"/><path d="M8 8C5 5 10 4 8 1M12 8c-3-3 2-4 0-7m4 7c-3-3 2-4 0-7"/></>,
    today: <><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h4v3H7Z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18m-12 4h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01"/></>,
    shop: <><path d="m4 3-2 6c0 3 4 4 5 1 2 3 5 3 7 0 1 3 7 3 8-1l-2-6ZM4 13v8h16v-8m-10 8v-6h4v6"/></>,
    chart: <><path d="M4 3v18h17M8 15l4-5 4 3 5-7"/><path d="M8 18v-2m4 2v-5m4 5v-2m4 2v-8"/></>,
    settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, arrow: <path d="m9 5 7 7-7 7M4 12h12"/>,
    check: <path d="m5 12 5 5L20 7"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>, download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
    leaf: <><path d="M20 3C8 1 1 8 5 16c8 6 16-1 15-13ZM5 20l10-12"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function BowlArt() {
  return <svg className="bowl-art" viewBox="0 0 260 220" fill="none" aria-hidden="true"><ellipse cx="132" cy="182" rx="92" ry="11" fill="#bd7750" opacity=".10"/><path d="M43 111h178c-6 54-30 77-89 77s-83-23-89-77Z" fill="#fef9ed"/><path d="M43 111c-3 10 39 19 89 19s91-9 89-19-40-19-89-19-89 9-89 19Z" fill="#fffdf5"/><ellipse cx="132" cy="111" rx="77" ry="12" fill="#d7be89"/><path d="M77 109c8-19 14-24 27-12 6-21 29-19 38-3 14-15 34-7 35 8 15-4 24 1 26 10-28 12-95 11-126-3Z" fill="#fff7db"/><path d="M157 102c-4-23 19-34 33-10-1 12-10 21-23 23" fill="#de8260"/><path d="M76 107c-11-17 4-30 18-22 17-5 27 13 14 23" fill="#759681"/><path d="m84 93 12 18m-9-11 12-7" stroke="#c8d5b4" strokeWidth="3" strokeLinecap="round"/><path d="m163 58 61-36m-54 44 61-36" stroke="#806047" strokeWidth="5" strokeLinecap="round"/><path d="M102 65c-12-15 12-21 2-37m27 37c-12-15 12-21 2-37" stroke="#be9b72" strokeWidth="4" strokeLinecap="round" opacity=".6"/><path d="M69 144c12 15 25 21 43 23" stroke="#f0e4d0" strokeWidth="5" strokeLinecap="round"/></svg>;
}
export function Modal({ title, children, close, wide = false, notice }: { title: string; children: ReactNode; close: () => void; wide?: boolean; notice?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const el = ref.current!; const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    const cancel = (event: Event) => { event.preventDefault(); closeRef.current(); };
    el.addEventListener('cancel', cancel);
    return () => { el.removeEventListener('cancel', cancel); el.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="modal-title">
    <div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" type="button" onClick={close} aria-label="关闭"><Icon name="close" /></button></div>
    {notice && <p className="modal-notice" role="status">{notice}</p>}
    {children}
  </dialog>;
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon name="bowl" size={32}/></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, 'aria-describedby': hint ? `${id}-hint` : undefined }) : children;
  return <div className="field"><label htmlFor={id}>{label}</label>{control}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
export function ErrorText({ value }: { value: string }) { return value ? <p className="form-error" role="alert">{value}</p> : null; }
export const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';
